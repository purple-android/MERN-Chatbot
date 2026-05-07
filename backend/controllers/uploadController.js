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
const pdfParse = require('pdf-parse');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Tell pdfjs-dist NOT to use a web worker — workers are a browser concept
// In Node.js we just run everything in the same process, so we set this to empty string
pdfjsLib.GlobalWorkerOptions.workerSrc = '';
const { createCanvas } = process.platform === 'win32'
  ? require('canvas')
  : require('@napi-rs/canvas');
  const Tesseract = require('tesseract.js');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');


// ── NodeCanvasFactory ──
const NodeCanvasFactory = {

  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  },

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width  = width;
    canvasAndContext.canvas.height = height;
  },

  destroy(canvasAndContext) {
    if (process.platform === 'win32') {
      canvasAndContext.canvas.width  = 0;
      canvasAndContext.canvas.height = 0;
    }
  }
};

async function extractTextWithOCR(buffer) {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
  }).promise;

  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale: 1.5 });

    const { canvas, context } = NodeCanvasFactory.create(viewport.width, viewport.height);

    await page.render({
      canvasContext: context,    // the drawing tool we created above
      viewport:      viewport,   // the size/scale to render at
      canvasFactory: NodeCanvasFactory  // our custom canvas creator, so pdfjs uses @napi-rs/canvas
    }).promise;

    const imageBuffer = canvas.toBuffer('image/png');

    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
      logger: () => {}
    });

    fullText += text + '\n';

    NodeCanvasFactory.destroy({ canvas, context });
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
      const result = await pdfParse(req.file.buffer);
      text = result.text.trim();

      if (text.length < 50) {
        console.log('pdf-parse found little text — switching to OCR for image-based PDF');
        try {
          text = await extractTextWithOCR(req.file.buffer);
        } catch (ocrErr) {
          console.log('[OCR] OCR failed — system graphics libraries likely missing:', ocrErr.message);
          return res.status(400).json({
            error: 'This PDF contains images instead of selectable text. OCR could not run on the server. Try a PDF where you can select and copy the text.'
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
