// summarizeController.js
// Summarizes a large document by splitting it into chunks, summarizing each with the
// AI, then combining them into one final summary.
//
// This runs as a BACKGROUND JOB so the HTTP request never stays open for the whole
// (multi-minute) process — which would otherwise be killed by proxy/load-balancer
// timeouts (~30–60s). Flow:
//   1. POST /api/summarize        → create a job (status 'processing'), respond with its id immediately.
//   2. The work runs in the background and writes the result/error onto the job.
//   3. GET  /api/summarize/:jobId → the frontend polls this until status is 'completed'/'failed'.
//
// NOTE: the background work continues only on an ALWAYS-ON host (Render Web Service,
// Railway, a normal Node process). It will NOT finish on serverless (e.g. Vercel
// functions), which freeze the process right after the response is sent.

const Groq = require('groq-sdk');
const SummaryJob = require('../models/SummaryJob');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DAILY_REQUEST_LIMIT = 1000;       // 1,000 requests per day
const DAILY_TOKEN_LIMIT   = 500000;     // 500,000 tokens per day
const CHUNK_SIZE = 80000;               // 80,000 characters ≈ 20,000 tokens (1 token ≈ 4 characters).
const MAX_CHUNK_SUMMARY_TOKENS = 1500;  // 1,500 tokens ≈ 1,100 words
const MAX_FINAL_SUMMARY_TOKENS = 8000;  // 8,000 tokens ≈ 6,000 words
const CHUNK_DELAY_MS = 60000; // 60 seconds or 1 minute
const AI_TIMEOUT_MS = 600000; // 10 minutes per individual API call

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── runSummarization ──
// The actual work. Returns the final summary string, or throws. No req/res here —
// this is called from the background, not directly by a route.
async function runSummarization(text) {

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

    chunkSummaries.push(chunkData.choices[0].message.content);

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
          max_tokens: MAX_FINAL_SUMMARY_TOKENS,
          messages: [
            {
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
  return finalSummary;
}

// ── friendlyError ──
// Turns a thrown error into a user-facing message (same cases the old handler had).
function friendlyError(err) {
  if (err.name === 'AbortError') {
    return 'The AI took too long to summarize. Try again, or use a shorter document.';
  }
  if (err.status === 429) {
    const waitMatch = err.message?.match(/please try again in ([^\."]+)/i);
    const waitTime  = waitMatch ? waitMatch[1].trim() : null;
    return waitTime
      ? `You have hit the AI usage limit while summarizing. Please wait ${waitTime} before trying again.`
      : 'You have hit the AI usage limit while summarizing. Please wait a minute before trying again.';
  }
  return 'Failed to summarize the document. Please try again.';
}

// ── startSummarize ──
// Handles: POST /api/summarize
// Creates a job, responds with its id immediately, and runs the work in the background.
const startSummarize = async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text was provided to summarize.' });
  }

  let job;
  try {
    job = await SummaryJob.create({ userId: req.user._id, status: 'processing' });
  } catch (err) {
    console.error('[Summarize] Could not create job:', err.message);
    return res.status(500).json({ error: 'Failed to start summarization. Please try again.' });
  }

  // Respond immediately — the connection closes in milliseconds, so no proxy timeout.
  res.status(202).json({ jobId: job._id });

  // Fire-and-forget: do the slow work, then record the outcome on the job.
  runSummarization(text)
    .then(summary =>
      SummaryJob.findByIdAndUpdate(job._id, { status: 'completed', result: summary })
    )
    .catch(err => {
      console.error(`[Summarize] Job ${job._id} failed:`, err.message);
      return SummaryJob
        .findByIdAndUpdate(job._id, { status: 'failed', error: friendlyError(err) })
        .catch(e => console.error('[Summarize] Could not mark job failed:', e.message));
    });
};

// ── getSummaryJob ──
// Handles: GET /api/summarize/:jobId
// The status endpoint the frontend polls. Returns { status, result, error }.
const getSummaryJob = async (req, res) => {
  try {
    const job = await SummaryJob.findById(req.params.jobId);

    if (!job) return res.status(404).json({ error: 'Summary job not found.' });

    if (job.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({ status: job.status, result: job.result, error: job.error });
  } catch (err) {
    console.error('[Summarize] Status check failed:', err.message);
    res.status(500).json({ error: 'Failed to check summary status.' });
  }
};

module.exports = { startSummarize, getSummaryJob };
