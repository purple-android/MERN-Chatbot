const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── WHISPER_BIN ──
const WHISPER_BIN = path.join(__dirname, '..', 'whisper-bin');

const FFMPEG_EXE = process.platform === 'win32'
  ? path.join(WHISPER_BIN, 'ffmpeg.exe')
  : 'ffmpeg';

async function runCommand(command) {
  const { stdout } = await execAsync(command, { timeout: 30000 });
  return stdout.trim();
}


// ── transcribeLocally ──
async function transcribeLocally(buffer, ext) {

  // ── Temporary file paths ──
  let tempInput = null;
  let tempWav   = null;

  try {
    tempInput = path.join(os.tmpdir(), `whisper_in_${Date.now()}${ext}`);
    tempWav   = path.join(os.tmpdir(), `whisper_wav_${Date.now()}.wav`);

    fs.writeFileSync(tempInput, buffer);

    let audioToSend    = buffer;
    let audioFilename  = `audio${ext}`;

    try {
      // ── Build the ffmpeg command ──
      // Breaking it down:
      //   "${FFMPEG_EXE}"        — path to ffmpeg.exe (or just "ffmpeg" on Linux)
      //   -i "${tempInput}"      — input file: the audio we uploaded
      //   -ar 16000              — audio rate: set to 16,000 Hz (16 kHz)
      //   -ac 1                  — audio channels: set to 1 (mono, not stereo)
      //   -y                     — yes: overwrite output file if it already exists
      //   "${tempWav}"           — output file: save the converted audio here
      const ffmpegCmd = `"${FFMPEG_EXE}" -i "${tempInput}" -ar 16000 -ac 1 -y "${tempWav}"`;

      await runCommand(ffmpegCmd);
      audioToSend   = fs.readFileSync(tempWav);
      audioFilename = 'audio.wav';   // tell the server it's a WAV file now
      console.log('[Whisper] ffmpeg conversion succeeded');

    } catch (ffmpegErr) {
      console.log('[Whisper] ffmpeg not available — sending raw audio to whisper-server');
    }

    const healthCheck = new AbortController();
    const healthTimer = setTimeout(() => healthCheck.abort(), 3000);
    try {
      await fetch(`${process.env.LOCAL_WHISPER_URL}`, { signal: healthCheck.signal });
    } finally {
      clearTimeout(healthTimer);
    }

    const blob = new Blob([audioToSend], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, audioFilename);

    const transcribeAbort = new AbortController();
    const transcribeTimer = setTimeout(() => transcribeAbort.abort(), 600000);

    try {
      const response = await fetch(`${process.env.LOCAL_WHISPER_URL}/inference`, {
        method: 'POST',
        body:   formData,
        signal: transcribeAbort.signal
      });

      if (!response.ok) throw new Error(`Whisper server returned status ${response.status}`);

      const data = await response.json();

      return (data.text || '').trim();

    } finally {
      clearTimeout(transcribeTimer);
    }

  } finally {
    if (tempInput && fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (tempWav   && fs.existsSync(tempWav))   fs.unlinkSync(tempWav);
  }
}

// ── transcribeWithGroq ──
async function transcribeWithGroq(buffer, ext) {

  let tempPath = null;

  try {

    tempPath = path.join(os.tmpdir(), `groq_audio_${Date.now()}${ext}`);

    fs.writeFileSync(tempPath, buffer);

    const transcription = await groq.audio.transcriptions.create({

      file: fs.createReadStream(tempPath),

      model: 'whisper-large-v3',

      response_format: 'json',
    });

    return transcription.text;

  } finally {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

// ── transcribeAudio ──
const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file was uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();

    let text   = '';
    let source = '';

    if (process.env.LOCAL_WHISPER_URL) {
      try {
        text   = await transcribeLocally(req.file.buffer, ext);
        source = 'local';
        console.log('[Whisper] ✅ Used LOCAL whisper (your laptop)');
      } catch (localErr) {
        console.log('[Whisper] ⚠️  Local Whisper unavailable:', localErr.message);
        console.log('[Whisper] 🔄 Falling back to Groq API...');
      }
    }

    if (!text) {
      text   = await transcribeWithGroq(req.file.buffer, ext);
      source = 'groq';
      console.log('[Whisper] ✅ Used GROQ Whisper API');
    }

    if (!text) {
      return res.status(400).json({ error: 'No speech detected in the audio file' });
    }

    res.json({ text, filename: req.file.originalname, source });

  } catch (err) {
    console.error('[Whisper] Error:', err.message);
    res.status(500).json({ error: 'Failed to transcribe the audio file' });
  }
};

module.exports = { transcribeAudio };