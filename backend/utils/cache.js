const crypto = require('crypto');

let Redis = null;
try {
  Redis = require('ioredis');
} catch (e) {
  console.log('[Cache] ioredis is not installed — caching is disabled (app works normally).');
}

let redis = null;

if (Redis && process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: false
  });

  redis.on('error', (err) => {
    console.warn('[Cache] Redis connection error (caching will be skipped):', err.message);
  });

  redis.on('connect', () => {
    console.log('[Cache] ✅ Connected to Redis — RAG search results will be cached.');
  });

} else if (Redis && !process.env.REDIS_URL) {
  console.log('[Cache] No REDIS_URL set in .env — caching is disabled (app works normally).');
}

const TTL_SECONDS = 3600;

function hashQuestion(question) {
  return crypto.createHash('sha256').update(question).digest('hex');
}

function keyForUser(userId) {
  return `rag:${userId}`;
}

async function getCachedChunks(userId, question) {
  if (!redis) return null;
  try {
    const value = await redis.hget(keyForUser(userId), hashQuestion(question));
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.warn('[Cache] get failed (skipping cache):', err.message);
    return null;
  }
}

async function setCachedChunks(userId, question, chunks) {
  if (!redis) return;
  try {
    const key = keyForUser(userId);
    await redis.hset(key, hashQuestion(question), JSON.stringify(chunks));
    await redis.expire(key, TTL_SECONDS);
  } catch (err) {
    console.warn('[Cache] set failed (skipping cache):', err.message);
  }
}

async function clearUserCache(userId) {
  if (!redis) return;
  try {
    await redis.del(keyForUser(userId));
    console.log(`[Cache] Cleared cached RAG results for user ${userId} (library changed).`);
  } catch (err) {
    console.warn('[Cache] clear failed:', err.message);
  }
}

module.exports = { getCachedChunks, setCachedChunks, clearUserCache };
