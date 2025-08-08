// API endpoint tests for product management
describe('Products API Endpoints', () => {
  let testUser, testAdmin, testProduct, testCategory;

  beforeEach(async () => {
    const seedData = await global.integrationUtils.seedTestData();
    testUser = seedData.user;
    testAdmin = seedData.admin;
    testProduct = seedData.product;
    testCategory = seedData.category;
  });

  describe('GET /api/v1/products', () => {
    test('should return paginated products for authenticated users', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'GET',
        '/api/v1/products?limit=10&offset=0',
        testUser
      );

      global.apiUtils.expectSuccessResponse(response);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.products).toBeDefined();
      expect(Array.isArray(response.body.data.products)).toBe(true);
      expect(response.body.data.pagination).toBeDefined();
    });

    test('should filter products by category', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'GET',
        `/api/v1/products?categoryId=${testCategory.id}`,
        testUser
      );

      global.apiUtils.expectSuccessResponse(response);
      response.body.data.products.forEach(product => {
        expect(product.categories.some(cat => cat.id === testCategory.id)).toBe(true);
      });
    });

    test('should filter products by age group', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'GET',
        '/api/v1/products?ageGroup=TEEN',
        testUser
      );

      global.apiUtils.expectSuccessResponse(response);
      // Verify products belong to categories with TEEN age group
      response.body.data.products.forEach(product => {
        expect(product.categories.some(cat => cat.ageGroup === 'TEEN')).toBe(true);
      });
    });

    test('should require authentication', async () => {
      const response = await global.apiRequest.get('/api/v1/products');
      global.apiUtils.expectAuthError(response);
    });

    test('should respect rate limits', async () => {
      const responses = await global.apiUtils.testRateLimit('/api/v1/products', 100, testUser);
      const lastResponse = responses[responses.length - 1];
      
      // Last request should be rate limited
      global.apiUtils.expectRateLimitError(lastResponse);
    });
  });

  describe('GET /api/v1/products/:asin', () => {
    test('should return specific product by ASIN', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'GET',
        `/api/v1/products/${testProduct.asin}`,
        testUser
      );

      global.apiUtils.expectSuccessResponse(response);
      expect(response.body.data.product.asin).toBe(testProduct.asin);
      expect(response.body.data.product.title).toBe(testProduct.title);
    });

    test('should return 404 for non-existent product', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'GET',
        '/api/v1/products/B08NONEXISTENT',
        testUser
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    test('should validate ASIN format', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'GET',
        '/api/v1/products/invalid-asin',
        testUser
      );

      global.apiUtils.expectValidationError(response, 'asin');
    });
  });

  describe('POST /api/v1/products', () => {
    test('should create new product as admin', async () => {
      const newProductData = {
        asin: 'B08NEW12345',
        title: 'New Gaming Mouse',
        price: 49.99,
        image: 'https://example.com/new-mouse.jpg',
        rating: 4.2,
        ratingsTotal: 500,
        categoryIds: [testCategory.id],
      };

      const response = await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products',
        testAdmin,
        newProductData
      );

      global.apiUtils.expectSuccessResponse(response, 201);
      expect(response.body.data.product.asin).toBe(newProductData.asin);
      expect(response.body.data.product.title).toBe(newProductData.title);
      expect(response.body.data.product.categories).toHaveLength(1);
    });

    test('should reject creation by non-admin users', async () => {
      const newProductData = {
        asin: 'B08NEW12345',
        title: 'New Gaming Mouse',
        price: 49.99,
      };

      const response = await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products',
        testUser,
        newProductData
      );

      global.apiUtils.expectAuthError(response);
    });

    test('should validate required fields', async () => {
      const invalidData = {
        title: 'Missing ASIN',
        price: 49.99,
      };

      const response = await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products',
        testAdmin,
        invalidData
      );

      global.apiUtils.expectValidationError(response, 'asin');
    });

    test('should prevent duplicate ASINs', async () => {
      const duplicateData = {
        asin: testProduct.asin, // Existing ASIN
        title: 'Duplicate Product',
        price: 99.99,
      };

      const response = await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products',
        testAdmin,
        duplicateData
      );

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('PUT /api/v1/products/:asin', () => {
    test('should update existing product as admin', async () => {
      const updateData = {
        title: 'Updated Product Title',
        price: 79.99,
        rating: 4.8,
      };

      const response = await global.apiUtils.authenticatedRequest(
        'PUT',
        `/api/v1/products/${testProduct.asin}`,
        testAdmin,
        updateData
      );

      global.apiUtils.expectSuccessResponse(response);
      expect(response.body.data.product.title).toBe(updateData.title);
      expect(response.body.data.product.price).toBe(updateData.price);
      expect(response.body.data.product.rating).toBe(updateData.rating);
    });

    test('should reject updates by non-admin users', async () => {
      const updateData = { title: 'Unauthorized Update' };

      const response = await global.apiUtils.authenticatedRequest(
        'PUT',
        `/api/v1/products/${testProduct.asin}`,
        testUser,
        updateData
      );

      global.apiUtils.expectAuthError(response);
    });

    test('should validate update data', async () => {
      const invalidData = { price: 'not-a-number' };

      const response = await global.apiUtils.authenticatedRequest(
        'PUT',
        `/api/v1/products/${testProduct.asin}`,
        testAdmin,
        invalidData
      );

      global.apiUtils.expectValidationError(response, 'price');
    });
  });

  describe('DELETE /api/v1/products/:asin', () => {
    test('should delete product as admin', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'DELETE',
        `/api/v1/products/${testProduct.asin}`,
        testAdmin
      );

      global.apiUtils.expectSuccessResponse(response, 204);
      
      // Verify product is deleted
      const getResponse = await global.apiUtils.authenticatedRequest(
        'GET',
        `/api/v1/products/${testProduct.asin}`,
        testAdmin
      );
      expect(getResponse.status).toBe(404);
    });

    test('should reject deletion by non-admin users', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'DELETE',
        `/api/v1/products/${testProduct.asin}`,
        testUser
      );

      global.apiUtils.expectAuthError(response);
    });
  });

  describe('POST /api/v1/products/search', () => {
    beforeEach(() => {
      // Mock Rainforest API
      global.apiUtils.mockRainforestAPI('gaming mouse', 
        global.apiUtils.getRainforestMockResponse('gaming mouse')
      );
    });

    test('should search products via Rainforest API', async () => {
      const searchData = {
        query: 'gaming mouse',
        ageGroup: 'TEEN',
        maxResults: 10,
      };

      const response = await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products/search',
        testUser,
        searchData
      );

      global.apiUtils.expectSuccessResponse(response);
      expect(response.body.data.results).toBeDefined();
      expect(Array.isArray(response.body.data.results)).toBe(true);
      expect(response.body.data.query).toBe(searchData.query);
    });

    test('should cache search results', async () => {
      const searchData = { query: 'xbox controller' };

      // First request
      await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products/search',
        testUser,
        searchData
      );

      // Second request should use cache
      const response = await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products/search',
        testUser,
        searchData
      );

      global.apiUtils.expectSuccessResponse(response);
      expect(response.headers['x-cache-status']).toBe('hit');
    });

    test('should track search analytics', async () => {
      const searchData = { query: 'gaming headset' };

      await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products/search',
        testUser,
        searchData
      );

      // Verify analytics were recorded
      const analytics = await global.testDb.searchAnalytics.findFirst({
        where: {
          searchTerm: searchData.query,
          userId: testUser.id,
        },
      });

      expect(analytics).toBeTruthy();
      expect(analytics.searchTerm).toBe(searchData.query);
    });

    test('should handle Rainforest API errors gracefully', async () => {
      // Mock API error
      global.apiUtils.mockRainforestAPI('error-query', null).reply(500, {
        error: 'API Error',
      });

      const searchData = { query: 'error-query' };

      const response = await global.apiUtils.authenticatedRequest(
        'POST',
        '/api/v1/products/search',
        testUser,
        searchData
      );

      expect(response.status).toBe(502);
      expect(response.body.error).toContain('external service');
    });

    test('should respect Rainforest API rate limits', async () => {
      const responses = await global.apiUtils.testRateLimit(
        '/api/v1/products/search',
        10, // Rainforest limit
        testUser
      );

      const lastResponse = responses[responses.length - 1];
      global.apiUtils.expectRateLimitError(lastResponse);
    });
  });

  describe('API Versioning', () => {
    test('should handle version in URL path', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'GET',
        '/api/v1/products',
        testUser
      );

      global.apiUtils.expectSuccessResponse(response);
      expect(response.headers['api-version']).toBe('v1');
    });

    test('should handle version in header', async () => {
      const response = await global.apiRequest
        .get('/api/products')
        .set('Authorization', `Bearer ${await global.apiUtils.getAuthToken(testUser)}`)
        .set('API-Version', 'v1');

      global.apiUtils.expectSuccessResponse(response);
      expect(response.headers['api-version']).toBe('v1');
    });

    test('should reject unsupported versions', async () => {
      const response = await global.apiRequest
        .get('/api/v99/products')
        .set('Authorization', `Bearer ${await global.apiUtils.getAuthToken(testUser)}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Unsupported API version');
    });
  });

  describe('Response Format', () => {
    test('should return consistent response structure', async () => {
      const response = await global.apiUtils.authenticatedRequest(
        'GET',
        '/api/v1/products',
        testUser
      );

      global.apiUtils.expectSuccessResponse(response);
      
      // Check response structure
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('version');
    });

    test('should include proper error format', async () => {
      const response = await global.apiRequest.get('/api/v1/products');

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('timestamp');
    });
  });
});
