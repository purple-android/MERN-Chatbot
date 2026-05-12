const mongoose = require('mongoose');

const libraryChunkSchema = new mongoose.Schema({

  libraryFileId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'LibraryFile',
    required: true,
    index:    true
  },

  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true
  },

  chunkIndex: {
    type:     Number,
    required: true
  },

  text: {
    type:     String,
    required: true
  },

  vector: {
    type:     [Number],
    required: true
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('LibraryChunk', libraryChunkSchema);
