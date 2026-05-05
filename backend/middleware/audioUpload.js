const path = require('path');
const multer = require('multer');
const storage = multer.memoryStorage();
const audioUpload = multer({

  storage,

  // Set the maximum allowed file size to 25 megabytes
  // 25MB is Groq's own limit for their Whisper transcription API
  // 25 * 1024 * 1024 = 26,214,400 bytes
  limits: { fileSize: 25 * 1024 * 1024 },

  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const allowed = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.flac', '.mp4'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are supported: .mp3, .wav, .m4a, .ogg, .webm, .flac, .mp4'));
    }
  }
});

module.exports = audioUpload;