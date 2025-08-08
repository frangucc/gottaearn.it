// Background Job Processing Service
import { prisma } from '../lib/prisma.js';
import { rainforestService } from './rainforest.service.js';
import { aiSegmentationService } from './ai-segmentation.service.js';

class JobProcessorService {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
    this.batchSize = 5; // Process 5 jobs at a time
    this.intervalMs = 10000; // Check for jobs every 10 seconds
  }

  /**
   * Start the job processor
   */
  start() {
    if (this.processingInterval) {
      console.log('⚠️ Job processor already running');
      return;
    }

    console.log('🚀 Starting background job processor');
    this.processingInterval = setInterval(() => {
      this.processJobs();
    }, this.intervalMs);

    // Process immediately on start
    this.processJobs();
  }

  /**
   * Stop the job processor
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('⏹️ Job processor stopped');
    }
  }

  /**
   * Process pending jobs
   */
  async processJobs() {
    if (this.isProcessing) {
      return; // Already processing
    }

    try {
      this.isProcessing = true;
      
      // Get pending jobs
      const jobs = await prisma.productProcessingJob.findMany({
        where: {
          status: 'PENDING',
          attempts: {
            lt: prisma.productProcessingJob.fields.maxAttempts
          },
          OR: [
            { scheduledFor: null },
            { scheduledFor: { lte: new Date() } }
          ]
        },
        include: {
          product: true
        },
        take: this.batchSize,
        orderBy: {
          createdAt: 'asc'
        }
      });

      if (jobs.length === 0) {
        return; // No jobs to process
      }

      console.log(`📋 Processing ${jobs.length} background jobs`);

      // Process jobs in parallel
      const promises = jobs.map(job => this.processJob(job));
      await Promise.allSettled(promises);

    } catch (error) {
      console.error('Job processor error:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   * @param {Object} job - Job to process
   */
  async processJob(job) {
    try {
      console.log(`🔄 Processing ${job.jobType} job for product ${job.product.asin}`);
      
      // Mark job as processing
      await prisma.productProcessingJob.update({
        where: { id: job.id },
        data: {
          status: 'PROCESSING',
          startedAt: new Date(),
          attempts: job.attempts + 1
        }
      });

      let result;
      switch (job.jobType) {
        case 'ENRICH':
          result = await this.processEnrichJob(job);
          break;
        case 'SEGMENT':
          result = await this.processSegmentJob(job);
          break;
        case 'CATEGORIZE':
          result = await this.processCategorizeJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.jobType}`);
      }

      // Mark job as completed
      await prisma.productProcessingJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          output: result,
          completedAt: new Date()
        }
      });

      console.log(`✅ Completed ${job.jobType} job for product ${job.product.asin}`);

    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error.message);
      
      // Mark job as failed or retry
      const shouldRetry = job.attempts < job.maxAttempts;
      await prisma.productProcessingJob.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? 'PENDING' : 'FAILED',
          error: error.message,
          scheduledFor: shouldRetry ? new Date(Date.now() + 60000 * job.attempts) : null // Exponential backoff
        }
      });
    }
  }

  /**
   * Process product enrichment job
   * @param {Object} job - Enrichment job
   * @returns {Promise<Object>} Job result
   */
  async processEnrichJob(job) {
    const { product } = job;
    
    // Get detailed product information from Rainforest API
    const enrichedData = await rainforestService.getProductDetails(product.asin);
    
    // Update product with enriched data
    const updatedProduct = await prisma.product.update({
      where: { id: product.id },
      data: {
        description: enrichedData.description || product.description,
        brand: enrichedData.brand || product.brand,
        availability: enrichedData.availability || product.availability,
        // Store additional metadata
        updatedAt: new Date()
      }
    });

    // Create segmentation job if not already exists
    const existingSegmentJob = await prisma.productProcessingJob.findFirst({
      where: {
        productId: product.id,
        jobType: 'SEGMENT',
        status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] }
      }
    });

    if (!existingSegmentJob) {
      await this.createJob(product.id, 'SEGMENT', { enrichedData });
    }

    return {
      success: true,
      enrichedFields: ['description', 'brand', 'availability'],
      nextJob: 'SEGMENT'
    };
  }

  /**
   * Process product segmentation job
   * @param {Object} job - Segmentation job
   * @returns {Promise<Object>} Job result
   */
  async processSegmentJob(job) {
    const { product } = job;
    
    // Get enriched product data for AI analysis
    const productData = {
      asin: product.asin,
      title: product.title,
      description: product.description,
      price: product.price,
      priceString: `$${product.price}`,
      brand: product.brand,
      category: null, // Will be populated from categories relation
      features: [],
      enrichedData: job.input?.enrichedData || {}
    };

    // Get product categories
    const productWithCategories = await prisma.product.findUnique({
      where: { id: product.id },
      include: { categories: true }
    });

    if (productWithCategories?.categories?.length > 0) {
      productData.category = productWithCategories.categories[0].name;
    }

    // Use AI to segment the product
    const segmentationResult = await aiSegmentationService.segmentProduct(productData);
    
    if (segmentationResult.success) {
      // Assign segments to product
      await aiSegmentationService.assignSegmentsToProduct(
        product.id, 
        segmentationResult.segments
      );
    }

    return {
      success: segmentationResult.success,
      segmentsAssigned: segmentationResult.segments?.length || 0,
      confidence: segmentationResult.confidence,
      reasoning: segmentationResult.reasoning,
      error: segmentationResult.error
    };
  }

  /**
   * Process product categorization job
   * @param {Object} job - Categorization job
   * @returns {Promise<Object>} Job result
   */
  async processCategorizeJob(job) {
    const { product } = job;
    
    // Extract category information from product data
    const categoryHints = this.extractCategoryHints(product);
    
    // Find or create categories
    const categories = [];
    for (const hint of categoryHints) {
      const category = await this.findOrCreateCategory(hint);
      if (category) {
        categories.push(category);
      }
    }

    // Associate product with categories
    if (categories.length > 0) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          categories: {
            connect: categories.map(cat => ({ id: cat.id }))
          }
        }
      });
    }

    return {
      success: true,
      categoriesAssigned: categories.length,
      categories: categories.map(cat => cat.name)
    };
  }

  /**
   * Extract category hints from product data
   * @param {Object} product - Product data
   * @returns {Array} Category hints
   */
  extractCategoryHints(product) {
    const hints = [];
    const text = `${product.title} ${product.description || ''}`.toLowerCase();
    
    // Gaming categories
    if (text.match(/gaming|game|xbox|playstation|nintendo|console/)) {
      hints.push({ name: 'Gaming', ageGroup: 'TEEN', gender: 'UNISEX' });
    }
    
    // Fashion categories
    if (text.match(/clothing|fashion|shirt|dress|shoes|sneakers/)) {
      hints.push({ name: 'Fashion', ageGroup: 'TEEN', gender: 'UNISEX' });
    }
    
    // Technology categories
    if (text.match(/laptop|computer|phone|tablet|tech|electronic/)) {
      hints.push({ name: 'Technology', ageGroup: 'TEEN', gender: 'UNISEX' });
    }
    
    // Sports categories
    if (text.match(/sport|fitness|gym|basketball|soccer|football/)) {
      hints.push({ name: 'Sports', ageGroup: 'TEEN', gender: 'UNISEX' });
    }
    
    // Default category if no matches
    if (hints.length === 0) {
      hints.push({ name: 'General', ageGroup: 'TEEN', gender: 'UNISEX' });
    }
    
    return hints;
  }

  /**
   * Find or create a category
   * @param {Object} categoryHint - Category hint object
   * @returns {Promise<Object>} Category object
   */
  async findOrCreateCategory(categoryHint) {
    try {
      const category = await prisma.category.upsert({
        where: {
          name_ageGroup_gender: {
            name: categoryHint.name,
            ageGroup: categoryHint.ageGroup,
            gender: categoryHint.gender
          }
        },
        update: {},
        create: categoryHint
      });
      
      return category;
    } catch (error) {
      console.error('Error creating category:', error.message);
      return null;
    }
  }

  /**
   * Create a new processing job
   * @param {string} productId - Product ID
   * @param {string} jobType - Job type
   * @param {Object} input - Job input data
   * @param {Date} scheduledFor - When to run the job
   * @returns {Promise<Object>} Created job
   */
  async createJob(productId, jobType, input = null, scheduledFor = null) {
    try {
      const job = await prisma.productProcessingJob.create({
        data: {
          productId,
          jobType,
          input,
          scheduledFor
        }
      });
      
      console.log(`📝 Created ${jobType} job for product ${productId}`);
      return job;
    } catch (error) {
      console.error('Error creating job:', error.message);
      throw error;
    }
  }

  /**
   * Create jobs for a new product
   * @param {string} productId - Product ID
   * @returns {Promise<Array>} Created jobs
   */
  async createProductJobs(productId) {
    const jobs = [];
    
    try {
      // Create enrichment job first
      const enrichJob = await this.createJob(productId, 'ENRICH');
      jobs.push(enrichJob);
      
      // Create categorization job
      const categorizeJob = await this.createJob(productId, 'CATEGORIZE');
      jobs.push(categorizeJob);
      
      // Segmentation job will be created after enrichment
      
      return jobs;
    } catch (error) {
      console.error('Error creating product jobs:', error.message);
      return jobs;
    }
  }

  /**
   * Get job statistics
   * @returns {Promise<Object>} Job statistics
   */
  async getJobStats() {
    try {
      const stats = await prisma.productProcessingJob.groupBy({
        by: ['status', 'jobType'],
        _count: true
      });
      
      const totalJobs = await prisma.productProcessingJob.count();
      const failedJobs = await prisma.productProcessingJob.count({
        where: { status: 'FAILED' }
      });
      
      return {
        total: totalJobs,
        failed: failedJobs,
        successRate: totalJobs > 0 ? ((totalJobs - failedJobs) / totalJobs * 100).toFixed(2) : 0,
        breakdown: stats.reduce((acc, stat) => {
          const key = `${stat.jobType}_${stat.status}`;
          acc[key] = stat._count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Error fetching job stats:', error.message);
      return { total: 0, failed: 0, successRate: 0, breakdown: {} };
    }
  }
}

export const jobProcessorService = new JobProcessorService();
export default jobProcessorService;
