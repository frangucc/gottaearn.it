// Integration tests for product search functionality
describe('Product Search Integration', () => {
  let testUser, testAdmin, testCategory;

  beforeEach(async () => {
    // Seed test data
    const seedData = await global.integrationUtils.seedTestData();
    testUser = seedData.user;
    testAdmin = seedData.admin;
    testCategory = seedData.category;
  });

  describe('Database Operations', () => {
    test('should create and retrieve products', async () => {
      const productData = {
        asin: 'B08TEST123',
        title: 'Test Gaming Headset',
        price: 79.99,
        image: 'https://example.com/headset.jpg',
        rating: 4.3,
        ratingsTotal: 2500,
      };

      // Create product
      const product = await global.testDb.product.create({
        data: {
          ...productData,
          categories: {
            connect: { id: testCategory.id },
          },
        },
        include: {
          categories: true,
        },
      });

      expect(product.asin).toBe(productData.asin);
      expect(product.title).toBe(productData.title);
      expect(product.categories).toHaveLength(1);
      expect(product.categories[0].id).toBe(testCategory.id);

      // Retrieve product
      const retrievedProduct = await global.testDb.product.findUnique({
        where: { asin: productData.asin },
        include: { categories: true },
      });

      expect(retrievedProduct).toBeTruthy();
      expect(retrievedProduct.title).toBe(productData.title);
    });

    test('should search products by category', async () => {
      // Create multiple products
      await global.testDb.product.createMany({
        data: [
          {
            asin: 'B08GAME001',
            title: 'Gaming Mouse',
            price: 49.99,
            image: 'https://example.com/mouse.jpg',
            rating: 4.5,
            ratingsTotal: 1200,
          },
          {
            asin: 'B08GAME002',
            title: 'Gaming Keyboard',
            price: 89.99,
            image: 'https://example.com/keyboard.jpg',
            rating: 4.7,
            ratingsTotal: 800,
          },
        ],
      });

      // Connect products to category
      await global.testDb.category.update({
        where: { id: testCategory.id },
        data: {
          products: {
            connect: [
              { asin: 'B08GAME001' },
              { asin: 'B08GAME002' },
            ],
          },
        },
      });

      // Search products by category
      const products = await global.testDb.product.findMany({
        where: {
          categories: {
            some: {
              id: testCategory.id,
            },
          },
        },
        include: {
          categories: true,
        },
      });

      expect(products).toHaveLength(3); // 2 new + 1 from seed data
      products.forEach(product => {
        expect(product.categories.some(cat => cat.id === testCategory.id)).toBe(true);
      });
    });
  });

  describe('Cache Integration', () => {
    test('should cache and retrieve search results', async () => {
      const searchQuery = 'gaming headset';
      const mockResults = [
        { asin: 'B08TEST001', title: 'Gaming Headset 1', price: 59.99 },
        { asin: 'B08TEST002', title: 'Gaming Headset 2', price: 79.99 },
      ];

      // Cache search results
      await global.testRedis.setex(
        'gottaearn:search:gaming%20headset',
        1800,
        JSON.stringify(mockResults)
      );

      // Retrieve from cache
      const cached = await global.testRedis.get('gottaearn:search:gaming%20headset');
      const parsedResults = JSON.parse(cached);

      expect(parsedResults).toEqual(mockResults);
    });

    test('should invalidate cache when product is updated', async () => {
      const cacheKey = 'gottaearn:product:B08N5WRWNW';
      const productData = { title: 'Updated Product', price: 99.99 };

      // Set initial cache
      await global.testRedis.setex(cacheKey, 3600, JSON.stringify(productData));
      
      // Verify cache exists
      let cached = await global.testRedis.get(cacheKey);
      expect(cached).toBeTruthy();

      // Simulate cache invalidation
      await global.testRedis.del(cacheKey);
      await global.testRedis.del('gottaearn:search:*'); // Would use pattern deletion in real implementation

      // Verify cache is cleared
      cached = await global.testRedis.get(cacheKey);
      expect(cached).toBeNull();
    });
  });

  describe('Search Analytics', () => {
    test('should track search frequency', async () => {
      const searchTerm = 'xbox controller';
      const userId = testUser.id;

      // Create search analytics entry
      const analytics = await global.testDb.searchAnalytics.create({
        data: {
          searchTerm,
          userId,
          resultCount: 15,
          clickedResults: [],
        },
      });

      expect(analytics.searchTerm).toBe(searchTerm);
      expect(analytics.userId).toBe(userId);
      expect(analytics.resultCount).toBe(15);

      // Simulate multiple searches for the same term
      await global.testDb.searchAnalytics.createMany({
        data: [
          { searchTerm, userId, resultCount: 12 },
          { searchTerm, userId: testAdmin.id, resultCount: 18 },
        ],
      });

      // Query search frequency
      const searchCount = await global.testDb.searchAnalytics.count({
        where: { searchTerm },
      });

      expect(searchCount).toBe(3);
    });

    test('should calculate product popularity scores', async () => {
      const productAsin = 'B08N5WRWNW';

      // Create multiple search analytics with clicks on the product
      await global.testDb.searchAnalytics.createMany({
        data: [
          {
            searchTerm: 'xbox',
            userId: testUser.id,
            resultCount: 10,
            clickedResults: [productAsin],
          },
          {
            searchTerm: 'controller',
            userId: testAdmin.id,
            resultCount: 8,
            clickedResults: [productAsin],
          },
          {
            searchTerm: 'gaming',
            userId: testUser.id,
            resultCount: 15,
            clickedResults: [productAsin, 'B08OTHER01'],
          },
        ],
      });

      // Calculate popularity (clicks / total searches)
      const totalSearches = await global.testDb.searchAnalytics.count();
      const searchesWithProduct = await global.testDb.searchAnalytics.count({
        where: {
          clickedResults: {
            has: productAsin,
          },
        },
      });

      const popularityScore = searchesWithProduct / totalSearches;
      expect(popularityScore).toBe(1); // 3/3 = 100% click rate
      expect(totalSearches).toBe(3);
      expect(searchesWithProduct).toBe(3);
    });
  });

  describe('User Interactions', () => {
    test('should track user favorites', async () => {
      const product = await global.testDb.product.findFirst();
      
      // Add product to user favorites
      await global.testDb.user.update({
        where: { id: testUser.id },
        data: {
          favorites: {
            connect: { id: product.id },
          },
        },
      });

      // Verify favorite was added
      const userWithFavorites = await global.testDb.user.findUnique({
        where: { id: testUser.id },
        include: { favorites: true },
      });

      expect(userWithFavorites.favorites).toHaveLength(1);
      expect(userWithFavorites.favorites[0].id).toBe(product.id);
    });

    test('should create user chat sessions', async () => {
      const chatSession = await global.testDb.chatSession.create({
        data: {
          userId: testUser.id,
          messages: [
            {
              role: 'user',
              content: 'I need a gaming headset for my Xbox',
              timestamp: new Date(),
            },
            {
              role: 'assistant',
              content: 'Here are some great gaming headsets for Xbox...',
              timestamp: new Date(),
            },
          ],
        },
      });

      expect(chatSession.userId).toBe(testUser.id);
      expect(chatSession.messages).toHaveLength(2);
      expect(chatSession.messages[0].role).toBe('user');
      expect(chatSession.messages[1].role).toBe('assistant');
    });
  });

  describe('Data Consistency', () => {
    test('should maintain referential integrity', async () => {
      const product = await global.testDb.product.findFirst();
      
      // Try to delete category that has products
      await expect(
        global.testDb.category.delete({
          where: { id: testCategory.id },
        })
      ).rejects.toThrow(); // Should fail due to foreign key constraint
    });

    test('should cascade delete user data', async () => {
      // Create user-related data
      await global.testDb.chatSession.create({
        data: {
          userId: testUser.id,
          messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        },
      });

      await global.testDb.searchAnalytics.create({
        data: {
          searchTerm: 'test',
          userId: testUser.id,
          resultCount: 1,
        },
      });

      // Delete user (should cascade)
      await global.testDb.user.delete({
        where: { id: testUser.id },
      });

      // Verify related data is cleaned up
      const chatSessions = await global.testDb.chatSession.findMany({
        where: { userId: testUser.id },
      });
      
      const analytics = await global.testDb.searchAnalytics.findMany({
        where: { userId: testUser.id },
      });

      expect(chatSessions).toHaveLength(0);
      expect(analytics).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    test('should handle large datasets efficiently', async () => {
      const startTime = Date.now();

      // Create many products
      const products = Array.from({ length: 100 }, (_, i) => ({
        asin: `B08PERF${i.toString().padStart(3, '0')}`,
        title: `Performance Test Product ${i}`,
        price: Math.random() * 100,
        image: `https://example.com/product${i}.jpg`,
        rating: 3 + Math.random() * 2,
        ratingsTotal: Math.floor(Math.random() * 10000),
      }));

      await global.testDb.product.createMany({ data: products });

      // Query with pagination
      const paginatedResults = await global.testDb.product.findMany({
        take: 20,
        skip: 0,
        orderBy: { rating: 'desc' },
      });

      const duration = Date.now() - startTime;

      expect(paginatedResults).toHaveLength(20);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
