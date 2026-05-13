const LibraryFile = require('../models/LibraryFile');
const LibraryChunk = require('../models/LibraryChunk');
const { extractTextFromFile } = require('./uploadController');
const { indexDocument } = require('./ragController');

const uploadFile = async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ error: 'No file was uploaded.' });
    }

    const text = await extractTextFromFile(req.file.buffer, req.file.originalname);

    const libraryFile = await indexDocument(
      text,
      req.user._id,
      req.file.originalname,
      req.file.size
    );

    res.json({
      success:       true,
      libraryFileId: libraryFile._id,
      filename:      libraryFile.filename,
      chunkCount:    libraryFile.chunkCount,
      size:          libraryFile.size
    });

  } catch (err) {
    console.error('[Library] Upload failed:', err.message);
    res.status(400).json({ error: err.message || 'Failed to upload the file.' });
  }
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

    await LibraryChunk.deleteMany({ libraryFileId: libraryFile._id });

    await LibraryFile.findByIdAndDelete(req.params.id);

    res.json({ success: true });

  } catch (err) {
    console.error('[Library] Delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete the file.' });
  }
};

module.exports = { uploadFile, listFiles, deleteFile };
