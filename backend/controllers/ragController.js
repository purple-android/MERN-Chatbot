let embedder = null;

async function loadEmbedder() {

  console.log('[RAG] Loading embedding model "Xenova/all-MiniLM-L6-v2"...');
  console.log('[RAG] First run will download ~25 MB. Subsequent runs use the cache.');

  const { pipeline } = await import('@xenova/transformers');

  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  console.log('[RAG] Embedder loaded and ready.');
}

async function embedText(text) {

  if (!embedder) {
    throw new Error('Embedder is not loaded yet. Call loadEmbedder() first (it normally runs at server startup).');
  }

  if (!text || !text.trim()) {
    throw new Error('Cannot embed empty text.');
  }

  const output = await embedder(text, { pooling: 'mean', normalize: true });

  return Array.from(output.data);
}

function isEmbedderReady() {
  return embedder !== null;
}

module.exports = { loadEmbedder, embedText, isEmbedderReady };
