// API endpoint testing setup with supertest
import request from 'supertest';
import { createServer } from '../../backend/src/server.js';
import nock from 'nock';

let app;
let server;

// Setup test server before all tests
beforeAll(async () => {
  console.log('Setting up API test server...');
  
  // Create test server instance
  app = await createServer({
    testing: true,
    database: global.testDb,
    redis: global.testRedis,
  });
  
  // Start server on random port
  server = app.listen(0);
  const port = server.address().port;
  process.env.TEST_SERVER_PORT = port;
  
  console.log(`API test server running on port ${port}`);
}, 30000);

// Cleanup after all tests
afterAll(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('API test server stopped');
});

// Clean up HTTP mocks between tests
beforeEach(() => {
  nock.cleanAll();
});

afterEach(() => {
  nock.cleanAll();
});

// Make supertest request available globally
global.apiRequest = request(app);

// API test utilities
global.apiUtils = {
  // Authentication helpers
  async getAuthToken(user) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },
  
  async authenticatedRequest(method, path, user, data = null) {
    const token = await this.getAuthToken(user);
    let req = request(app)[method.toLowerCase()](path)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json');
    
    if (data) {
      req = req.send(data);
    }
    
    return req;
  },
  
  // GraphQL request helper
  async graphqlRequest(query, variables = {}, user = null) {
    let req = request(app)
      .post('/api/v1/graphql')
      .send({ query, variables });
    
    if (user) {
      const token = await this.getAuthToken(user);
      req = req.set('Authorization', `Bearer ${token}`);
    }
    
    return req;
  },
  
  // Mock external APIs
  mockRainforestAPI(searchTerm, mockResponse) {
    return nock('https://api.rainforestapi.com')
      .get('/request')
      .query(true)
      .reply(200, mockResponse);
  },
  
  mockAnthropicAPI(mockResponse) {
    return nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, mockResponse);
  },
  
  // Common test data
  getRainforestMockResponse(searchTerm = 'xbox') {
    return {
      search_results: [
        {
          asin: 'B08N5WRWNW',
          title: 'Xbox Wireless Controller',
          price: { raw: 59.99 },
          image: 'https://example.com/xbox-controller.jpg',
          rating: 4.5,
          ratings_total: 15000,
          link: 'https://amazon.com/dp/B08N5WRWNW',
        },
        {
          asin: 'B08GG17K5Q',
          title: 'Xbox Series X Console',
          price: { raw: 499.99 },
          image: 'https://example.com/xbox-series-x.jpg',
          rating: 4.7,
          ratings_total: 8500,
          link: 'https://amazon.com/dp/B08GG17K5Q',
        },
      ],
    };
  },
  
  getAnthropicMockResponse(message = 'Here are some great Xbox recommendations!') {
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      model: 'claude-3-sonnet-20240229',
      role: 'assistant',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 25,
      },
    };
  },
  
  // Rate limiting test helpers
  async testRateLimit(endpoint, maxRequests = 5, user = null) {
    const requests = [];
    
    for (let i = 0; i < maxRequests + 1; i++) {
      let req = request(app).get(endpoint);
      
      if (user) {
        const token = await this.getAuthToken(user);
        req = req.set('Authorization', `Bearer ${token}`);
      }
      
      requests.push(req);
    }
    
    const responses = await Promise.all(requests);
    return responses;
  },
  
  // Validation helpers
  expectValidationError(response, field) {
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('validation');
    if (field) {
      expect(response.body.details).toContain(field);
    }
  },
  
  expectAuthError(response) {
    expect([401, 403]).toContain(response.status);
    expect(response.body.error).toMatch(/auth|unauthorized|forbidden/i);
  },
  
  expectRateLimitError(response) {
    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/rate limit|too many requests/i);
  },
  
  // Response validation
  expectSuccessResponse(response, expectedStatus = 200) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body.error).toBeUndefined();
  },
  
  expectGraphQLSuccess(response) {
    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data).toBeDefined();
  },
  
  expectGraphQLError(response, errorMessage = null) {
    expect(response.status).toBe(200); // GraphQL returns 200 even for errors
    expect(response.body.errors).toBeDefined();
    expect(Array.isArray(response.body.errors)).toBe(true);
    
    if (errorMessage) {
      const hasError = response.body.errors.some(error => 
        error.message.includes(errorMessage)
      );
      expect(hasError).toBe(true);
    }
  },
};
