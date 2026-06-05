let embedderReady  = false;
let activeEmbedder = null;
let xenovaPipeline = null;

const XENOVA_MODEL      = 'Xenova/all-MiniLM-L6-v2';
const XENOVA_DIMENSIONS = 384;

const VOYAGE_MODEL      = 'voyage-3-lite';
const VOYAGE_DIMENSIONS = 512;

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

const VOYAGE_TIMEOUT_MS = 30000;

const CHUNK_SIZE       = 2000;
const CHUNK_OVERLAP    = 200;
const MIN_CHUNK_LENGTH = 50;

const SAVE_BATCH_SIZE      = 50;
const RESUMABLE_TEXT_LIMIT = 15000000;

const LibraryFile  = require('../models/LibraryFile');
const LibraryChunk = require('../models/LibraryChunk');
const { clearUserCache } = require('../utils/cache');


const { Worker } = require('worker_threads');
const path       = require('path');

const WORKER_POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE) || 3;
const WORKER_PATH      = path.join(__dirname, '..', 'workers', 'embedWorker.js');
const workerPool       = [];
let   indexQueue       = null;

class SimpleQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running     = 0;
    this.queued      = [];
  }
  add(fn) {
    return new Promise((resolve, reject) => {
      this.queued.push({ fn, resolve, reject });
      this._next();
    });
  }
  _next() {
    while (this.running < this.concurrency && this.queued.length > 0) {
      const { fn, resolve, reject } = this.queued.shift();
      this.running++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          this.running--;
          this._next();
        });
    }
  }
}

async function initWorkerPool() {
  console.log(`[RAG] Spawning ${WORKER_POOL_SIZE} embedding workers...`);

  await Promise.all(
    Array.from({ length: WORKER_POOL_SIZE }, () => addWorkerToPool())
  );

  indexQueue = new SimpleQueue(WORKER_POOL_SIZE);
  console.log(`[RAG] ✅ Worker pool ready: ${workerPool.length} workers.`);
}

async function addWorkerToPool() {
  const worker = await spawnWorker(WORKER_PATH);
  const slot = { worker, busy: false };

  worker.once('exit', (code) => {
    if (code === 0) return;
    console.warn(`[RAG] Worker died (exit code ${code}) — respawning a replacement.`);
    const idx = workerPool.indexOf(slot);
    if (idx !== -1) workerPool.splice(idx, 1);
    addWorkerToPool().catch(err =>
      console.error('[RAG] Failed to respawn worker:', err.message)
    );
  });

  workerPool.push(slot);
}

function spawnWorker(workerPath) {
  return new Promise((resolve, reject) => {
    const w = new Worker(workerPath, { workerData: { modelName: XENOVA_MODEL } });
    const onMessage = (msg) => {
      if (msg.type === 'ready') {
        w.off('message', onMessage);
        resolve(w);
      } else if (msg.type === 'load-error') {
        w.off('message', onMessage);
        reject(new Error(msg.message));
      }
    };
    w.on('message', onMessage);
    w.once('error', reject);
  });
}

function embedChunksOnWorker(slot, chunks, filename) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      slot.worker.off('message', handler);
      slot.worker.off('error', onError);
      slot.worker.off('exit', onExit);
    };
    const handler = (msg) => {
      if (msg.type === 'progress') {
        console.log(`[RAG worker] "${filename}": ${msg.done}/${msg.total} chunks embedded`);
      } else if (msg.type === 'result') {
        cleanup();
        resolve(msg.vectors);
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    const onError = (err) => {
      cleanup();
      reject(new Error(`Worker crashed during embedding: ${err.message}`));
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`Worker exited during embedding (code ${code}).`));
    };
    slot.worker.on('message', handler);
    slot.worker.once('error', onError);
    slot.worker.once('exit', onExit);
    slot.worker.postMessage({ type: 'embed', chunks });
  });
}

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

    try {
      await initWorkerPool();
    } catch (poolErr) {
      console.warn('[RAG] Worker pool failed to start:', poolErr.message);
      console.warn('[RAG] Indexing will run on the main thread (slower).');
    }

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


async function splitIntoChunks(text) {
  const chunks = [];
  const step   = CHUNK_SIZE - CHUNK_OVERLAP;
  let made     = 0;

  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + CHUNK_SIZE);
    if (chunk.trim().length < MIN_CHUNK_LENGTH) continue;
    chunks.push(chunk);
    if (++made % 1000 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return chunks;
}

async function embedBatch(texts, label) {
  if (activeEmbedder === 'xenova' && indexQueue && workerPool.length > 0) {
    return indexQueue.add(async () => {
      const slot = acquireFreeWorker();
      if (!slot) {
        const vectors = [];
        for (const t of texts) vectors.push(await embedText(t, 'document'));
        return vectors;
      }
      try {
        return await embedChunksOnWorker(slot, texts, label);
      } finally {
        slot.busy = false;
      }
    });
  }

  const vectors = [];
  for (const t of texts) {
    vectors.push(await embedText(t, 'document'));
  }
  return vectors;
}

function acquireFreeWorker() {
  if (activeEmbedder !== 'xenova') return null;
  const slot = workerPool.find(s => !s.busy);
  if (!slot) return null;
  slot.busy = true;
  return slot;
}

async function embedQuery(question) {
  const slot = acquireFreeWorker();
  if (slot) {
    try {
      const vectors = await embedChunksOnWorker(slot, [question], 'query');
      return vectors[0];
    } finally {
      slot.busy = false;
    }
  }
  return embedText(question, 'query');
}

async function embedAndSaveChunks(libraryFile, text, cancelToken) {

  const bailIfCancelled = async () => {
    if (cancelToken && cancelToken.cancelled) {
      await LibraryChunk.deleteMany({ libraryFileId: libraryFile._id });
      await LibraryFile.findByIdAndDelete(libraryFile._id);
      console.log(`[RAG] Indexing cancelled for "${libraryFile.filename}" — removed partial data.`);
      const cancelErr = new Error('Indexing cancelled by the user.');
      cancelErr.cancelled = true;
      throw cancelErr;
    }
  };

  const chunks = await splitIntoChunks(text);
  console.log(`[RAG] "${libraryFile.filename}" → ${chunks.length} chunks.`);

  const existing = await LibraryChunk
    .find({ libraryFileId: libraryFile._id }, 'chunkIndex embedder')
    .lean();

  let doneSet = new Set(existing.map(c => c.chunkIndex));

  if (existing.length > 0 && existing[0].embedder !== activeEmbedder) {
    console.warn(
      `[RAG] Embedder changed (${existing[0].embedder} → ${activeEmbedder}) — ` +
      `re-indexing "${libraryFile.filename}" from scratch.`
    );
    await LibraryChunk.deleteMany({ libraryFileId: libraryFile._id });
    doneSet = new Set();
  }

  if (doneSet.size > 0) {
    console.log(`[RAG] Resuming "${libraryFile.filename}" — ${doneSet.size}/${chunks.length} chunks already saved.`);
  }

  for (let start = 0; start < chunks.length; start += SAVE_BATCH_SIZE) {

    await bailIfCancelled();

    const end = Math.min(start + SAVE_BATCH_SIZE, chunks.length);

    const batchIndexes = [];
    const batchTexts   = [];
    for (let j = start; j < end; j++) {
      if (doneSet.has(j)) continue;
      batchIndexes.push(j);
      batchTexts.push(chunks[j]);
    }

    if (batchTexts.length === 0) continue;

    const vectors = await embedBatch(batchTexts, libraryFile.filename);

    await bailIfCancelled();

    const records = batchTexts.map((t, k) => ({
      libraryFileId: libraryFile._id,
      userId:        libraryFile.userId,
      chunkIndex:    batchIndexes[k],
      text:          t,
      vector:        vectors[k],
      embedder:      activeEmbedder
    }));

    await LibraryChunk.insertMany(records);

    const savedSoFar = await LibraryChunk.countDocuments({ libraryFileId: libraryFile._id });
    libraryFile.chunkCount = savedSoFar;
    await libraryFile.save();

    console.log(`[RAG] "${libraryFile.filename}": saved ${savedSoFar}/${chunks.length} chunks.`);
  }

  libraryFile.chunkCount = await LibraryChunk.countDocuments({ libraryFileId: libraryFile._id });
  libraryFile.status     = 'ready';
  libraryFile.sourceText = undefined;
  await libraryFile.save();

  console.log(`[RAG] ✅ Indexing complete for "${libraryFile.filename}".`);
}

async function indexDocument(text, userId, filename, size, cancelToken) {

  if (!isEmbedderReady()) {
    throw new Error('Embedder is not ready yet — try again in a moment.');
  }
  if (!text || !text.trim()) {
    throw new Error('Cannot index a document with no text.');
  }

  const storedText = text.length <= RESUMABLE_TEXT_LIMIT ? text : undefined;
  if (!storedText) {
    console.warn(`[RAG] "${filename}" text is very large (${text.length} chars) — not storing it, so this file won't be resumable.`);
  }

  const libraryFile = await LibraryFile.create({
    userId,
    filename,
    size:       size || 0,
    chunkCount: 0,
    status:     'indexing',
    sourceText: storedText
  });

  console.log(`[RAG] Starting indexing for "${filename}" (LibraryFile _id: ${libraryFile._id})`);

  try {
    await embedAndSaveChunks(libraryFile, text, cancelToken);
  } catch (err) {
    if (!err.cancelled) {
      try {
        libraryFile.status = 'failed';
        libraryFile.error  = err.message;
        await libraryFile.save();
      } catch (saveErr) {
        console.error(`[RAG] Could not mark "${filename}" as failed:`, saveErr.message);
      }
    }
    throw err;
  }

  return libraryFile;
}

async function resumeUnfinishedIndexing() {

  if (!isEmbedderReady()) {
    console.warn('[RAG] Skipping resume — no embedder is ready.');
    return;
  }

  const stuck = await LibraryFile.find({ status: 'indexing' });
  if (stuck.length === 0) return;

  console.log(`[RAG] Found ${stuck.length} unfinished file(s) from a previous run — resuming...`);

  for (const lf of stuck) {

    if (!lf.sourceText) {
      console.warn(`[RAG] Cannot resume "${lf.filename}" — its text wasn't stored. Marking as failed.`);
      lf.status = 'failed';
      lf.error  = 'Indexing was interrupted and could not be resumed (source text was not stored).';
      await lf.save();
      continue;
    }

    try {
      console.log(`[RAG] Resuming "${lf.filename}"...`);
      await embedAndSaveChunks(lf, lf.sourceText);
      await clearUserCache(lf.userId);
    } catch (err) {
      console.error(`[RAG] Resume failed for "${lf.filename}":`, err.message);
      lf.status = 'failed';
      lf.error  = err.message;
      await lf.save();
    }
  }
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

  const queryVector = await embedQuery(question);

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

module.exports = { loadEmbedder, embedText, isEmbedderReady, indexDocument, retrieveChunks, resumeUnfinishedIndexing };
