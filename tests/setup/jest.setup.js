// Global Jest setup
import '@testing-library/jest-dom';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/gottaearn_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.RAINFOREST_API_KEY = 'test-rainforest-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

// Suppress console logs in tests unless debugging
const originalConsole = { ...console };
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Restore console for debugging when needed
global.enableConsole = () => {
  global.console = originalConsole;
};

// Mock external APIs by default
jest.mock('axios');
jest.mock('node-fetch');

// Mock Sentry to avoid sending test errors
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  withScope: jest.fn((callback) => callback({ setTag: jest.fn(), setLevel: jest.fn() })),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  Handlers: {
    requestHandler: () => (req, res, next) => next(),
    tracingHandler: () => (req, res, next) => next(),
    errorHandler: () => (err, req, res, next) => next(err),
  },
}));

// Mock Redis for tests that don't need real Redis
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    info: jest.fn().mockResolvedValue('redis_version:6.0.0'),
    dbsize: jest.fn().mockResolvedValue(0),
    call: jest.fn(),
  };
  
  return jest.fn(() => mockRedis);
});

// Global test utilities
global.testUtils = {
  // Wait for async operations
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create test user data
  createTestUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  }),
  
  // Create test product data
  createTestProduct: (overrides = {}) => ({
    id: 'test-product-id',
    asin: 'B08N5WRWNW',
    title: 'Test Product',
    price: '$29.99',
    image: 'https://example.com/image.jpg',
    rating: 4.5,
    ratingsTotal: 1000,
    createdAt: new Date(),
    ...overrides,
  }),
  
  // Create test GraphQL context
  createTestContext: (user = null) => ({
    user,
    req: { ip: '127.0.0.1', headers: {} },
    res: { set: jest.fn() },
    dataSources: {},
  }),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
