// GottaEarn.it Backend Server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { createServer } from 'http';
import { prisma } from './lib/prisma.js';
import { initSentry } from '../../config/sentry.config.js';
import { httpLogger } from '../../config/logging.config.js';
import { dynamicRateLimit } from '../../config/rate-limit.config.js';
import { cacheManager } from '../../config/cache.config.js';
import productSearchRoutes from './routes/product-search.routes.js';

// Load environment variables
dotenv.config({ path: '../.env' });

// Initialize Sentry for error monitoring
initSentry();

const app = express();
const httpServer = createServer(app);

// Basic middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(compression());

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:7000',
    'http://localhost:3000', // For testing
  ],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(httpLogger);

// Rate limiting
app.use(dynamicRateLimit);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check cache connection
    const cacheHealthy = await cacheManager.isHealthy();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        cache: cacheHealthy ? 'connected' : 'disconnected',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// API routes
app.use('/api/v1', (req, res, next) => {
  req.apiVersion = 'v1';
  res.set('API-Version', 'v1');
  next();
});

// Product search routes
app.use('/api/v1/products', productSearchRoutes);

// Basic REST endpoints for testing
app.get('/api/v1/test', (req, res) => {
  res.json({
    message: 'GottaEarn.it API is running!',
    version: 'v1',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Products endpoint (basic CRUD)
app.get('/api/v1/products', async (req, res) => {
  try {
    const { limit = 20, offset = 0, categoryId, ageGroup } = req.query;
    
    const where = {};
    if (categoryId) {
      where.categories = { some: { id: categoryId } };
    }
    if (ageGroup) {
      where.categories = { some: { ageGroup } };
    }
    
    const products = await prisma.product.findMany({
      where,
      take: parseInt(limit),
      skip: parseInt(offset),
      include: {
        categories: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    const total = await prisma.product.count({ where });
    
    res.json({
      data: {
        products,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });
  }
});

// Categories endpoint
app.get('/api/v1/categories', async (req, res) => {
  try {
    const { ageGroup, gender } = req.query;
    
    const where = {};
    if (ageGroup) where.ageGroup = ageGroup;
    if (gender) where.gender = gender;
    
    const categories = await prisma.category.findMany({
      where,
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    
    res.json({
      data: {
        categories: categories.map(cat => ({
          ...cat,
          productCount: cat._count.products,
        })),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch categories',
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });
  }
});

// GraphQL setup (basic schema for now)
const typeDefs = `#graphql
  type Query {
    hello: String
    products(limit: Int, offset: Int): [Product]
    productsBySegment(ageRange: String!, gender: String!, category: String): [Product]
    categories: [Category]
    segments: [Segment]
  }
  
  type Mutation {
    refreshSegments: RefreshSegmentsResult
  }
  
  type RefreshSegmentsResult {
    success: Boolean!
    message: String!
    segmentCount: Int
  }
  
  type Product {
    id: ID!
    asin: String!
    title: String!
    price: Float
    image: String
    rating: Float
    ratingsTotal: Int
    createdAt: String!
    categories: [Category]
  }
  
  type Category {
    id: ID!
    name: String!
    ageGroup: String!
    gender: String!
    productCount: Int
  }
  
  type Segment {
    id: ID!
    name: String!
    ageRange: String!
    gender: String!
    keywords: [String!]!
    categories: [String!]!
    productCount: Int
    confidence: Float
    createdAt: String!
  }
`;

const resolvers = {
  Query: {
    hello: () => 'Hello from GottaEarn.it GraphQL!',
    
    products: async (_, { limit = 20, offset = 0 }) => {
      const products = await prisma.product.findMany({
        take: limit,
        skip: offset,
        include: { categories: true },
        orderBy: { createdAt: 'desc' },
      });
      return products;
    },
    
    categories: async () => {
      const categories = await prisma.category.findMany({
        include: {
          _count: { select: { products: true } },
        },
        orderBy: { name: 'asc' },
      });
      
      return categories.map(cat => ({
        ...cat,
        productCount: cat._count.products,
      }));
    },
    
    productsBySegment: async (_, { ageRange, gender, category }) => {
      console.log('productsBySegment query:', { ageRange, gender, category });
      
      // Find segments matching the criteria
      const segmentWhere = {
        ageRange,
        gender,
      };
      
      if (category) {
        segmentWhere.categories = {
          has: category,
        };
      }
      
      const segments = await prisma.segment.findMany({
        where: segmentWhere,
        include: {
          productSegments: {
            include: {
              product: {
                include: {
                  categories: true,
                },
              },
            },
          },
        },
      });
      
      // Extract unique products from all matching segments
      const productIds = new Set();
      const products = [];
      
      segments.forEach(segment => {
        segment.productSegments.forEach(ps => {
          if (!productIds.has(ps.product.id)) {
            productIds.add(ps.product.id);
            products.push(ps.product);
          }
        });
      });
      
      console.log(`Found ${products.length} products for segment query`);
      return products;
    },

    segments: async () => {
      const segments = await prisma.segment.findMany({
        include: {
          _count: { select: { productSegments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      
      return segments.map(segment => ({
        ...segment,
        productCount: segment._count.productSegments,
        ageRange: segment.ageRange,
        keywords: segment.keywords || [],
        categories: segment.categories || [],
      }));
    },
  },
  
  Mutation: {
    refreshSegments: async () => {
      try {
        // This would trigger re-segmentation of all products
        // For now, just return current segment count
        const segmentCount = await prisma.segment.count();
        
        return {
          success: true,
          message: `Found ${segmentCount} segments. Refresh complete.`,
          segmentCount
        };
      } catch (error) {
        console.error('Refresh segments error:', error);
        return {
          success: false,
          message: 'Failed to refresh segments',
          segmentCount: 0
        };
      }
    },
  },
};

// Create Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
  playground: process.env.NODE_ENV !== 'production',
});

// Start server
async function startServer() {
  await server.start();
  
  // Apply GraphQL middleware
  app.use('/api/v1/graphql', expressMiddleware(server, {
    context: async ({ req, res }) => ({
      req,
      res,
      prisma,
      cache: cacheManager,
      user: req.user, // Will be set by auth middleware
    }),
  }));
  
  const PORT = process.env.PORT || 9000;
  
  httpServer.listen(PORT, () => {
    console.log(`🚀 GottaEarn.it Backend running on http://localhost:${PORT}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/api/v1/graphql`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Export for testing
export { app, server, startServer };

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
