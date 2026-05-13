// ── Module-level state ──
// embedderReady is set to true after loadEmbedder() succeeds at startup.
// We declare it with 'let' (not 'const') because its value changes.
let embedderReady = false;


// ── Constants ──
// The Voyage AI model to use. voyage-3-lite is the cheapest and fastest option.
// Newer/larger models exist if you want higher quality at the cost of money + speed.
const VOYAGE_MODEL = 'voyage-3-lite';

// The number of dimensions in the embedding vector this model produces.
// voyage-3-lite → 512 numbers per embedding.
// IMPORTANT: when you create the Atlas Vector Search Index, this number MUST match
// the 'numDimensions' you set there, otherwise searches will fail.
const EMBEDDING_DIMENSIONS = 512;

// The endpoint URL for Voyage's embeddings API. Documented at:
//   https://docs.voyageai.com/reference/embeddings-api
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

// How long to wait for the Voyage API to respond before giving up (in milliseconds).
// 30 seconds is generous — embeddings normally come back in under a second.
const VOYAGE_TIMEOUT_MS = 30000;


// Chunking constants for indexDocument()
const CHUNK_SIZE       = 1000;   // characters per chunk (~250 tokens)
const CHUNK_OVERLAP    = 100;    // chars of overlap between adjacent chunks
const MIN_CHUNK_LENGTH = 50;     // skip chunks smaller than this — too noisy

const mongoose = require('mongoose');

const LibraryFile  = require('../models/LibraryFile');
const LibraryChunk = require('../models/LibraryChunk');

async function loadEmbedder() {

  console.log('[RAG] Verifying Voyage AI connection...');

  if (!process.env.VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is not set in .env — Voyage AI cannot be used.');
  }

  const testVector = await callVoyageAPI('connection test', 'document');

  if (!Array.isArray(testVector) || testVector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Voyage returned an unexpected vector shape: expected ${EMBEDDING_DIMENSIONS}` +
      ` numbers but got ${testVector?.length}`
    );
  }

  embedderReady = true;

  console.log(`[RAG] Voyage AI ready. Model: ${VOYAGE_MODEL}, dimensions: ${EMBEDDING_DIMENSIONS}.`);
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
    throw new Error('Embedder is not ready yet — Voyage AI connection has not been verified.');
  }

  if (!text || !text.trim()) {
    throw new Error('Cannot embed empty text.');
  }

  if (inputType !== 'document' && inputType !== 'query') {
    throw new Error(`inputType must be 'document' or 'query', got '${inputType}'`);
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
      vector
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

async function retrieveChunks(question, userId, k = 5) {

  if (!isEmbedderReady()) {
    throw new Error('Embedder is not ready — cannot retrieve chunks.');
  }

  const queryVector = await embedText(question, 'query');

  let results;
  try {
    results = await LibraryChunk.aggregate([
      {
        $vectorSearch: {
          index:         'chunks_vector_index',
          path:          'vector',
          queryVector:   queryVector,
          numCandidates: 100,
          limit:         k,
          filter:        { userId: new mongoose.Types.ObjectId(userId) }
        }
      },
      {
        $project: {
          _id:           0,
          text:          1,
          chunkIndex:    1,
          libraryFileId: 1,
          score:         { $meta: 'vectorSearchScore' }
        }
      }
    ]);
  } catch (err) {
    throw new Error(`Vector search failed: ${err.message}. Is the 'chunks_vector_index' Atlas Search index created?`);
  }

  const fileIds = [...new Set(results.map(r => r.libraryFileId.toString()))];

  const files = await LibraryFile.find({ _id: { $in: fileIds } }, 'filename');

  const fileMap = new Map(files.map(f => [f._id.toString(), f.filename]));

  const enriched = results.map(r => ({
    text:       r.text,
    score:      r.score,
    chunkIndex: r.chunkIndex,
    filename:   fileMap.get(r.libraryFileId.toString()) || '(deleted file)'
  }));

  console.log(`[RAG] Retrieved ${enriched.length} chunks for the question (top score: ${enriched[0]?.score?.toFixed(3) || 'n/a'})`);

  return enriched;
}


module.exports = { loadEmbedder, embedText, isEmbedderReady, indexDocument, retrieveChunks };
