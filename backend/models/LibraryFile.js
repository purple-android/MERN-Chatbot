const mongoose = require('mongoose');

const libraryFileSchema = new mongoose.Schema({

  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true
  },

  filename: {
    type:     String,
    required: true
  },

  size: {
    type:    Number,
    default: 0
  },

  chunkCount: {
    type:    Number,
    default: 0
  },

  status: {
    type:    String,
    enum:    ['indexing', 'ready', 'failed'],
    default: 'indexing'
  },

  error: {
    type:    String,
    default: null
  },

  sourceText: {
    type:    String,
    default: undefined
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('LibraryFile', libraryFileSchema);
