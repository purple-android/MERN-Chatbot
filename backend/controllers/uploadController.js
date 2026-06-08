// uploadController.js
// Extracts plain text from an uploaded document (PDF / DOCX / DOC / TXT).
//
// The actual extraction is CPU-bound and largely synchronous (mupdf PDF parsing +
// image rendering, mammoth / word-extractor parsing), so it runs in a WORKER THREAD
// (workers/extractWorker.js) instead of on the main thread. That keeps the event
// loop free — one slow/huge file no longer freezes the server for every other user,
// and multiple uploads can extract in parallel.

const path = require('path');
const { Worker } = require('worker_threads');

const EXTRACT_WORKER_PATH = path.join(__dirname, '..', 'workers', 'extractWorker.js');

// ── extractTextFromFile ──
// Shared helper used by both /api/upload (chat attachment) and /api/library/upload.
// Spawns a fresh extraction worker, hands it the file bytes, and resolves with the
// extracted text (or rejects with the worker's error). The worker is terminated as
// soon as it answers.
//
// 'buffer'       — raw file bytes (a Node.js Buffer from multer)
// 'originalname' — the uploaded filename (used to detect the extension)
function extractTextFromFile(buffer, originalname) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(EXTRACT_WORKER_PATH);
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      fn(arg);
    };

    worker.on('message', (msg) => {
      if (msg.type === 'result')      finish(resolve, msg.text);
      else if (msg.type === 'error')  finish(reject, new Error(msg.message));
    });
    worker.on('error', (err) => finish(reject, err));
    worker.on('exit', (code) => {
      if (!settled) {
        finish(reject, new Error(`Extraction worker stopped unexpectedly (exit code ${code}).`));
      }
    });

    // Copy the bytes into a standalone ArrayBuffer we can TRANSFER to the worker
    // (zero-copy handoff). We copy rather than transfer multer's own buffer because
    // its memory may be pooled/shared with other allocations — transferring that
    // could corrupt unrelated data.
    const copy = new Uint8Array(buffer.length);
    copy.set(buffer);
    worker.postMessage(
      { type: 'extract', buffer: copy.buffer, originalname },
      [copy.buffer]
    );
  });
}

// ── extractText ──
// Handles: POST /api/upload (the chat-attachment endpoint).
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
