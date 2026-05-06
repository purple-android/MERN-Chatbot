const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const WHISPER_BIN = path.join(__dirname, '..', 'whisper-bin');
const FFMPEG_EXE = process.platform === 'win32'
  ? path.join(WHISPER_BIN, 'ffmpeg.exe')
  : 'ffmpeg';

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) { reject(error); return; }
      resolve(stdout.trim());
    });
  });
}

async function transcribeLocally(buffer, ext) {

  let tempInput = null;
  let tempWav   = null;

  try {

    tempInput = path.join(os.tmpdir(), `whisper_in_${Date.now()}${ext}`);
    tempWav   = path.join(os.tmpdir(), `whisper_wav_${Date.now()}.wav`);

    fs.writeFileSync(tempInput, buffer);

    let wavBuffer;
    let audioFilename = `audio${ext}`;

    try {
      const ffmpegCmd = `"${FFMPEG_EXE}" -i "${tempInput}" -ar 16000 -ac 1 -y "${tempWav}"`;
      await runCommand(ffmpegCmd, os.tmpdir());
      wavBuffer     = fs.readFileSync(tempWav);
      audioFilename = 'audio.wav';   // conversion succeeded — tell the server it's a WAV
      console.log('[Whisper] ffmpeg conversion succeeded');
    } catch (ffmpegErr) {
      // ffmpeg is not installed or failed — send the original audio file as-is
      // whisper-server will handle it if it's a supported format (mp3, wav, ogg, flac)
      // for unsupported formats (m4a, webm, mp4) the server will return an error,
      // which the caller catches and falls back to Groq
      console.log('[Whisper] ffmpeg not available — sending raw audio to whisper-server');
      wavBuffer = buffer;
    }

    const healthCheck = new AbortController();
    const healthTimer = setTimeout(() => healthCheck.abort(), 3000);
    try {
      await fetch(`${process.env.LOCAL_WHISPER_URL}`, { signal: healthCheck.signal });
    } finally {
      clearTimeout(healthTimer);
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('file', blob, audioFilename);

    const transcribeController = new AbortController();
    const transcribeTimer = setTimeout(() => transcribeController.abort(), 600000);

    try {
      const response = await fetch(`${process.env.LOCAL_WHISPER_URL}/inference`, {
        method: 'POST',
        body: formData,
        signal: transcribeController.signal
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

async function transcribeWithGroq(buffer, ext) {

  let tempPath = null;

  try {

    tempPath = path.join(os.tmpdir(), `groq_audio_${Date.now()}${ext}`);

    fs.writeFileSync(tempPath, buffer);

    const transcription = await groq.audio.transcriptions.create({
      file:            fs.createReadStream(tempPath),
      model:           'whisper-large-v3',
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