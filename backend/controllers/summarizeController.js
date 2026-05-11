// summarizeController.js
// This file handles summarizing a large document by splitting it into small pieces,
// summarizing each piece with the AI, then combining everything into one final summary.

const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DAILY_REQUEST_LIMIT = 1000;       // 1,000 requests per day
const DAILY_TOKEN_LIMIT   = 500000;     // 500,000 tokens per day
const CHUNK_SIZE = 80000;               // 80,000 characters ≈ 20,000 tokens (1 token ≈ 4 characters).
const MAX_CHUNK_SUMMARY_TOKENS = 1500;  // 1,500 tokens ≈ 1,100 words
const MAX_FINAL_SUMMARY_TOKENS = 8000; // 8,000 tokens ≈ 6,000 words
const CHUNK_DELAY_MS = 60000; // 60 seconds or 1 minute
const AI_TIMEOUT_MS = 600000; // 10 minutes per individual API call

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── summarizeDocument ──
const summarizeDocument = async (req, res) => {
  try {

    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text was provided to summarize.' });
    }

    const chunks = [];

    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    console.log(`[Summarize] Document split into ${chunks.length} chunk(s) of up to ${CHUNK_SIZE} chars each.`);

    const chunkSummaries = [];

    for (let i = 0; i < chunks.length; i++) {

      console.log(`[Summarize] Summarizing chunk ${i + 1} of ${chunks.length}...`);

      const controller = new AbortController();

      const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      let chunkData;
      try {
        const { data, response: httpResp } = await groq.chat.completions.create(
          {
            model: MODEL,
            max_tokens: MAX_CHUNK_SUMMARY_TOKENS,

            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that summarizes text. Write a moderate-length summary — not too short, not too long. Capture all the important points and key details, but stay focused. Aim for around 200–400 words. Do not add commentary or opinions. Always finish your sentences — do not stop in the middle.'
              },
              {
                role: 'user',
                content: `Please write a moderate-length summary of this section of a longer document:\n\n${chunks[i]}`
              }
            ]
          },
          { signal: controller.signal }
        ).withResponse();

        chunkData = data;

        // ── Log token usage and rate limits for this chunk request ──
        // data.usage tells us exactly how many tokens this one request used.
        // The HTTP response headers tell us how much per-minute budget is left.
        // Daily counters are NOT in the headers — Groq only provides per-minute info.
        const u = data.usage;
        const remReq   = httpResp.headers.get('x-ratelimit-remaining-requests');
        const limReq   = httpResp.headers.get('x-ratelimit-limit-requests');
        const remTok   = httpResp.headers.get('x-ratelimit-remaining-tokens');
        const limTok   = httpResp.headers.get('x-ratelimit-limit-tokens');
        const resetReq = httpResp.headers.get('x-ratelimit-reset-requests');
        const resetTok = httpResp.headers.get('x-ratelimit-reset-tokens');

        console.log(`[Summarize] ───── Chunk ${i + 1}/${chunks.length} stats ─────`);
        console.log(`[Summarize] Token usage    — prompt: ${u?.prompt_tokens} | completion: ${u?.completion_tokens} | total: ${u?.total_tokens} tokens`);
        console.log(`[Summarize] Per-minute RPM — ${remReq}/${limReq} requests left (resets in ${resetReq})`);
        console.log(`[Summarize] Per-minute TPM — ${remTok}/${limTok} tokens left (resets in ${resetTok})`);
        console.log(`[Summarize] Per-day limit  — ${DAILY_REQUEST_LIMIT.toLocaleString()} requests/day | ${DAILY_TOKEN_LIMIT.toLocaleString()} tokens/day (live daily usage: https://console.groq.com/usage)`);
        console.log('[Summarize] ──────────────────────────────');

      } finally {
        clearTimeout(timer);
      }

      const chunkSummary = chunkData.choices[0].message.content;

      chunkSummaries.push(chunkSummary);

      if (i < chunks.length - 1) {
        console.log(`[Summarize] Waiting ${CHUNK_DELAY_MS / 1000}s before the next chunk to stay under the rate limit...`);

        await sleep(CHUNK_DELAY_MS);
      }
    }

    let finalSummary;

    if (chunks.length === 1) {

      finalSummary = chunkSummaries[0];
      console.log('[Summarize] Single chunk — no combining step needed.');

    } else {

      console.log('[Summarize] Combining all chunk summaries into a final summary...');

      const combinedText = chunkSummaries.join('\n\n');

      const finalController = new AbortController();
      const finalTimer = setTimeout(() => finalController.abort(), AI_TIMEOUT_MS);

      let finalData;
      try {
        const { data, response: httpResp } = await groq.chat.completions.create(
          {
            model: MODEL,

            // MAX_FINAL_SUMMARY_TOKENS = 4000 — large enough that the summary will NEVER
            // be cut off mid-sentence. The old value of 600 was causing the cutoff.
            max_tokens: MAX_FINAL_SUMMARY_TOKENS,

            messages: [
              {
                // System prompt asks for a moderate-length, complete summary.
                // The "always finish your sentences" line is critical — it pushes the AI to
                // stop at a natural breakpoint instead of running into the max_tokens wall.
                role: 'system',
                content: 'You are a helpful assistant. Write one clear, unified summary that covers the whole document. Aim for a moderate length — not too brief, not too long. Around 800–1500 words is ideal. Cover all major topics but stay focused. Do not repeat yourself. Do not add opinions or commentary. Always finish your sentences — never stop in the middle of a sentence or thought. End with a clear closing sentence.'
              },
              {
                role: 'user',
                content: `Below are summaries of different sections of a long document. Combine them into ONE moderate-length summary that covers the whole document. Make sure to finish every sentence — your response must end naturally, not be cut off mid-thought:\n\n${combinedText}`
              }
            ]
          },
          { signal: finalController.signal }
        ).withResponse();

        finalData = data;

        // ── Log token usage and rate limits for the FINAL combining request ──
        // Same format as the per-chunk block, just labelled differently so it's easy to spot.
        const u = data.usage;
        const remReq   = httpResp.headers.get('x-ratelimit-remaining-requests');
        const limReq   = httpResp.headers.get('x-ratelimit-limit-requests');
        const remTok   = httpResp.headers.get('x-ratelimit-remaining-tokens');
        const limTok   = httpResp.headers.get('x-ratelimit-limit-tokens');
        const resetReq = httpResp.headers.get('x-ratelimit-reset-requests');
        const resetTok = httpResp.headers.get('x-ratelimit-reset-tokens');

        console.log('[Summarize] ───── Final combine stats ─────');
        console.log(`[Summarize] Token usage    — prompt: ${u?.prompt_tokens} | completion: ${u?.completion_tokens} | total: ${u?.total_tokens} tokens`);
        console.log(`[Summarize] Per-minute RPM — ${remReq}/${limReq} requests left (resets in ${resetReq})`);
        console.log(`[Summarize] Per-minute TPM — ${remTok}/${limTok} tokens left (resets in ${resetTok})`);
        console.log(`[Summarize] Per-day limit  — ${DAILY_REQUEST_LIMIT.toLocaleString()} requests/day | ${DAILY_TOKEN_LIMIT.toLocaleString()} tokens/day (live daily usage: https://console.groq.com/usage)`);
        console.log('[Summarize] ──────────────────────────────');

      } finally {
        clearTimeout(finalTimer);
      }

      finalSummary = finalData.choices[0].message.content;
    }

    console.log(`[Summarize] Done. Final summary is ${finalSummary.length} characters.`);

    res.json({ summary: finalSummary });

  } catch (err) {

    console.error('[Summarize] Error:', err.message);

    if (err.name === 'AbortError') {
      return res.status(408).json({
        error: 'The AI took too long to summarize. Try again, or use a shorter document.'
      });
    }

    if (err.status === 429) {
      const waitMatch = err.message?.match(/please try again in ([^\."]+)/i);
      const waitTime  = waitMatch ? waitMatch[1].trim() : null;

      const waitNote = waitTime
        ? ` Please wait ${waitTime} before trying again.`
        : ' Please wait a minute before trying again.';

      return res.status(429).json({
        error: `You have hit the AI usage limit while summarizing.${waitNote}`
      });
    }

    res.status(500).json({ error: 'Failed to summarize the document. Please try again.' });
  }
};

module.exports = { summarizeDocument };
