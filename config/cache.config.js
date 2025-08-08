import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const CACHE_PREFIX = process.env.REDIS_CACHE_PREFIX || 'gottaearn:';
const DEFAULT_TTL = parseInt(process.env.CACHE_TTL) || 300; // 5 minutes

class CacheManager {
  constructor() {
    this.redis = redis;
    this.prefix = CACHE_PREFIX;
  }

  // Generate cache key with prefix
  key(identifier) {
    return `${this.prefix}${identifier}`;
  }

  // Set cache with TTL
  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(this.key(key), ttl, serialized);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  // Get from cache
  async get(key) {
    try {
      const cached = await this.redis.get(this.key(key));
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Delete from cache
  async del(key) {
    try {
      await this.redis.del(this.key(key));
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  // Delete multiple keys by pattern
  async delPattern(pattern) {
    try {
      const keys = await this.redis.keys(this.key(pattern));
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Cache delete pattern error:', error);
      return false;
    }
  }

  // Cache GraphQL queries
  async cacheGraphQLQuery(query, variables, result, ttl = 300) {
    const cacheKey = `graphql:${this.hashQuery(query, variables)}`;
    return this.set(cacheKey, result, ttl);
  }

  // Get cached GraphQL query
  async getCachedGraphQLQuery(query, variables) {
    const cacheKey = `graphql:${this.hashQuery(query, variables)}`;
    return this.get(cacheKey);
  }

  // Hash query and variables for consistent cache keys
  hashQuery(query, variables) {
    const crypto = require('crypto');
    const queryString = query + JSON.stringify(variables || {});
    return crypto.createHash('md5').update(queryString).digest('hex');
  }

  // Cache product data
  async cacheProduct(asin, productData, ttl = 3600) { // 1 hour for products
    return this.set(`product:${asin}`, productData, ttl);
  }

  async getCachedProduct(asin) {
    return this.get(`product:${asin}`);
  }

  // Cache search results
  async cacheSearchResults(query, results, ttl = 1800) { // 30 minutes for search
    const searchKey = `search:${encodeURIComponent(query.toLowerCase())}`;
    return this.set(searchKey, results, ttl);
  }

  async getCachedSearchResults(query) {
    const searchKey = `search:${encodeURIComponent(query.toLowerCase())}`;
    return this.get(searchKey);
  }

  // Cache user sessions
  async cacheUserSession(sessionId, userData, ttl = 86400) { // 24 hours
    return this.set(`session:${sessionId}`, userData, ttl);
  }

  async getCachedUserSession(sessionId) {
    return this.get(`session:${sessionId}`);
  }

  // Cache rankings (frequently updated)
  async cacheRankings(category, rankings, ttl = 600) { // 10 minutes
    return this.set(`rankings:${category}`, rankings, ttl);
  }

  async getCachedRankings(category) {
    return this.get(`rankings:${category}`);
  }

  // Invalidate related caches when data changes
  async invalidateProductCaches(asin) {
    await this.del(`product:${asin}`);
    await this.delPattern('search:*'); // Invalidate all search caches
    await this.delPattern('rankings:*'); // Invalidate rankings
    await this.delPattern('graphql:*'); // Invalidate GraphQL caches
  }

  async invalidateUserCaches(userId) {
    await this.delPattern(`session:*${userId}*`);
    await this.delPattern('graphql:*'); // User-specific GraphQL queries
  }

  // Health check
  async isHealthy() {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Get cache statistics
  async getStats() {
    try {
      const info = await this.redis.info('memory');
      const keyCount = await this.redis.dbsize();
      
      return {
        connected: true,
        keyCount,
        memoryInfo: info,
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      };
    }
  }
}

// Middleware for caching GraphQL responses
export const graphqlCacheMiddleware = (cache) => {
  return async (req, res, next) => {
    // Only cache GET requests and queries (not mutations)
    if (req.method !== 'GET' && !req.body?.query?.trim().startsWith('query')) {
      return next();
    }

    const { query, variables } = req.body || {};
    if (!query) return next();

    // Try to get from cache
    const cached = await cache.getCachedGraphQLQuery(query, variables);
    if (cached) {
      return res.json(cached);
    }

    // Store original res.json to intercept response
    const originalJson = res.json;
    res.json = function(data) {
      // Cache successful responses
      if (data && !data.errors) {
        cache.cacheGraphQLQuery(query, variables, data);
      }
      return originalJson.call(this, data);
    };

    next();
  };
};

export const cacheManager = new CacheManager();
export default cacheManager;
