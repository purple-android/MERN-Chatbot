const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

function extractTextFromDoc(buffer) {
  const bytes = new Uint8Array(buffer);

  let text = '';

  let i = 0;
  while (i < bytes.length - 1) {

    if (bytes[i + 1] === 0x00) {
      const charCode = bytes[i];

      if (charCode >= 0x20 && charCode <= 0x7E) {
        text += String.fromCharCode(charCode);
        i += 2;
        continue;
      }

      if (charCode === 0x0D) {
        text += '\n';
        i += 2;
        continue;
      }

      if (charCode === 0x09) {
        text += ' ';
        i += 2;
        continue;
      }
    }

    i++;
  }

  const cleanLines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 1);

  return cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

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
      text = extractTextFromDoc(req.file.buffer);
    }

    text = text.trim();

    if (!text) {
      return res.status(400).json({
        error: 'No text could be extracted. The file may be empty, image-only, or in an unsupported encoding.'
      });
    }

    res.json({ text, filename: req.file.originalname });

  } catch (err) {
    console.error('File extraction error:', err.message);
    res.status(500).json({ error: 'Failed to extract text from the file' });
  }
};

module.exports = { extractText };