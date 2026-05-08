const express = require('express');
const router  = express.Router();

const requireAuth  = require('../middleware/requireAuth');
const upload       = require('../middleware/upload');
const { extractText } = require('../controllers/uploadController');

router.use(requireAuth);

// POST /api/upload
// We wrap multer manually (instead of using it directly as middleware) so we can
// catch multer's errors and return proper JSON instead of an HTML error page.
// Without this wrapper, a file-too-large error would send back HTML,
// which the frontend can't parse and crashes with "JSON.parse: unexpected character".
router.post('/', (req, res, next) => {

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

}, extractText);

module.exports = router;
