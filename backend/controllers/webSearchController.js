// webSearchController.js
// Manual scraper with fallback chain (no Tavily):
//   1. Google (attempted first)  2. DuckDuckGo (fallback)  3. null
// Returns { text, sources } or null — same contract as before.
// Needs: npm install cheerio

const cheerio = require('cheerio');

const GOOGLE_URL = 'https://www.google.com/search';
const DDG_URL = 'https://html.duckduckgo.com/html/';
const SEARCH_TIMEOUT_MS = 15000;
const PAGES_TO_READ = 4;
const MAX_CHARS_PER_PAGE = 2000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Cookie': 'CONSENT=YES+1',
  'Accept-Language': 'en-US,en;q=0.9'
};


function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, noscript, iframe').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}


async function downloadPage(url) {
  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal:  AbortSignal.timeout(SEARCH_TIMEOUT_MS)
    });
    if (!response.ok) return null;
    return await response.text();
  } catch (err) {
    return null;
  }
}


async function getGoogleLinks(query) {
  const url = GOOGLE_URL +
    '?q=' + encodeURIComponent(query) +
    '&num=10&hl=en&gl=us';

  const html = await downloadPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const links = [];

  $('a[href^="/url?q="]').each(function (i, el) {
    if (links.length >= PAGES_TO_READ) return;

    const href = $(el).attr('href');
    const match = href.match(/[?&]q=([^&]+)/);
    if (!match) return;

    const realUrl = decodeURIComponent(match[1]);
    if (realUrl.includes('google.com')) return;

    const title = $(el).find('h3').first().text().trim();
    if (realUrl) links.push({ title: title || realUrl, url: realUrl });
  });

  return links;
}


async function getDuckDuckGoLinks(query) {
  const url = DDG_URL + '?q=' + encodeURIComponent(query);

  const html = await downloadPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const links = [];

  $('a.result__a').each(function (i, el) {
    if (links.length >= PAGES_TO_READ) return;

    let url = $(el).attr('href');
    if (!url) return;

    const match = url.match(/uddg=([^&]+)/);
    if (match) url = decodeURIComponent(match[1]);

    const title = $(el).text().trim();
    if (url) links.push({ title: title || url, url: url });
  });

  return links;
}


async function scrapeLinks(links) {
  const pages = [];
  for (const link of links) {
    const pageHtml = await downloadPage(link.url);
    if (!pageHtml) continue;

    const text = htmlToText(pageHtml).slice(0, MAX_CHARS_PER_PAGE);
    if (!text) continue;

    pages.push({ title: link.title, url: link.url, text: text });
  }
  return pages;
}


function buildResult(pages, query, engine) {
  if (pages.length === 0) return null;

  const text = pages
    .map((p, i) => `[Result ${i + 1}] ${p.title}\n${p.text}\nSource: ${p.url}`)
    .join('\n\n---\n\n');

  const sources = pages.map(p => ({ title: p.title, url: p.url }));

  console.log(`[WebSearch] Scraped ${pages.length} pages from ${engine} for: "${query}"`);
  return { text, sources };
}


async function searchWeb(query) {
  if (!query || !query.trim()) return null;

  const googleLinks = await getGoogleLinks(query);
  if (googleLinks.length > 0) {
    const result = buildResult(await scrapeLinks(googleLinks), query, 'Google');
    if (result) return result;
  }
  console.error('[WebSearch] Google failed or empty — falling back to DuckDuckGo.');

  const ddgLinks = await getDuckDuckGoLinks(query);
  if (ddgLinks.length > 0) {
    const result = buildResult(await scrapeLinks(ddgLinks), query, 'DuckDuckGo');
    if (result) return result;
  }

  console.error('[WebSearch] Both Google and DuckDuckGo returned nothing.');
  return null;
}

module.exports = { searchWeb };
