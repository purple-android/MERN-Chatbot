const express = require('express');

const router = express.Router();

const requireAuth = require('../middleware/requireAuth');

const { summarizeDocument } = require('../controllers/summarizeController');

router.post('/', requireAuth, summarizeDocument);

module.exports = router;
