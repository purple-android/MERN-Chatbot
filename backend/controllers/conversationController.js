const Conversation = require('../models/Conversation');

const LibraryChunk = require('../models/LibraryChunk');
const { retrieveChunks } = require('./ragController');

const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// const MAX_MESSAGE_LENGTH = 1500;
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DAILY_REQUEST_LIMIT = 1000;       // 1,000 requests per day on the free tier
const DAILY_TOKEN_LIMIT   = 500000;     // 500,000 tokens per day on the free tier
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_MESSAGE_LENGTH = 600;  // almost 150 tokens
const MAX_CURRENT_MESSAGE_LENGTH = 80000;  // almost 20000 tokens
const AI_TIMEOUT_MS = 600000; // 600 seconds or 10 minutes


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
    const { content, useLibrary = true } = req.body;
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    if (conversation.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    conversation.messages.push({ role: 'user', content });

    if (conversation.messages.length === 1) {
      conversation.title = content.slice(0, 50);
    }

    const lastIndex = conversation.messages.length - 1;
    const historyMessages = conversation.messages.slice(
      Math.max(0, lastIndex - MAX_HISTORY_MESSAGES),
      lastIndex
    );
    
    const historyForAI = historyMessages.map(m => {
      // Check if the message exceeds the character cap
      if (m.content.length > MAX_HISTORY_MESSAGE_LENGTH) {
        return {
          role:    m.role,
          content: m.content.slice(0, MAX_HISTORY_MESSAGE_LENGTH) +
                   '\n\n[Note: this message was trimmed because it was too long.]'
        };
      }
      return { role: m.role, content: m.content };
    });

    const currentMsg = conversation.messages[lastIndex];
    const currentForAI = {
      role: currentMsg.role,
      content: currentMsg.content.length > MAX_CURRENT_MESSAGE_LENGTH
        ? currentMsg.content.slice(0, MAX_CURRENT_MESSAGE_LENGTH) +
        '\n\n[Note: your message was automatically trimmed because it exceeded the 80,000-character limit.]'
        : currentMsg.content
    };

    // ── RAG (Phase 4): consult the user's library if they have one ──
    let systemPromptForRAG = null;
    let sourcesForReply    = [];

    const libraryChunkCount = useLibrary
      ? await LibraryChunk.countDocuments({ userId: req.user._id })
      : 0;

    if (!useLibrary) {
      // User explicitly turned the library toggle OFF — don't search, don't embed.
      // The chat will run with normal LLM behaviour, no document context.
      console.log('[Chat] Library toggle is OFF — skipping RAG for this message.');
    }

    if (libraryChunkCount > 0) {
      try {
        const chunks = await retrieveChunks(currentMsg.content, req.user._id, 5);

        if (chunks.length > 0) {
          const contextBlock = chunks
            .map((c, idx) => `[Excerpt ${idx + 1}] from "${c.filename}":\n${c.text}`)
            .join('\n\n---\n\n');

          systemPromptForRAG = {
            role: 'system',
            content:
              'You are a helpful assistant. The user has a personal library of documents. ' +
              'Below are excerpts from those documents that may be relevant to the user\'s question. ' +
              'If they answer the question, use them and mention which file you got the info from. ' +
              'If they DO NOT answer the question, just answer normally from your own knowledge ' +
              'and do not force the excerpts in.\n\n' +
              '--- DOCUMENT EXCERPTS ---\n\n' +
              contextBlock
          };

          sourcesForReply = chunks.map(c => ({
            filename:   c.filename,
            chunkIndex: c.chunkIndex
          }));

          console.log(`[Chat] RAG enabled — using ${chunks.length} chunks from the user's library.`);
        }
      } catch (ragErr) {
        console.error('[Chat] RAG retrieval failed, falling back to no-RAG:', ragErr.message);
      }
    }

    const messagesForAI = systemPromptForRAG
      ? [systemPromptForRAG, ...historyForAI, currentForAI]
      : [...historyForAI, currentForAI];

    // ── Call the Groq AI with a timeout ──
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let aiData;
    try {
      const { data, response: httpResp } = await groq.chat.completions.create(
        {
          model:      MODEL,
          max_tokens: 2048,
          messages:   messagesForAI
        },
        { signal: controller.signal }
      ).withResponse();
      
      aiData = data;

      // ── Log how many tokens this request used ──
      // data.usage is included by Groq in every response (NOT built-in — Groq adds it)
      // prompt_tokens     — tokens used by all the messages we sent (history + current message)
      // completion_tokens — tokens used by the AI's reply
      // total_tokens      — prompt + completion combined
      const u = data.usage;

      // ── Read the rate-limit headers Groq adds to every response ──
      // httpResp.headers.get() — BUILT-IN method to read one HTTP header by name.
      // These headers are PER-MINUTE only — Groq does NOT include daily counters.
      //
      // x-ratelimit-remaining-requests  — requests we can still make this minute (RPM)
      // x-ratelimit-limit-requests      — our total request limit per minute (RPM cap)
      // x-ratelimit-remaining-tokens    — tokens we can still use this minute (TPM)
      // x-ratelimit-limit-tokens        — our total token limit per minute (TPM cap)
      // x-ratelimit-reset-requests      — time until the request counter resets (e.g. "44s")
      // x-ratelimit-reset-tokens        — time until the token counter resets (e.g. "1.2s")      
      const remReq   = httpResp.headers.get('x-ratelimit-remaining-requests');
      const limReq   = httpResp.headers.get('x-ratelimit-limit-requests');
      const remTok   = httpResp.headers.get('x-ratelimit-remaining-tokens');
      const limTok   = httpResp.headers.get('x-ratelimit-limit-tokens');
      const resetReq = httpResp.headers.get('x-ratelimit-reset-requests');
      const resetTok = httpResp.headers.get('x-ratelimit-reset-tokens');

      console.log('[Chat] ───── Request stats ─────');
      console.log(`[Chat] Token usage    — prompt: ${u?.prompt_tokens} | completion: ${u?.completion_tokens} | total: ${u?.total_tokens} tokens`);
      console.log(`[Chat] Per-minute RPM — ${remReq}/${limReq} requests left (resets in ${resetReq})`);
      console.log(`[Chat] Per-minute TPM — ${remTok}/${limTok} tokens left (resets in ${resetTok})`);
      // Daily counters are NOT exposed in Groq response headers — we show the plan limits
      // instead, with a hint about where to see live daily usage.
      console.log(`[Chat] Per-day limit  — ${DAILY_REQUEST_LIMIT.toLocaleString()} requests/day | ${DAILY_TOKEN_LIMIT.toLocaleString()} tokens/day (live daily usage: https://console.groq.com/usage)`);
      console.log('[Chat] ─────────────────────────');
  
    } finally {
      clearTimeout(timeoutTimer);
    }

    const aiText = aiData.choices[0].message.content;

    conversation.messages.push({
      role:    'assistant',
      content: aiText,
      sources: sourcesForReply
    });

    await conversation.save();

    res.json({
      reply:          aiText,
      conversationId: conversation._id,
      sources:        sourcesForReply
    });
    
  } catch (err) {
    console.error('Error getting AI response:', err.message);

    // ── Timeout: AI took too long ──
    if (err.name === 'AbortError') {
      return res.status(408).json({
        error: 'The AI took longer than 10 minutes to respond. Please try again or use the Summarize button to shorten your document before sending.'
      });
    }

    // ── Rate limit reached: Groq returns 429 when the token quota is exceeded ──
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
