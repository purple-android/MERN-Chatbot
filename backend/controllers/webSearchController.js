// webSearchController.js
// Uses Tavily (https://tavily.com) to fetch live web results for a query.
// Needs TAVILY_API_KEY in backend/.env.

const TAVILY_API_URL = 'https://api.tavily.com/search';
const SEARCH_TIMEOUT_MS = 60000;
const MAX_RESULTS = 20;


// ── searchWeb ──
// Returns { text, sources } where text is the result block for the AI
// and sources is an array of { title, url } for the UI. Returns null if
// search is unavailable / fails (chat falls back to no web context).
async function searchWeb(query) {

  if (!process.env.TAVILY_API_KEY) {
    console.error('[WebSearch] TAVILY_API_KEY is not set in .env — skipping web search.');
    return null;
  }

  if (!query || !query.trim()) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:        process.env.TAVILY_API_KEY,
        query:          query,
        max_results:    MAX_RESULTS,
        include_answer: true,
        search_depth:   'basic'
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[WebSearch] Tavily error (${response.status}): ${errorBody}`);
      return null;
    }

    const data = await response.json();

    const resultsList = data.results || [];

    const resultsText = resultsList
      .map((r, i) => `[Result ${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`)
      .join('\n\n---\n\n');

    const quickAnswer = data.answer
      ? `Quick summary from the web: ${data.answer}\n\n`
      : '';

    if (!resultsText && !quickAnswer) return null;

    const sources = resultsList
      .filter(r => r.url)
      .map(r => ({ title: r.title || r.url, url: r.url }));

    console.log(`[WebSearch] Got ${resultsList.length} results for: "${query}"`);

    return { text: quickAnswer + resultsText, sources };

  } catch (err) {
    console.error('[WebSearch] Search failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchWeb };
