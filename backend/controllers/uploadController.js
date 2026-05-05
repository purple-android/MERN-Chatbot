// For PDFs it uses a TWO-STEP approach:
//   Step 1 — Try pdf-parse (fast, extracts text that is already embedded in the PDF)
//   Step 2 — If Step 1 returns little or no text, the PDF is probably image-based
//            (a scanned document, or a PDF containing images with text inside them)
//            In that case we use OCR: we render each page as an image and read the text visually

const path = require('path');
const pdfParse = require('pdf-parse');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = '';
const { createCanvas } = require('@napi-rs/canvas');
const Tesseract = require('tesseract.js');
const mammoth = require('mammoth');

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
    canvasAndContext.canvas.width  = 0;
    canvasAndContext.canvas.height = 0;
  }
};

// ── extractTextWithOCR ──
async function extractTextWithOCR(buffer) {

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
  }).promise;

  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale: 2.0 });

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

// ── extractTextFromDoc ──
// A helper function that extracts readable text from a .doc binary file
// without needing any external tools or programs installed.
//
// The old Word .doc format stores text as UTF-16LE encoding.
// UTF-16LE means every character takes 2 bytes: the character value, then a zero byte (0x00).
// So "Hello" is stored as: 72 0 | 101 0 | 108 0 | 108 0 | 111 0
// We scan through the file looking for these patterns to pull out the text.
function extractTextFromDoc(buffer) {
  // bytes is the raw file data as a list of numbers (one number per byte)
  const bytes = new Uint8Array(buffer);
  let text = '';
  let i = 0;

  while (i < bytes.length - 1) {
    // In UTF-16LE, the second byte is 0x00 for all standard characters
    if (bytes[i + 1] === 0x00) {
      const charCode = bytes[i];

      // 0x20 to 0x7E is the printable ASCII range (space, letters, numbers, symbols)
      if (charCode >= 0x20 && charCode <= 0x7E) {
        text += String.fromCharCode(charCode);
        i += 2;
        continue;
      }

      // 0x0D is a carriage return — convert it to a newline
      if (charCode === 0x0D) {
        text += '\n';
        i += 2;
        continue;
      }

      // 0x09 is a tab — convert it to a space
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
      text = result.text.trim();

      if (text.length < 50) {
        console.log('pdf-parse found little text — switching to OCR for image-based PDF');
        text = await extractTextWithOCR(req.file.buffer);
      }

    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;

    } else if (ext === '.doc') {
      text = extractTextFromDoc(req.file.buffer);
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