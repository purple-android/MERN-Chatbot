const LibraryFile = require('../models/LibraryFile');
const LibraryChunk = require('../models/LibraryChunk');
const { extractTextFromFile } = require('./uploadController');
const { indexDocument } = require('./ragController');
const { clearUserCache } = require('../utils/cache');

const activeUploads = new Map();

const uploadFile = async (req, res) => {

  const cancelToken = { cancelled: false };
  let responded = false;
  res.on('close', () => {
    if (!responded) cancelToken.cancelled = true;
  });

  const uploadId = req.body && req.body.uploadId;
  if (uploadId) {
    activeUploads.set(uploadId, cancelToken);
  }

  try {

    if (!req.file) {
      responded = true;
      return res.status(400).json({ error: 'No file was uploaded.' });
    }

    const text = await extractTextFromFile(req.file.buffer, req.file.originalname);

    const libraryFile = await indexDocument(
      text,
      req.user._id,
      req.file.originalname,
      req.file.size,
      cancelToken
    );

    await clearUserCache(req.user._id);

    responded = true;
    res.json({
      success:       true,
      libraryFileId: libraryFile._id,
      filename:      libraryFile.filename,
      chunkCount:    libraryFile.chunkCount,
      size:          libraryFile.size
    });

  } catch (err) {
    if (err.cancelled) {
      console.log('[Library] Upload cancelled by the user — partial data removed.');
      return;
    }

    console.error('[Library] Upload failed:', err.message);
    if (!responded && !res.writableEnded) {
      responded = true;
      res.status(400).json({ error: err.message || 'Failed to upload the file.' });
    }
  } finally {
    if (uploadId) activeUploads.delete(uploadId);
  }
};

const cancelUpload = async (req, res) => {
  const { uploadId } = req.params;

  const token = activeUploads.get(uploadId);
  if (token) {
    token.cancelled = true;
    console.log(`[Library] Cancel requested for upload ${uploadId}.`);
    return res.json({ success: true, cancelling: true });
  }

  return res.json({ success: true, cancelling: false });
};

const listFiles = async (req, res) => {
  try {

    const files = await LibraryFile
      .find(
        { userId: req.user._id },
        'filename size chunkCount status error createdAt'
      )
      .sort({ createdAt: -1 });

    res.json(files);

  } catch (err) {
    console.error('[Library] List failed:', err.message);
    res.status(500).json({ error: 'Failed to load library files.' });
  }
};

const deleteFile = async (req, res) => {
  try {

    const libraryFile = await LibraryFile.findById(req.params.id);

    if (!libraryFile) {
      return res.status(404).json({ error: 'File not found.' });
    }

    if (libraryFile.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (libraryFile.status === 'indexing') {
      return res.status(409).json({
        error: 'This file is still being indexed. Cancel the upload first, then delete it.'
      });
    }

    await LibraryChunk.deleteMany({ libraryFileId: libraryFile._id });

    await LibraryFile.findByIdAndDelete(req.params.id);

    await clearUserCache(req.user._id);

    res.json({ success: true });

  } catch (err) {
    console.error('[Library] Delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete the file.' });
  }
};

module.exports = { uploadFile, listFiles, deleteFile, cancelUpload };
