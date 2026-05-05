const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const extractText = async (req, res) => {
  try {

    if (!req.file) return res.status(400).json({ error: 'No file was uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();

    let text = '';

    if (ext === '.txt') {
      text = req.file.buffer.toString('utf-8');

    } else if (ext === '.pdf') {
      const result = await pdfParse(req.file.buffer);
      text = result.text;

    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;

    } else if (ext === '.doc') {
      return res.status(400).json({
        error: '.doc format is not supported. Please open the file in Word and save it as .docx, then try again.'
      });
    }

    text = text.trim();

    if (!text) {
      return res.status(400).json({
        error: 'No text could be extracted from this file. It may be empty or image-only.'
      });
    }

    res.json({ text, filename: req.file.originalname });

  } catch (err) {
    console.error('File extraction error:', err.message);
    res.status(500).json({ error: 'Failed to extract text from the file' });
  }
};


module.exports = { extractText };