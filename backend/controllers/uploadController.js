// uploadController.js
// This file handles extracting text from an uploaded document file.
// It receives the file from multer, reads its content, and sends the text back.
//
// For PDFs it uses a TWO-STEP approach:
//   Step 1 — Try pdf-parse (fast, extracts text that is already embedded in the PDF)
//   Step 2 — If Step 1 returns little or no text, the PDF is probably image-based
//            (a scanned document, or a PDF containing images with text inside them)
//            In that case we use OCR: we render each page as an image and read the text visually

// Load the built-in 'path' module — used to read file extensions like ".pdf"
const path = require('path');

// Load pdf-parse — reads text that is ALREADY embedded in a PDF as selectable text
// NOTE: We must use version 1.1.1 — newer versions changed the API and break
const pdfParse = require('pdf-parse');

// Note: mupdf is loaded with dynamic import() inside extractTextWithOCR below.
// It cannot be loaded with require() at the top of the file because mupdf is an ESM module
// (a modern JavaScript format) and our project uses CommonJS (require).
// Dynamic import() bridges the two — it works fine inside async functions.

// Load tesseract.js — an OCR (Optical Character Recognition) library
// OCR = the ability to look at an image and read the text visible in it
// It downloads English language data on first use (requires internet, cached after that)
const Tesseract = require('tesseract.js');

// Load mammoth — a library that reads .docx Word document bytes and extracts plain text
const mammoth = require('mammoth');

// Load word-extractor — a library that reads the old .doc binary format and extracts plain text
// The old .doc format (Word 97–2003) is a complex binary file that mammoth cannot read
// word-extractor handles all the binary parsing internally so we don't have to
const WordExtractor = require('word-extractor');

// ── extractTextWithOCR ──

async function extractTextWithOCR(buffer) {

  // Load mupdf using dynamic import — this is needed because mupdf is an ESM module
  // import() returns a Promise, so we await it to get the actual mupdf object
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

// ── extractText ──
const extractText = async (req, res) => {
  try {

    if (!req.file) return res.status(400).json({ error: 'No file was uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();

    let text = '';

    if (ext === '.txt') {
      text = req.file.buffer.toString('utf-8');

    } else if (ext === '.pdf') {

      // ── PDF: two-step extraction ──
      const result = await pdfParse(req.file.buffer);
      text = result.text.trim();

      if (text.length < 50) {
        console.log('pdf-parse found little text — switching to OCR for image-based PDF');

        try {
          text = await extractTextWithOCR(req.file.buffer);
        } catch (ocrErr) {
          console.log('[OCR] OCR failed:', ocrErr.message);
          return res.status(400).json({
            error: 'This PDF contains images instead of selectable text and OCR failed. Try a PDF where you can select and copy the text.'
          });
        }
      }

    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;

    } else if (ext === '.doc') {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(req.file.buffer);
      text = doc.getBody();
    }

    text = text.trim();

    if (!text) {
      return res.status(400).json({
        error: 'No text could be extracted. The file may be empty or contain only non-readable images.'
      });
    }

    res.json({ text, filename: req.file.originalname });

  } catch (err) {
    console.error('File extraction error:', err.message);
    res.status(500).json({ error: 'Failed to extract text from the file' });
  }
};

module.exports = { extractText };
