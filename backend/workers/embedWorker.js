const { parentPort, workerData } = require('worker_threads');

let pipeline = null;
const modelName = workerData.modelName;

(async () => {
  try {
    const transformers = await import('@xenova/transformers');
    pipeline = await transformers.pipeline('feature-extraction', modelName);
    parentPort.postMessage({ type: 'ready' });
  } catch (err) {
    parentPort.postMessage({ type: 'load-error', message: err.message });
  }
})();

parentPort.on('message', async (msg) => {
  if (msg.type === 'embed') {
    try {
      const vectors = [];
      for (let i = 0; i < msg.chunks.length; i++) {
        const out = await pipeline(msg.chunks[i], { pooling: 'mean', normalize: true });
        vectors.push(Array.from(out.data));
        if (i % 10 === 0 || i === msg.chunks.length - 1) {
          parentPort.postMessage({
            type:  'progress',
            done:  i + 1,
            total: msg.chunks.length
          });
        }
      }
      parentPort.postMessage({ type: 'result', vectors });
    } catch (err) {
      parentPort.postMessage({ type: 'error', message: err.message });
    }
  }
});
