// Integration test setup with real database and Redis
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

let postgresContainer;
let redisContainer;
let prisma;
let redis;

// Setup test containers before all tests
beforeAll(async () => {
  console.log('Setting up integration test environment...');
  
  // Start PostgreSQL container
  postgresContainer = await new PostgreSqlContainer('postgres:15')
    .withDatabase('gottaearn_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  
  // Start Redis container
  redisContainer = await new RedisContainer('redis:7')
    .start();
  
  // Update environment variables
  process.env.DATABASE_URL = postgresContainer.getConnectionUri();
  process.env.REDIS_URL = redisContainer.getConnectionUri();
  
  // Initialize Prisma client
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
  
  // Initialize Redis client
  redis = new Redis(process.env.REDIS_URL);
  
  // Run database migrations
  const { execSync } = require('child_process');
  execSync('npx prisma migrate deploy', { 
    env: { ...process.env, DATABASE_URL: postgresContainer.getConnectionUri() },
    stdio: 'inherit'
  });
  
  console.log('Integration test environment ready');
}, 60000); // 60 second timeout for container startup

// Cleanup after all tests
afterAll(async () => {
  console.log('Cleaning up integration test environment...');
  
  if (prisma) {
    await prisma.$disconnect();
  }
  
  if (redis) {
    await redis.quit();
  }
  
  if (postgresContainer) {
    await postgresContainer.stop();
  }
  
  if (redisContainer) {
    await redisContainer.stop();
  }
  
  console.log('Integration test cleanup complete');
}, 30000);

// Clean database between tests
beforeEach(async () => {
  // Clear all tables
  const tablenames = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  `;
  
  for (const { tablename } of tablenames) {
    if (tablename !== '_prisma_migrations') {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
    }
  }
  
  // Clear Redis
  await redis.flushall();
});

// Make clients available globally for tests
global.testDb = prisma;
global.testRedis = redis;

// Test utilities for integration tests
global.integrationUtils = {
  // Seed test data
  async seedTestData() {
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        role: 'USER',
        name: 'Test User',
      },
    });
    
    const admin = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        role: 'ADMIN',
        name: 'Test Admin',
      },
    });
    
    const category = await prisma.category.create({
      data: {
        name: 'Electronics',
        ageGroup: 'TEEN',
        gender: 'UNISEX',
      },
    });
    
    const product = await prisma.product.create({
      data: {
        asin: 'B08N5WRWNW',
        title: 'Test Xbox Controller',
        price: 59.99,
        image: 'https://example.com/controller.jpg',
        rating: 4.5,
        ratingsTotal: 1500,
        categories: {
          connect: { id: category.id },
        },
      },
    });
    
    return { user, admin, category, product };
  },
  
  // Create authenticated request context
  createAuthContext(user) {
    return {
      user,
      req: {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'test-agent',
        },
      },
      res: {
        set: jest.fn(),
      },
    };
  },
  
  // Wait for async operations
  async waitForAsync(fn, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const result = await fn();
        if (result) return result;
      } catch (error) {
        // Continue waiting
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Async operation timed out after ${timeout}ms`);
  },
};
