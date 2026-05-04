const Conversation = require('../models/Conversation');

const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const getAllConversations = async (req, res) => {
  try {

    const conversations = await Conversation.find({}, 'title createdAt').sort({ createdAt: -1 });

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
};

const getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversation' });
  }
};

const createConversation = async (req, res) => {
  try {
    const conversation = await Conversation.create({ title: 'New Chat', messages: [] });

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { content } = req.body;

    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    conversation.messages.push({ role: 'user', content });

    if (conversation.messages.length === 1) {
      conversation.title = content.slice(0, 50);
    }

    const messagesForAI = conversation.messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const aiResponse = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: messagesForAI
    });

    const aiText = aiResponse.choices[0].message.content;

    conversation.messages.push({ role: 'assistant', content: aiText });

    await conversation.save();

    res.json({ reply: aiText, conversationId: conversation._id });
  } catch (err) {
    console.error('Error getting AI response:', err.message);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
};

const deleteConversation = async (req, res) => {
  try {
    await Conversation.findByIdAndDelete(req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};


module.exports = {
  getAllConversations,
  getConversation,
  createConversation,
  sendMessage,
  deleteConversation
};
