const express = require('express');

const router = express.Router();

const requireAuth = require('../middleware/requireAuth');

const { startSummarize, getSummaryJob } = require('../controllers/summarizeController');

// Start a summarization job (responds immediately with a jobId).
router.post('/', requireAuth, startSummarize);

// Poll a job's status/result (the frontend calls this every few seconds).
router.get('/:jobId', requireAuth, getSummaryJob);

module.exports = router;
