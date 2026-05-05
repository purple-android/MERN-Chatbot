const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');

const upload = require('../middleware/upload');

const { extractText } = require('../controllers/uploadController');

router.use(requireAuth);
router.post('/', upload.single('file'), extractText);

module.exports = router;
