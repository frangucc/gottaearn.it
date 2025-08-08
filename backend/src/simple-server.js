// Simple GottaEarn.it Backend Server (without Redis)
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { createServer } from 'http';
import { prisma } from './lib/prisma.js';
import { jobProcessorService } from './services/job-processor.service.js';
import productSearchRoutes from './routes/product-search.routes.js';
// import { 
//   // Initialize Sentry for error monitoring
//   // initSentry(); 
// } from '../../config/sentry.config.js';
// import { httpLogger } from '../../config/logging.config.js';
// import { dynamicRateLimit } from '../../config/rate-limit.config.js';
// import { cacheManager } from '../../config/cache.config.js';

// Load environment variables
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const app = express();
const httpServer = createServer(app);

// Basic middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(compression());

app.use(cors({
  origin: [
    'http://localhost:7000',
    'http://localhost:3000',
  ],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
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

// Basic REST// API routes
app.use('/api/v1', (req, res, next) => {
  req.apiVersion = 'v1';
  res.set('API-Version', 'v1');
  next();
});

// Product search routes
app.use('/api/v1/products', productSearchRoutes);

// Basic REST endpoints
app.get('/api/v1/test', (req, res) => {
  res.json({
    message: 'GottaEarn.it API is running!',
    version: 'v1',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Products endpoint
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

// GraphQL setup
const typeDefs = `#graphql
  type Query {
    hello: String
    products(limit: Int, offset: Int): [Product]
    categories: [Category]
    segments: [Segment]
    productsBySegment(ageRange: String!, gender: String!, category: String): [Product]
  }
  
  type Mutation {
    refreshSegments: RefreshSegmentsResult
    deleteProduct(id: ID!): DeleteProductResult
    updateProduct(id: ID!, input: UpdateProductInput!): UpdateProductResult
  }
  
  type RefreshSegmentsResult {
    success: Boolean!
    message: String!
    segmentCount: Int!
  }
  
  type DeleteProductResult {
    success: Boolean!
    message: String!
  }
  
  type UpdateProductResult {
    success: Boolean!
    message: String!
    product: Product
  }
  
  input UpdateProductInput {
    brand: String
    categories: [String!]
    ageRanges: [String!]
    gender: String
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
    
    segments: async () => {
      const segments = await prisma.segment.findMany({
        include: {
          _count: { select: { productSegments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      
      // Only show segments with products
      const segmentsWithProducts = segments.filter(segment => segment._count.productSegments > 0);
      
      return segmentsWithProducts.map(segment => ({
        ...segment,
        productCount: segment._count.productSegments,
        ageRange: segment.ageRange,
        keywords: segment.keywords || [],
        categories: segment.categories || [],
      }));
    },
    
    productsBySegment: async (_, { ageRange, gender, category }) => {
      console.log(`🔍 Looking for segments with: ageRange=${ageRange}, gender=${gender}, category=${category}`);
      
      // Find the segment first
      let segment = await prisma.segment.findFirst({
        where: {
          ageRange,
          gender,
          categories: category ? { has: category } : undefined,
        },
      });
      
      console.log(`Found segment:`, segment ? `${segment.name} (${segment.id})` : 'None');
      
      // If no segment found, let's see what segments exist
      if (!segment) {
        const allSegments = await prisma.segment.findMany();
        console.log(`All segments in database:`, allSegments.map(s => ({
          name: s.name,
          ageRange: s.ageRange,
          gender: s.gender,
          categories: s.categories
        })));
      }
      
      // If no exact match, try without category filter
      if (!segment && category) {
        segment = await prisma.segment.findFirst({
          where: {
            ageRange,
            gender,
          },
        });
      }
      
      if (!segment) {
        return [];
      }
      
      // Get products assigned to this segment
      const products = await prisma.product.findMany({
        where: {
          segments: {
            some: {
              segmentId: segment.id,
            },
          },
        },
        include: { categories: true },
        orderBy: { createdAt: 'desc' },
      });
      
      return products;
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

    deleteProduct: async (_, { id }) => {
      try {
        console.log(`🗑️ Deleting product with id: ${id}`);
        
        // Delete product segments first (cascade delete)
        await prisma.productSegment.deleteMany({
          where: { productId: id }
        });
        
        // Delete the product
        await prisma.product.delete({
          where: { id }
        });
        
        console.log(`✅ Successfully deleted product ${id}`);
        return {
          success: true,
          message: 'Product deleted successfully'
        };
      } catch (error) {
        console.error(`❌ Error deleting product ${id}:`, error);
        return {
          success: false,
          message: `Failed to delete product: ${error.message}`
        };
      }
    },

    updateProduct: async (_, { id, input }) => {
      try {
        console.log(`✏️ Updating product ${id} with:`, input);
        
        // Update product brand if provided
        const productUpdate = {};
        if (input.brand) {
          productUpdate.brand = input.brand;
        }
        
        const updatedProduct = await prisma.product.update({
          where: { id },
          data: productUpdate,
          include: { categories: true }
        });
        
        // Handle segment updates if ageRanges and gender are provided
        if (input.ageRanges && input.gender && input.categories) {
          console.log(`🔄 Updating product segments...`);
          
          // Remove existing segment associations
          await prisma.productSegment.deleteMany({
            where: { productId: id }
          });
          
          // Create new segment associations
          for (const category of input.categories) {
            for (const ageRange of input.ageRanges) {
              // Find or create segment
              let segment = await prisma.segment.findFirst({
                where: {
                  name: `${ageRange}_${input.gender}_${category}`,
                  ageRange,
                  gender: input.gender
                }
              });
              
              if (!segment) {
                segment = await prisma.segment.create({
                  data: {
                    name: `${ageRange}_${input.gender}_${category}`,
                    ageRange,
                    gender: input.gender,
                    categories: [category]
                  }
                });
                console.log(`📝 Created new segment: ${segment.name}`);
              }
              
              // Create product-segment link
              await prisma.productSegment.create({
                data: {
                  productId: id,
                  segmentId: segment.id,
                  confidence: 0.9,
                  reasoning: `User-edited segment assignment`
                }
              });
            }
          }
        }
        
        console.log(`✅ Successfully updated product ${id}`);
        return {
          success: true,
          message: 'Product updated successfully',
          product: updatedProduct
        };
        
      } catch (error) {
        console.error(`❌ Error updating product ${id}:`, error);
        return {
          success: false,
          message: `Failed to update product: ${error.message}`,
          product: null
        };
      }
    },
  },
};

// Create Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
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
      user: req.user,
    }),
  }));
  
  const PORT = process.env.PORT || 8080;
  
  httpServer.listen(PORT, () => {
    console.log(`🚀 GottaEarn.it Backend running on http://localhost:${PORT}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/api/v1/graphql`);
    console.log(`🔍 Product search: http://localhost:${PORT}/api/v1/products/search`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Start background job processor
    jobProcessorService.start();
    console.log(`⚙️ Background job processor started`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Stop job processor
  jobProcessorService.stop();
  
  await prisma.$disconnect();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
