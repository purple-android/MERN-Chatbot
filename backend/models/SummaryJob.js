const mongoose = require('mongoose');

// A summarization job. The slow work runs in the background; this record is the
// single source of truth the frontend polls to find out when it's done.
const summaryJobSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true
  },
  status: {
    type:    String,
    enum:    ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  result: {
    type:    String,
    default: null
  },
  error: {
    type:    String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SummaryJob', summaryJobSchema);
