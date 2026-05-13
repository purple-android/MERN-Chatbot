const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema({
  filename:   { type: String, required: true },
  chunkIndex: { type: Number, required: true }
}, { _id: false }); // _id: false — we don't need a separate ID for every source entry

const messageSchema = new mongoose.Schema({
  role: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  sources: { type: [sourceSchema], default: [] }
});

const conversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'New Chat' },
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
