// llm.js
// Chat LLM provider with automatic fallback:
//   1. Try the LOCAL model first (Ollama, OpenAI-compatible API at localhost:11434).
//   2. If the local server is unreachable/errors, fall back to GROQ (llama-4-scout).
//
// Same idea as the local-Whisper-then-Groq transcription path: use the model on your
// own machine when it's available, and the cloud when it isn't (e.g. in production).

const Groq = require('groq-sdk');

const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── callLocal ──
// Calls the local Ollama model via its OpenAI-compatible endpoint and returns the
// parsed JSON (OpenAI shape: { choices: [...], usage: {...} }). Throws if the server
// is unreachable or returns a non-2xx status.
async function callLocal({ messages, max_tokens, signal }) {
  const baseUrl = process.env.LOCAL_LLM_URL   || 'http://localhost:11434/v1';
  const model   = process.env.LOCAL_LLM_MODEL || 'gemma3:270m';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model, messages, max_tokens, stream: false }),
    signal
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Local model HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ── createChatCompletion ──
// Tries the local model, falls back to Groq if the local one is unavailable.
// Returns { data, httpResp, source }:
//   • data     — the OpenAI-shaped completion (data.choices[0].message.content, data.usage)
//   • httpResp — the raw HTTP response (Groq only, for rate-limit headers); null for local
//   • source   — 'local' or 'groq'
//
// We do NOT fall back on an abort (our timeout firing) — that should surface as a
// timeout, not silently retry on Groq.
async function createChatCompletion({ messages, max_tokens, signal }) {
  try {
    const data = await callLocal({ messages, max_tokens, signal });
    return { data, httpResp: null, source: 'local' };
  } catch (localErr) {
    if (localErr.name === 'AbortError') throw localErr;

    console.warn('[LLM] Local model unavailable:', localErr.message, '— falling back to Groq.');

    const { data, response } = await groq.chat.completions
      .create({ model: GROQ_MODEL, max_tokens, messages }, { signal })
      .withResponse();

    return { data, httpResp: response, source: 'groq' };
  }
}

// ── streamLocal ──
// Streams a reply from the local Ollama model. Ollama's OpenAI-compatible endpoint
// returns Server-Sent Events (lines of `data: {json}`); we parse each delta and hand
// the new text to onToken. Returns the full accumulated text.
async function streamLocal({ messages, max_tokens, signal, onToken }) {
  const baseUrl = process.env.LOCAL_LLM_URL   || 'http://localhost:11434/v1';
  const model   = process.env.LOCAL_LLM_MODEL || 'gemma3:270m';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model, messages, max_tokens, stream: true }),
    signal
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Local model HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();   // keep the last (possibly incomplete) line for next round

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json  = JSON.parse(payload);
        const piece = json.choices?.[0]?.delta?.content || '';
        if (piece) { full += piece; onToken(piece); }
      } catch { /* ignore keep-alive / partial lines */ }
    }
  }

  return { full, source: 'local' };
}

// ── streamGroq ──
// Streams a reply from Groq via groq-sdk (its create({stream:true}) returns an async
// iterable of chunks). Same onToken contract; returns the full accumulated text.
async function streamGroq({ messages, max_tokens, signal, onToken }) {
  const stream = await groq.chat.completions.create(
    { model: GROQ_MODEL, max_tokens, messages, stream: true },
    { signal }
  );

  let full = '';
  for await (const chunk of stream) {
    const piece = chunk.choices?.[0]?.delta?.content || '';
    if (piece) { full += piece; onToken(piece); }
  }

  return { full, source: 'groq' };
}

// ── streamChatCompletion ──
// Streaming version of createChatCompletion: local model first, Groq fallback.
// Calls onToken(piece) for each new bit of text, and resolves with { full, source }.
async function streamChatCompletion({ messages, max_tokens, signal, onToken }) {
  try {
    return await streamLocal({ messages, max_tokens, signal, onToken });
  } catch (localErr) {
    if (localErr.name === 'AbortError') throw localErr;
    console.warn('[LLM] Local model unavailable for streaming:', localErr.message, '— falling back to Groq.');
    return await streamGroq({ messages, max_tokens, signal, onToken });
  }
}

module.exports = { createChatCompletion, streamChatCompletion, GROQ_MODEL };
