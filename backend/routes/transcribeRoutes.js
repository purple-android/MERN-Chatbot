const express = require('express');

const router = express.Router();

const requireAuth = require('../middleware/requireAuth');
const audioUpload = require('../middleware/audioUpload');

const { transcribeAudio } = require('../controllers/transcribeController');

router.use(requireAuth);
router.post('/', audioUpload.single('file'), transcribeAudio);

module.exports = router;