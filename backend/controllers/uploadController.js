const path = require('path');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');

async function extractTextWithOCR(buffer) {

  const mupdf = await import('mupdf');

  const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf');

  let fullText = '';

  for (let i = 0; i < doc.countPages(); i++) {

    const page = doc.loadPage(i);

    const pixmap = page.toPixmap(
      [1.5, 0, 0, 1.5, 0, 0],
      mupdf.ColorSpace.DeviceRGB
    );

    const imageBuffer = Buffer.from(pixmap.asPNG());

    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
      logger: () => {}
    });

    fullText += text + '\n';
  }

  return fullText.trim();
}

async function extractTextFromFile(buffer, originalname) {

  const ext = path.extname(originalname).toLowerCase();

  let text = '';

  if (ext === '.txt') {
    text = buffer.toString('utf-8');

  } else if (ext === '.pdf') {

    const result = await pdfParse(buffer);
    text = result.text.trim();

    if (text.length < 50) {
      console.log('pdf-parse found little text — switching to OCR for image-based PDF');
      text = await extractTextWithOCR(buffer);
    }

  } else if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;

  } else if (ext === '.doc') {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    text = doc.getBody();

  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  text = text.trim();

  if (!text) {
    throw new Error('No text could be extracted. The file may be empty or contain only non-readable images.');
  }

  return text;
}

const extractText = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file was uploaded' });

    const text = await extractTextFromFile(req.file.buffer, req.file.originalname);

    res.json({ text, filename: req.file.originalname });

  } catch (err) {
    console.error('File extraction error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to extract text from the file' });
  }
};

module.exports = { extractText, extractTextFromFile };
