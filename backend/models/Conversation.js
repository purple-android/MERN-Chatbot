const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema({
  filename:   { type: String, required: true },
  chunkIndex: { type: Number, required: true }
}, { _id: false }); // _id: false — we don't need a separate ID for every source entry

const webSourceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url:   { type: String, required: true }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  role: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  sources: { type: [sourceSchema], default: [] },
  webSources: { type: [webSourceSchema], default: [] }
});

const conversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'New Chat' },
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
