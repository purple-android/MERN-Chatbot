const path = require('path');
const fs = require('fs');
const os = require('os');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const transcribeAudio = async (req, res) => {
  let tempPath = null;

  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file was uploaded' });
    
    const ext = path.extname(req.file.originalname).toLowerCase();

    tempPath = path.join(os.tmpdir(), `audio_${Date.now()}${ext}`);

    fs.writeFileSync(tempPath, req.file.buffer);

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-large-v3',
      response_format: 'json',
    });

    res.json({ text: transcription.text, filename: req.file.originalname });

  } catch (err) {
    console.error('Transcription error:', err.message);
    res.status(500).json({ error: 'Failed to transcribe the audio file' });

  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
};

module.exports = { transcribeAudio };