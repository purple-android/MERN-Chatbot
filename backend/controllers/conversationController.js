const Conversation = require('../models/Conversation');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MAX_MESSAGE_LENGTH = 15000; // almost 4000 tokens
const TOKEN_BUDGET = 7500;
const AI_TIMEOUT_MS = 30000; // 30 seconds


// ── getAllConversations ──
const getAllConversations = async (req, res) => {
  try {
    const conversations = await Conversation
      .find({ userId: req.user._id }, 'title createdAt')
      .sort({ createdAt: -1 });

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
};


// ── getConversation ──
const getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    if (conversation.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversation' });
  }
};

// ── createConversation ──
const createConversation = async (req, res) => {
  try {
    const conversation = await Conversation.create({
      userId: req.user._id,
      title:  'New Chat',
      messages: []
    });

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};


// ── sendMessage ──
const sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    if (conversation.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    conversation.messages.push({ role: 'user', content });

    if (conversation.messages.length === 1) {
      conversation.title = content.slice(0, 50);
    }

    let tokenCount = 0;
    let start = conversation.messages.length - 1;

    while (start >= 0) {
      const effectiveLength = Math.min(conversation.messages[start].content.length, MAX_MESSAGE_LENGTH);
      const msgTokens = Math.ceil(effectiveLength / 4);
      if (tokenCount + msgTokens > TOKEN_BUDGET) break;
      tokenCount += msgTokens;
      start--;
    }

    const recentMessages = conversation.messages.slice(start + 1);

    const messagesForAI = recentMessages.map(m => {
      if (m.content.length > MAX_MESSAGE_LENGTH) {
        return {
          role:    m.role,
          content: m.content.slice(0, MAX_MESSAGE_LENGTH) +
                   '\n\n[Note: the document was trimmed because it was too long.]'
        };
      }
      return { role: m.role, content: m.content };
    });

    // ── Call the Groq AI with a timeout ──
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let aiResponse;
    try {
      aiResponse = await groq.chat.completions.create(
        {
          model:      'llama-3.3-70b-versatile',
          max_tokens: 1024,
          messages:   messagesForAI
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutTimer);
    }

    const aiText = aiResponse.choices[0].message.content;

    conversation.messages.push({ role: 'assistant', content: aiText });

    await conversation.save();

    res.json({ reply: aiText, conversationId: conversation._id });

  } catch (err) {
    console.error('Error getting AI response:', err.message);

    // ── Timeout: AI took too long ──
    if (err.name === 'AbortError') {
      return res.status(408).json({
        error: 'The AI took too long to respond. This can happen with very large documents. Please try again or use a shorter document.'
      });
    }

    if (err.status === 429) {
      // Try to pull the wait time out of Groq's error message using a regex
      // Example match: "Please try again in 18m6.912s"
      const waitMatch = err.message?.match(/please try again in ([^\."]+)/i);
      const waitTime  = waitMatch ? waitMatch[1].trim() : null;

      const waitNote = waitTime
        ? ` Please try again in ${waitTime}.`
        : ' Please wait a few minutes before trying again.';

      return res.status(429).json({
        error: `You've reached the AI usage limit for now.${waitNote}`
      });
    }

    // ── Context window exceeded: document too long for the AI ──
    if (
      err.status === 400 ||
      err.message?.toLowerCase().includes('context') ||
      err.message?.toLowerCase().includes('too long')
    ) {
      return res.status(400).json({
        error: 'The document is too long for the AI to process. Try uploading a shorter document, or copy and paste only the relevant section.'
      });
    }

    // ── Generic fallback error ──
    res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
  }
};

// ── deleteConversation ──
// Handles: DELETE /api/conversations/:id
const deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    if (conversation.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
