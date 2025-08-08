// Product Search API Routes
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { rainforestService } from '../services/rainforest.service.js';
import { jobProcessorService } from '../services/job-processor.service.js';
import { aiSegmentationService } from '../services/ai-segmentation.service.js';

const router = express.Router();

/**
 * Search Amazon products via Rainforest API
 * POST /api/v1/products/search
 */
router.post('/search', async (req, res) => {
  try {
    const { 
      searchTerm, 
      page = 1, 
      maxResults = 20,
      sortBy = 'relevance',
      minPrice,
      maxPrice,
      category 
    } = req.body;

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({
        error: 'Search term is required',
        code: 'MISSING_SEARCH_TERM'
      });
    }

    console.log(`🔍 Product search request: "${searchTerm}"`);

    // Search using Rainforest API
    const searchResults = await rainforestService.searchProducts(searchTerm, {
      page,
      maxResults,
      sortBy,
      minPrice,
      maxPrice,
      category
    });

    // Log search analytics
    await prisma.searchAnalytics.create({
      data: {
        searchTerm,
        resultCount: searchResults.products.length,
        clickedResults: [], // Will be updated when products are selected
        // userId: req.user?.id, // Add when auth is implemented
      }
    });

    res.json({
      success: true,
      data: searchResults,
      meta: {
        timestamp: new Date().toISOString(),
        searchTerm,
        resultCount: searchResults.products.length
      }
    });

  } catch (error) {
    console.error('Product search error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'SEARCH_FAILED',
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * Add selected products to database
 * POST /api/v1/products/add-selected
 */
router.post('/add-selected', async (req, res) => {
  try {
    const { products, searchTerm } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        error: 'Products array is required',
        code: 'MISSING_PRODUCTS'
      });
    }

    console.log(`📦 Adding ${products.length} selected products to database`);

    const results = {
      success: [],
      failed: [],
      jobs: []
    };

    // Process each selected product
    for (const productData of products) {
      try {
        // Check if product already exists
        const existingProduct = await prisma.product.findUnique({
          where: { asin: productData.asin }
        });

        if (existingProduct) {
          console.log(`⚠️ Product ${productData.asin} already exists, skipping`);
          results.failed.push({
            asin: productData.asin,
            error: 'Product already exists',
            code: 'DUPLICATE_PRODUCT'
          });
          continue;
        }

        // Create new product
        const newProduct = await prisma.product.create({
          data: {
            asin: productData.asin,
            title: productData.title,
            price: productData.price,
            image: productData.image,
            rating: productData.rating,
            ratingsTotal: productData.ratingsTotal,
            brand: productData.brand,
            availability: productData.availability,
            description: productData.metadata?.features?.join('. ') || null
          }
        });

        results.success.push({
          id: newProduct.id,
          asin: newProduct.asin,
          title: newProduct.title
        });

        // Create background processing jobs
        const jobs = await jobProcessorService.createProductJobs(newProduct.id);
        results.jobs.push(...jobs.map(job => ({
          id: job.id,
          type: job.jobType,
          productId: newProduct.id,
          status: job.status
        })));

        console.log(`✅ Added product: ${newProduct.title} (${newProduct.asin})`);

      } catch (error) {
        console.error(`❌ Failed to add product ${productData.asin}:`, error.message);
        results.failed.push({
          asin: productData.asin,
          error: error.message,
          code: 'CREATION_FAILED'
        });
      }
    }

    // Update search analytics with selected products
    if (searchTerm) {
      try {
        const successfulAsins = results.success.map(p => p.asin);
        await prisma.searchAnalytics.updateMany({
          where: {
            searchTerm,
            createdAt: {
              gte: new Date(Date.now() - 60000) // Within last minute
            }
          },
          data: {
            clickedResults: successfulAsins
          }
        });
      } catch (error) {
        console.error('Failed to update search analytics:', error.message);
      }
    }

    res.json({
      success: true,
      data: {
        added: results.success.length,
        failed: results.failed.length,
        totalJobs: results.jobs.length,
        results
      },
      meta: {
        timestamp: new Date().toISOString(),
        searchTerm
      }
    });

  } catch (error) {
    console.error('Add products error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'ADD_PRODUCTS_FAILED',
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/v1/products/preview-segmentation
 * Get AI segmentation preview for products without saving them
 */
router.post('/preview-segmentation', async (req, res) => {
  try {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        error: 'Products array is required',
        code: 'MISSING_PRODUCTS'
      });
    }

    console.log(`🔮 Getting AI segmentation preview for ${products.length} products`);

    const segmentationResults = [];

    // Process each product for AI segmentation preview
    for (const productData of products) {
      try {
        // Call AI segmentation service for preview (no DB save)
        const segmentationResult = await aiSegmentationService.previewSegmentation({
          asin: productData.asin,
          title: productData.title,
          price: productData.price,
          brand: productData.brand,
          image: productData.image,
          availability: productData.availability
        });

        segmentationResults.push({
          asin: productData.asin,
          segmentation: segmentationResult,
          success: true
        });

        console.log(`✅ AI segmentation completed for ${productData.asin}`);

      } catch (error) {
        console.error(`❌ AI segmentation failed for ${productData.asin}:`, error.message);
        
        segmentationResults.push({
          asin: productData.asin,
          segmentation: null,
          error: error.message,
          success: false
        });
      }
    }

    const successCount = segmentationResults.filter(r => r.success).length;
    const failedCount = segmentationResults.filter(r => !r.success).length;

    res.json({
      success: true,
      data: segmentationResults,
      meta: {
        timestamp: new Date().toISOString(),
        totalProducts: products.length,
        successCount,
        failedCount
      }
    });

  } catch (error) {
    console.error('🚫 Preview segmentation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze products with AI', 
      details: error.message 
    });
  }
});

/**
 * Get product details by ASIN
 * GET /api/v1/products/details/:asin
 */
router.get('/details/:asin', async (req, res) => {
  try {
    const { asin } = req.params;

    if (!asin) {
      return res.status(400).json({
        error: 'ASIN is required',
        code: 'MISSING_ASIN'
      });
    }

    // Check if product exists in database first
    const existingProduct = await prisma.product.findUnique({
      where: { asin },
      include: {
        categories: true,
        segments: {
          include: {
            segment: true
          }
        }
      }
    });

    if (existingProduct) {
      return res.json({
        success: true,
        data: {
          ...existingProduct,
          source: 'database'
        },
        meta: {
          timestamp: new Date().toISOString(),
          cached: true
        }
      });
    }

    // Fetch from Rainforest API
    const productDetails = await rainforestService.getProductDetails(asin);

    res.json({
      success: true,
      data: {
        ...productDetails,
        source: 'rainforest_api'
      },
      meta: {
        timestamp: new Date().toISOString(),
        cached: false
      }
    });

  } catch (error) {
    console.error('Product details error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'DETAILS_FAILED',
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * Get processing job status for products
 * GET /api/v1/products/job-status
 */
router.get('/job-status', async (req, res) => {
  try {
    const { productIds } = req.query;
    
    let whereClause = {};
    if (productIds) {
      const ids = Array.isArray(productIds) ? productIds : productIds.split(',');
      whereClause.productId = { in: ids };
    }

    const jobs = await prisma.productProcessingJob.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            asin: true,
            title: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit results
    });

    // Group jobs by product
    const jobsByProduct = jobs.reduce((acc, job) => {
      const productId = job.productId;
      if (!acc[productId]) {
        acc[productId] = {
          product: job.product,
          jobs: []
        };
      }
      acc[productId].jobs.push({
        id: job.id,
        type: job.jobType,
        status: job.status,
        attempts: job.attempts,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      });
      return acc;
    }, {});

    res.json({
      success: true,
      data: jobsByProduct,
      meta: {
        timestamp: new Date().toISOString(),
        totalJobs: jobs.length
      }
    });

  } catch (error) {
    console.error('Job status error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'JOB_STATUS_FAILED',
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * Get job processing statistics
 * GET /api/v1/products/job-stats
 */
router.get('/job-stats', async (req, res) => {
  try {
    const stats = await jobProcessorService.getJobStats();
    
    res.json({
      success: true,
      data: stats,
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Job stats error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'JOB_STATS_FAILED',
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * Retry failed jobs
 * POST /api/v1/products/retry-jobs
 */
router.post('/retry-jobs', async (req, res) => {
  try {
    const { jobIds, productIds } = req.body;
    
    let whereClause = { status: 'FAILED' };
    
    if (jobIds && Array.isArray(jobIds)) {
      whereClause.id = { in: jobIds };
    } else if (productIds && Array.isArray(productIds)) {
      whereClause.productId = { in: productIds };
    }

    // Reset failed jobs to pending
    const result = await prisma.productProcessingJob.updateMany({
      where: whereClause,
      data: {
        status: 'PENDING',
        error: null,
        attempts: 0,
        scheduledFor: null
      }
    });

    res.json({
      success: true,
      data: {
        retriedJobs: result.count
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Retry jobs error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'RETRY_JOBS_FAILED',
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Add selected products with pre-analyzed segmentation
router.post('/add-selected-with-segmentation', async (req, res) => {
  try {
    const { products, searchTerm } = req.body;

    console.log('🔍 Raw request body:', JSON.stringify({ 
      productsCount: products?.length, 
      searchTerm,
      firstProduct: products?.[0] ? {
        asin: products[0].asin,
        title: products[0].title,
        hasSegmentation: !!products[0].aiSegmentation
      } : null
    }, null, 2));

    if (!products || !Array.isArray(products) || products.length === 0) {
      console.log('❌ Request validation failed - no products array');
      return res.status(400).json({ 
        success: false, 
        error: 'Products array is required and cannot be empty' 
      });
    }

    console.log(`📋 Adding ${products.length} products with pre-analyzed segmentation...`);

    let addedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const product of products) {
      try {
        console.log(`🔄 Processing product: ${product.title} (${product.asin})`);
        console.log(`📊 Product segmentation data:`, {
          hasAiSegmentation: !!product.aiSegmentation,
          ageRanges: product.aiSegmentation?.ageRanges,
          suggestedCategories: product.aiSegmentation?.suggestedCategories,
          suggestedBrand: product.aiSegmentation?.suggestedBrand,
          gender: product.aiSegmentation?.gender
        });

        // Check if product already exists
        const existing = await prisma.product.findUnique({
          where: { asin: product.asin }
        });

        if (existing) {
          console.log(`⏭️  Skipping existing product: ${product.title}`);
          continue;
        }

        console.log(`➕ Creating new product: ${product.title}`);
        
        // Create the product record
        const createdProduct = await prisma.product.create({
          data: {
            asin: product.asin,
            title: product.title,
            description: product.description,
            price: product.price ? parseFloat(product.price) : null,
            image: product.image,
            rating: product.rating ? parseFloat(product.rating) : null,
            ratingsTotal: product.ratingsTotal ? parseInt(product.ratingsTotal) : null,
            brand: product.brand,
            availability: product.availability,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });

        console.log(`✅ Product created with ID: ${createdProduct.id}`);

        console.log(`✅ Created product: ${createdProduct.title}`);

        // If we have segmentation data, create segments and link them
        if (product.aiSegmentation) {
          const segmentation = product.aiSegmentation;
          console.log(`🔧 Processing segmentation for ${createdProduct.title}:`, {
            hasAgeRanges: !!segmentation.ageRanges,
            hasGender: !!segmentation.gender,
            hasCategories: !!segmentation.suggestedCategories,
            hasSegments: !!segmentation.segments
          });
          
          // Handle new preview structure with multiple age ranges
          if (segmentation.ageRanges && segmentation.ageRanges.length > 0) {
            // Process each age range as a separate segment
            for (const ageRange of segmentation.ageRanges) {
              const segmentName = `${ageRange}_${segmentation.gender || 'UNISEX'}`;
              
              console.log(`🔍 Creating segment with:`, {
                name: segmentName,
                ageRange: ageRange,
                gender: segmentation.gender || 'UNISEX',
                categories: segmentation.suggestedCategories || []
              });
              
              // Use findFirst + create approach since constraint name is causing issues
              let segment = await prisma.segment.findFirst({
                where: {
                  name: segmentName,
                  ageRange: ageRange,
                  gender: segmentation.gender || 'UNISEX'
                }
              });
              
              if (!segment) {
                segment = await prisma.segment.create({
                  data: {
                    name: segmentName,
                    ageRange: ageRange,
                    gender: segmentation.gender || 'UNISEX',
                    categories: segmentation.suggestedCategories || []
                  }
                });
                console.log(`✅ Created new segment: ${segment.name} (ID: ${segment.id})`);
              } else {
                // Update existing segment with new categories
                segment = await prisma.segment.update({
                  where: { id: segment.id },
                  data: {
                    categories: segmentation.suggestedCategories || []
                  }
                });
                console.log(`🔄 Updated existing segment: ${segment.name} (ID: ${segment.id})`);
              }
              
              // Link product to segment
              await prisma.productSegment.create({
                data: {
                  productId: createdProduct.id,
                  segmentId: segment.id,
                  confidence: segmentation.confidence || 0.8,
                  reasoning: `AI-assigned to ${ageRange} ${segmentation.gender || 'UNISEX'} segment`
                }
              });
              
              console.log(`🔗 Linked ${createdProduct.title} to segment ${segment.name}`);
            }
          } else {
            // Fallback to old structure for backward compatibility
            const primarySegment = segmentation.primarySegment;
            if (primarySegment) {
              const segmentName = `${primarySegment.ageRange}_${primarySegment.gender}`;
              
              let segment = await prisma.segment.findFirst({
                where: {
                  name: segmentName,
                  ageRange: primarySegment.ageRange,
                  gender: primarySegment.gender
                }
              });
              
              if (!segment) {
                segment = await prisma.segment.create({
                  data: {
                    name: segmentName,
                    ageRange: primarySegment.ageRange,
                    gender: primarySegment.gender,
                    categories: segmentation.suggestedCategories || []
                  }
                });
                console.log(`✅ Created fallback segment: ${segment.name} (ID: ${segment.id})`);
              } else {
                segment = await prisma.segment.update({
                  where: { id: segment.id },
                  data: {
                    categories: segmentation.suggestedCategories || []
                  }
                });
                console.log(`🔄 Updated fallback segment: ${segment.name} (ID: ${segment.id})`);
              }
              
              // Link product to primary segment  
              await prisma.productSegment.create({
                data: {
                  productId: createdProduct.id,
                  segmentId: segment.id,
                  confidence: primarySegment.confidence || 0.8,
                  reasoning: `Fallback assignment to ${primarySegment.ageRange} ${primarySegment.gender} segment`
                }
              });
              
              console.log(`🔗 Linked ${createdProduct.title} to segment ${segment.name}`);
            }
          }
        }

        addedCount++;
        console.log(`🎉 Successfully processed product: ${createdProduct.title} (ID: ${createdProduct.id})`);
      } catch (productError) {
        console.error(`❌ Failed to add product ${product.title}:`, productError);
        console.error(`❌ Full error stack:`, productError.stack);
        console.error(`❌ Error occurred at stage:`, {
          productTitle: product.title,
          hasAiSegmentation: !!product.aiSegmentation,
          errorMessage: productError.message,
          errorName: productError.name
        });
        failedCount++;
        errors.push({
          asin: product.asin,
          title: product.title,
          error: productError.message,
          errorType: productError.name
        });
      }
    }

    console.log(`✅ Completed adding products: ${addedCount} added, ${failedCount} failed`);
    
    res.json({
      success: true,
      data: {
        added: addedCount,
        failed: failedCount,
        errors: errors
      }
    });

  } catch (error) {
    console.error('🚫 Add products with segmentation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add products with segmentation', 
      details: error.message 
    });
  }
});

export default router;
