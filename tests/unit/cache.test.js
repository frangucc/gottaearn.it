// Unit tests for cache manager
import { cacheManager } from '../../config/cache.config.js';

describe('CacheManager', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('key generation', () => {
    test('should generate prefixed cache keys', () => {
      const key = cacheManager.key('test-key');
      expect(key).toBe('gottaearn:test-key');
    });

    test('should handle empty keys', () => {
      const key = cacheManager.key('');
      expect(key).toBe('gottaearn:');
    });
  });

  describe('basic operations', () => {
    test('should set and get cache values', async () => {
      const testData = { id: 1, name: 'Test Product' };
      
      // Mock Redis set and get
      cacheManager.redis.setex.mockResolvedValue('OK');
      cacheManager.redis.get.mockResolvedValue(JSON.stringify(testData));
      
      // Set cache
      const setResult = await cacheManager.set('product:1', testData, 300);
      expect(setResult).toBe(true);
      expect(cacheManager.redis.setex).toHaveBeenCalledWith(
        'gottaearn:product:1',
        300,
        JSON.stringify(testData)
      );
      
      // Get cache
      const cachedData = await cacheManager.get('product:1');
      expect(cachedData).toEqual(testData);
      expect(cacheManager.redis.get).toHaveBeenCalledWith('gottaearn:product:1');
    });

    test('should handle cache miss', async () => {
      cacheManager.redis.get.mockResolvedValue(null);
      
      const result = await cacheManager.get('nonexistent');
      expect(result).toBeNull();
    });

    test('should handle Redis errors gracefully', async () => {
      cacheManager.redis.setex.mockRejectedValue(new Error('Redis error'));
      
      const result = await cacheManager.set('test', { data: 'test' });
      expect(result).toBe(false);
    });
  });

  describe('GraphQL query caching', () => {
    test('should cache GraphQL queries with hashed keys', async () => {
      const query = 'query GetProducts { products { id title } }';
      const variables = { limit: 10 };
      const result = { data: { products: [] } };
      
      cacheManager.redis.setex.mockResolvedValue('OK');
      
      await cacheManager.cacheGraphQLQuery(query, variables, result, 300);
      
      expect(cacheManager.redis.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^gottaearn:graphql:[a-f0-9]{32}$/),
        300,
        JSON.stringify(result)
      );
    });

    test('should generate consistent hashes for same query+variables', () => {
      const query = 'query GetProducts { products { id } }';
      const variables = { limit: 10 };
      
      const hash1 = cacheManager.hashQuery(query, variables);
      const hash2 = cacheManager.hashQuery(query, variables);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{32}$/);
    });

    test('should generate different hashes for different queries', () => {
      const query1 = 'query GetProducts { products { id } }';
      const query2 = 'query GetCategories { categories { id } }';
      
      const hash1 = cacheManager.hashQuery(query1, {});
      const hash2 = cacheManager.hashQuery(query2, {});
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('specialized caching methods', () => {
    test('should cache product data with correct TTL', async () => {
      const productData = {
        asin: 'B08N5WRWNW',
        title: 'Xbox Controller',
        price: 59.99,
      };
      
      cacheManager.redis.setex.mockResolvedValue('OK');
      
      await cacheManager.cacheProduct('B08N5WRWNW', productData);
      
      expect(cacheManager.redis.setex).toHaveBeenCalledWith(
        'gottaearn:product:B08N5WRWNW',
        3600, // 1 hour TTL
        JSON.stringify(productData)
      );
    });

    test('should cache search results with normalized keys', async () => {
      const searchResults = [{ id: 1, title: 'Xbox' }];
      
      cacheManager.redis.setex.mockResolvedValue('OK');
      
      await cacheManager.cacheSearchResults('Xbox Controllers', searchResults);
      
      expect(cacheManager.redis.setex).toHaveBeenCalledWith(
        'gottaearn:search:xbox%20controllers',
        1800, // 30 minutes TTL
        JSON.stringify(searchResults)
      );
    });

    test('should cache user sessions', async () => {
      const userData = { id: 'user-1', role: 'USER' };
      
      cacheManager.redis.setex.mockResolvedValue('OK');
      
      await cacheManager.cacheUserSession('session-123', userData);
      
      expect(cacheManager.redis.setex).toHaveBeenCalledWith(
        'gottaearn:session:session-123',
        86400, // 24 hours TTL
        JSON.stringify(userData)
      );
    });
  });

  describe('cache invalidation', () => {
    test('should invalidate product-related caches', async () => {
      cacheManager.redis.del.mockResolvedValue(1);
      cacheManager.redis.keys.mockResolvedValue([
        'gottaearn:search:xbox',
        'gottaearn:rankings:electronics',
        'gottaearn:graphql:abc123',
      ]);
      
      await cacheManager.invalidateProductCaches('B08N5WRWNW');
      
      expect(cacheManager.redis.del).toHaveBeenCalledWith('gottaearn:product:B08N5WRWNW');
      expect(cacheManager.redis.keys).toHaveBeenCalledTimes(3);
    });

    test('should delete multiple keys by pattern', async () => {
      const mockKeys = [
        'gottaearn:search:xbox',
        'gottaearn:search:playstation',
      ];
      
      cacheManager.redis.keys.mockResolvedValue(mockKeys);
      cacheManager.redis.del.mockResolvedValue(2);
      
      await cacheManager.delPattern('search:*');
      
      expect(cacheManager.redis.keys).toHaveBeenCalledWith('gottaearn:search:*');
      expect(cacheManager.redis.del).toHaveBeenCalledWith(...mockKeys);
    });
  });

  describe('health check', () => {
    test('should return true when Redis is healthy', async () => {
      cacheManager.redis.ping.mockResolvedValue('PONG');
      
      const isHealthy = await cacheManager.isHealthy();
      expect(isHealthy).toBe(true);
    });

    test('should return false when Redis is unhealthy', async () => {
      cacheManager.redis.ping.mockRejectedValue(new Error('Connection failed'));
      
      const isHealthy = await cacheManager.isHealthy();
      expect(isHealthy).toBe(false);
    });
  });

  describe('cache statistics', () => {
    test('should return cache stats when connected', async () => {
      cacheManager.redis.info.mockResolvedValue('used_memory:1024');
      cacheManager.redis.dbsize.mockResolvedValue(100);
      
      const stats = await cacheManager.getStats();
      
      expect(stats).toEqual({
        connected: true,
        keyCount: 100,
        memoryInfo: 'used_memory:1024',
      });
    });

    test('should return error stats when disconnected', async () => {
      cacheManager.redis.info.mockRejectedValue(new Error('Not connected'));
      
      const stats = await cacheManager.getStats();
      
      expect(stats).toEqual({
        connected: false,
        error: 'Not connected',
      });
    });
  });
});
