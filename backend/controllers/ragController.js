let embedderReady  = false;
let activeEmbedder = null;
let xenovaPipeline = null;

const XENOVA_MODEL      = 'Xenova/all-MiniLM-L6-v2';
const XENOVA_DIMENSIONS = 384;

const VOYAGE_MODEL      = 'voyage-3-lite';
const VOYAGE_DIMENSIONS = 512;

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

const VOYAGE_TIMEOUT_MS = 30000;

function getActiveDimensions() {
  if (activeEmbedder === 'xenova') return XENOVA_DIMENSIONS;
  if (activeEmbedder === 'voyage') return VOYAGE_DIMENSIONS;
  return 0;
}

const CHUNK_SIZE       = 1000;
const CHUNK_OVERLAP    = 100;
const MIN_CHUNK_LENGTH = 50;

const LibraryFile  = require('../models/LibraryFile');
const LibraryChunk = require('../models/LibraryChunk');

async function loadXenova() {
  const { pipeline } = await import('@xenova/transformers');

  xenovaPipeline = await pipeline('feature-extraction', XENOVA_MODEL);

  const out = await xenovaPipeline('connection test', { pooling: 'mean', normalize: true });
  const vec = Array.from(out.data);
  if (vec.length !== XENOVA_DIMENSIONS) {
    throw new Error(`Xenova returned ${vec.length} dims, expected ${XENOVA_DIMENSIONS}`);
  }
}

async function loadEmbedder() {

  console.log('[RAG] Trying local Xenova embedder first...');
  try {
    await loadXenova();
    activeEmbedder = 'xenova';
    embedderReady  = true;
    console.log(`[RAG] ✅ Using XENOVA (local). Model: ${XENOVA_MODEL}, dimensions: ${XENOVA_DIMENSIONS}.`);
    return;
  } catch (xenovaErr) {
    console.warn('[RAG] Xenova failed to load:', xenovaErr.message);
    console.warn('[RAG] Falling back to Voyage AI...');
  }

  if (!process.env.VOYAGE_API_KEY) {
    throw new Error('Xenova failed AND VOYAGE_API_KEY is not set — no embedder available.');
  }

  const testVector = await callVoyageAPI('connection test', 'document');
  if (!Array.isArray(testVector) || testVector.length !== VOYAGE_DIMENSIONS) {
    throw new Error(
      `Voyage returned an unexpected vector shape: expected ${VOYAGE_DIMENSIONS}` +
      ` numbers but got ${testVector?.length}`
    );
  }

  activeEmbedder = 'voyage';
  embedderReady  = true;
  console.log(`[RAG] ✅ Using VOYAGE (fallback). Model: ${VOYAGE_MODEL}, dimensions: ${VOYAGE_DIMENSIONS}.`);
}

function isEmbedderReady() {
  return embedderReady;
}

async function callVoyageAPI(text, inputType) {

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), VOYAGE_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(VOYAGE_API_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: [text],
        model: VOYAGE_MODEL,
        input_type: inputType
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Voyage API error (${response.status}): ${errorBody}`);
  }

  const json = await response.json();

  if (!json.data || !json.data[0] || !Array.isArray(json.data[0].embedding)) {
    throw new Error('Voyage returned an unexpected response shape.');
  }

  return json.data[0].embedding;
}

async function embedText(text, inputType = 'document') {

  if (!embedderReady) {
    throw new Error('Embedder is not ready yet — no embedder was loaded at startup.');
  }

  if (!text || !text.trim()) {
    throw new Error('Cannot embed empty text.');
  }

  if (inputType !== 'document' && inputType !== 'query') {
    throw new Error(`inputType must be 'document' or 'query', got '${inputType}'`);
  }

  if (activeEmbedder === 'xenova') {
    const out = await xenovaPipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  }

  return callVoyageAPI(text, inputType);
}

async function indexDocument(text, userId, filename, size) {

  if (!isEmbedderReady()) {
    throw new Error('Embedder is not ready yet — try again in a moment.');
  }
  if (!text || !text.trim()) {
    throw new Error('Cannot index a document with no text.');
  }

  const libraryFile = await LibraryFile.create({
    userId,
    filename,
    size:       size || 0,
    chunkCount: 0,
    status:     'indexing'
  });

  console.log(`[RAG] Starting indexing for "${filename}" (LibraryFile _id: ${libraryFile._id})`);

  const chunks = [];
  const step   = CHUNK_SIZE - CHUNK_OVERLAP;

  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + CHUNK_SIZE);
    if (chunk.trim().length < MIN_CHUNK_LENGTH) continue;
    chunks.push(chunk);
  }

  console.log(`[RAG] Split into ${chunks.length} chunks of up to ${CHUNK_SIZE} chars each.`);

  const records = [];
  for (let i = 0; i < chunks.length; i++) {

    if (i % 10 === 0) {
      console.log(`[RAG] Embedding chunk ${i + 1}/${chunks.length}...`);
    }

    const vector = await embedText(chunks[i], 'document');

    records.push({
      libraryFileId: libraryFile._id,
      userId,
      chunkIndex: i,
      text:       chunks[i],
      vector,
      embedder:   activeEmbedder
    });
  }

  await LibraryChunk.insertMany(records);

  console.log(`[RAG] Saved ${records.length} chunks to MongoDB.`);

  libraryFile.chunkCount = records.length;
  libraryFile.status     = 'ready';
  await libraryFile.save();

  console.log(`[RAG] Indexing complete for "${filename}".`);

  return libraryFile;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);

  if (denominator === 0) return 0;

  return dot / denominator;
}

async function retrieveChunks(question, userId, k = 5) {

  if (!isEmbedderReady()) {
    throw new Error('Embedder is not ready — cannot retrieve chunks.');
  }

  const queryVector = await embedText(question, 'query');

  const chunks = await LibraryChunk
    .find({ userId }, 'vector text chunkIndex libraryFileId')
    .lean();

  if (chunks.length === 0) {
    console.log('[RAG] No chunks found for this user — skipping retrieval.');
    return [];
  }

  const scored = chunks.map(chunk => ({
    text:          chunk.text,
    chunkIndex:    chunk.chunkIndex,
    libraryFileId: chunk.libraryFileId,
    score:         cosineSimilarity(queryVector, chunk.vector)
  }));

  const topChunks = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  const fileIds = [...new Set(topChunks.map(c => c.libraryFileId.toString()))];

  const files = await LibraryFile.find({ _id: { $in: fileIds } }, 'filename');

  const fileMap = new Map(files.map(f => [f._id.toString(), f.filename]));

  const enriched = topChunks.map(c => ({
    text:       c.text,
    score:      c.score,
    chunkIndex: c.chunkIndex,
    filename:   fileMap.get(c.libraryFileId.toString()) || '(deleted file)'
  }));

  console.log(`[RAG] Brute-force search over ${chunks.length} chunks → top ${enriched.length} (best score: ${enriched[0]?.score?.toFixed(3) || 'n/a'})`);

  return enriched;
}

module.exports = { loadEmbedder, embedText, isEmbedderReady, indexDocument, retrieveChunks };
