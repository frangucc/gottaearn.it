import Redis from 'ioredis';

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Try to connect to Redis
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: true
      });

      // Test connection
      await this.client.connect();
      await this.client.ping();
      
      this.isConnected = true;
      console.log('✅ Redis connected successfully');
      
      // Handle connection events
      this.client.on('error', (err) => {
        console.error('❌ Redis connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔄 Redis reconnected');
        this.isConnected = true;
      });

      return true;
    } catch (error) {
      console.warn('⚠️ Redis connection failed, using in-memory fallback:', error.message);
      this.isConnected = false;
      
      // Create in-memory fallback
      this.setupInMemoryFallback();
      return false;
    }
  }

  setupInMemoryFallback() {
    // Simple in-memory cache as fallback when Redis is not available
    this.memoryCache = new Map();
    this.client = {
      get: async (key) => {
        const data = this.memoryCache.get(key);
        return data ? JSON.stringify(data) : null;
      },
      set: async (key, value, ...args) => {
        const ttl = args.find(arg => arg === 'EX') ? args[args.indexOf('EX') + 1] : null;
        this.memoryCache.set(key, JSON.parse(value));
        
        // Simulate TTL with setTimeout
        if (ttl) {
          setTimeout(() => {
            this.memoryCache.delete(key);
          }, ttl * 1000);
        }
        return 'OK';
      },
      del: async (key) => {
        return this.memoryCache.delete(key) ? 1 : 0;
      },
      exists: async (key) => {
        return this.memoryCache.has(key) ? 1 : 0;
      },
      expire: async (key, seconds) => {
        if (this.memoryCache.has(key)) {
          setTimeout(() => {
            this.memoryCache.delete(key);
          }, seconds * 1000);
          return 1;
        }
        return 0;
      },
      keys: async (pattern) => {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Array.from(this.memoryCache.keys()).filter(key => regex.test(key));
      }
    };
    
    console.log('📦 Using in-memory cache fallback (Redis not available)');
  }

  /**
   * Store session data with TTL
   */
  async setSession(sessionId, data, ttlSeconds = 7200) {
    try {
      const key = `session:${sessionId}`;
      await this.client.set(key, JSON.stringify(data), 'EX', ttlSeconds);
      return true;
    } catch (error) {
      console.error('Error setting session:', error);
      return false;
    }
  }

  /**
   * Get session data
   */
  async getSession(sessionId) {
    try {
      const key = `session:${sessionId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Update session data (merge with existing)
   */
  async updateSession(sessionId, updates, ttlSeconds = 7200) {
    try {
      const existing = await this.getSession(sessionId) || {};
      const updated = { ...existing, ...updates, lastUpdated: new Date().toISOString() };
      return await this.setSession(sessionId, updated, ttlSeconds);
    } catch (error) {
      console.error('Error updating session:', error);
      return false;
    }
  }

  /**
   * Store search results for a session
   */
  async cacheSearchResults(sessionId, searchId, results, ttlSeconds = 3600) {
    try {
      const key = `results:${sessionId}:${searchId}`;
      await this.client.set(key, JSON.stringify({
        results,
        timestamp: new Date().toISOString(),
        searchId
      }), 'EX', ttlSeconds);
      
      // Also update session with latest search ID
      await this.updateSession(sessionId, { 
        lastSearchId: searchId,
        lastSearchTimestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error('Error caching search results:', error);
      return false;
    }
  }

  /**
   * Get cached search results
   */
  async getCachedResults(sessionId, searchId) {
    try {
      const key = `results:${sessionId}:${searchId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached results:', error);
      return null;
    }
  }

  /**
   * Add hearted item for a session
   */
  async addHeartedItem(sessionId, product) {
    try {
      const session = await this.getSession(sessionId) || {};
      const heartedItems = session.heartedItems || [];
      
      // Check if already hearted
      const exists = heartedItems.some(item => 
        item.id === product.id || item.asin === product.asin
      );
      
      if (!exists) {
        heartedItems.push({
          ...product,
          heartedAt: new Date().toISOString()
        });
        
        await this.updateSession(sessionId, { heartedItems });
      }
      
      return heartedItems;
    } catch (error) {
      console.error('Error adding hearted item:', error);
      return [];
    }
  }

  /**
   * Remove hearted item
   */
  async removeHeartedItem(sessionId, productId) {
    try {
      const session = await this.getSession(sessionId) || {};
      const heartedItems = (session.heartedItems || []).filter(item => 
        item.id !== productId && item.asin !== productId
      );
      
      await this.updateSession(sessionId, { heartedItems });
      return heartedItems;
    } catch (error) {
      console.error('Error removing hearted item:', error);
      return [];
    }
  }

  /**
   * Get all hearted items
   */
  async getHeartedItems(sessionId) {
    try {
      const session = await this.getSession(sessionId) || {};
      return session.heartedItems || [];
    } catch (error) {
      console.error('Error getting hearted items:', error);
      return [];
    }
  }

  /**
   * Store conversation context
   */
  async updateConversationContext(sessionId, context) {
    try {
      const session = await this.getSession(sessionId) || {};
      const conversationContext = {
        ...session.conversationContext,
        ...context,
        lastUpdated: new Date().toISOString()
      };
      
      await this.updateSession(sessionId, { conversationContext });
      return conversationContext;
    } catch (error) {
      console.error('Error updating conversation context:', error);
      return null;
    }
  }

  /**
   * Clean up old sessions (run periodically)
   */
  async cleanup() {
    try {
      if (!this.isConnected) return;
      
      const keys = await this.client.keys('session:*');
      console.log(`🧹 Cleaning up ${keys.length} sessions...`);
      
      // Keys will auto-expire with TTL, but this can force cleanup if needed
      return true;
    } catch (error) {
      console.error('Error during cleanup:', error);
      return false;
    }
  }
}

// Create singleton instance
export const redisService = new RedisService();
