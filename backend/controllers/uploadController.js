const path = require('path');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');

// Skip OCRing embedded images smaller than this (in PDF points). Tiny images are
// usually logos/icons/lines — OCRing them wastes time and produces junk.
const MIN_IMAGE_DIM = 40;

async function extractTextFromPdf(buffer) {

  const mupdf = await import('mupdf');

  const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf');

  const pageCount = doc.countPages();
  let fullText = '';

  for (let i = 0; i < pageCount; i++) {

    const page = doc.loadPage(i);

    let stext;
    try {
      stext = page.toStructuredText('preserve-images');
    } catch (e) {
      page.destroy?.();
      continue;
    }

    const pageText = (stext.asText() || '').trim();

    const imagePngs = [];
    try {
      stext.walk({
        onImageBlock(bbox, transform, image) {
          const width  = bbox[2] - bbox[0];
          const height = bbox[3] - bbox[1];
          if (width < MIN_IMAGE_DIM || height < MIN_IMAGE_DIM) return;
          try {
            const pixmap = image.toPixmap();
            imagePngs.push(Buffer.from(pixmap.asPNG()));
            pixmap.destroy?.();
          } catch (imgErr) { /* skip this image */ }
        }
      });
    } catch (walkErr) { /* keep whatever pageText we got */ }

    stext.destroy?.();
    page.destroy?.();

    let imageText = '';
    for (const png of imagePngs) {
      try {
        const { data: { text } } = await Tesseract.recognize(png, 'eng', {
          logger: () => {}
        });
        const trimmed = (text || '').trim();
        if (trimmed) imageText += trimmed + '\n';
      } catch (ocrErr) { /* skip this image */ }
    }

    if (pageText)  fullText += pageText + '\n';
    if (imageText) fullText += imageText + '\n';
  }

  fullText = fullText.trim();

  if (!fullText) {
    try {
      const result = await pdfParse(buffer);
      fullText = (result.text || '').trim();
    } catch (e) { /* leave empty */ }
  }

  return fullText;
}

async function extractTextFromFile(buffer, originalname) {

  const ext = path.extname(originalname).toLowerCase();

  let text = '';

  if (ext === '.txt') {
    text = buffer.toString('utf-8');

  } else if (ext === '.pdf') {

    text = await extractTextFromPdf(buffer);

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
