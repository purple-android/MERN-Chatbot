const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const upload = require('../middleware/upload');

const {
  uploadFile,
  listFiles,
  deleteFile
} = require('../controllers/libraryController');

router.use(requireAuth);

router.post('/upload', (req, res, next) => {

  upload.single('file')(req, res, (err) => {

    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File is too large. Maximum allowed size is 10MB.'
        });
      }
      return res.status(400).json({ error: err.message });
    }

    next();
  });

}, uploadFile);

router.get('/', listFiles);
router.delete('/:id', deleteFile);

module.exports = router;