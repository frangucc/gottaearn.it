// Rainforest API Service for Amazon Product Search
import axios from 'axios';
import { prisma } from '../lib/prisma.js';

class RainforestService {
  constructor() {
    this.apiKey = process.env.RAINFOREST_API_KEY;
    this.baseUrl = 'https://api.rainforestapi.com/request';
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour in milliseconds
  }

  /**
   * Search Amazon products using Rainforest API
   * @param {string} searchTerm - The search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchProducts(searchTerm, options = {}) {
    const {
      page = 1,
      maxResults = 20,
      sortBy = 'relevance',
      minPrice,
      maxPrice,
      category,
      useCache = true
    } = options;

    // Check cache first
    if (useCache) {
      const cached = await this.getCachedResults(searchTerm);
      if (cached) {
        console.log(`🎯 Cache hit for search: "${searchTerm}"`);
        return this.formatResults(cached.results, searchTerm);
      }
    }

    try {
      console.log(`🔍 Searching Rainforest API for: "${searchTerm}"`);
      
      const params = {
        api_key: this.apiKey,
        type: 'search',
        amazon_domain: 'amazon.com',
        search_term: searchTerm,
        page: page,
        max_page: Math.ceil(maxResults / 16), // Rainforest returns ~16 results per page
      };
      
      // Only add sort_by for supported values on amazon.com
      if (sortBy && ['price_low_to_high', 'price_high_to_low', 'featured', 'newest'].includes(sortBy)) {
        params.sort_by = sortBy;
      }

      // Add price filters if specified
      if (minPrice) params.min_price = minPrice;
      if (maxPrice) params.max_price = maxPrice;
      if (category) params.category_id = category;

      const response = await axios.get(this.baseUrl, { 
        params,
        timeout: 30000 // 30 second timeout
      });

      const results = response.data;
      
      // Cache the results
      if (useCache && results.search_results) {
        await this.cacheResults(searchTerm, results);
      }

      return this.formatResults(results, searchTerm);

    } catch (error) {
      console.error('Rainforest API Error:', error.message);
      
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.response?.status === 401) {
        throw new Error('Invalid Rainforest API key.');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout. Please try again.');
      } else {
        throw new Error(`Search failed: ${error.message}`);
      }
    }
  }

  /**
   * Get product details by ASIN
   * @param {string} asin - Amazon ASIN
   * @returns {Promise<Object>} Product details
   */
  async getProductDetails(asin) {
    try {
      console.log(`📦 Fetching product details for ASIN: ${asin}`);
      
      const params = {
        api_key: this.apiKey,
        type: 'product',
        amazon_domain: 'amazon.com',
        asin: asin,
      };

      const response = await axios.get(this.baseUrl, { 
        params,
        timeout: 30000
      });

      return this.formatProductDetails(response.data.product);

    } catch (error) {
      console.error(`Product details error for ${asin}:`, error.message);
      throw new Error(`Failed to fetch product details: ${error.message}`);
    }
  }

  /**
   * Format search results for consistent API response
   * @param {Object} rawResults - Raw Rainforest API results
   * @param {string} searchTerm - Original search term
   * @returns {Object} Formatted results
   */
  formatResults(rawResults, searchTerm) {
    if (!rawResults.search_results) {
      return {
        searchTerm,
        products: [],
        totalResults: 0,
        page: 1,
        hasNextPage: false,
        metadata: {
          searchTime: new Date().toISOString(),
          source: 'rainforest_api'
        }
      };
    }

    const products = rawResults.search_results.map(product => ({
      asin: product.asin,
      title: product.title,
      price: product.price?.value || null,
      priceString: product.price?.raw || null,
      currency: product.price?.currency || 'USD',
      image: product.image,
      rating: product.rating || null,
      ratingsTotal: product.ratings_total || null,
      link: product.link,
      isPrime: product.is_prime || false,
      isBestseller: product.is_bestseller || false,
      isAmazonChoice: product.is_amazon_choice || false,
      brand: product.brand || null,
      category: product.category?.name || null,
      availability: product.availability?.raw || null,
      // Additional metadata for AI processing
      metadata: {
        position: product.position,
        sponsored: product.sponsored || false,
        variations: product.variations || [],
        features: product.feature_bullets || [],
      }
    }));

    return {
      searchTerm,
      products,
      totalResults: rawResults.search_information?.total_results || products.length,
      page: rawResults.search_information?.page || 1,
      hasNextPage: rawResults.search_information?.page < rawResults.search_information?.total_pages,
      metadata: {
        searchTime: new Date().toISOString(),
        source: 'rainforest_api',
        processingTime: rawResults.request_info?.success ? 'success' : 'partial'
      }
    };
  }

  /**
   * Format individual product details
   * @param {Object} product - Raw product data
   * @returns {Object} Formatted product
   */
  formatProductDetails(product) {
    return {
      asin: product.asin,
      title: product.title,
      description: product.description,
      price: product.price?.value || null,
      priceString: product.price?.raw || null,
      currency: product.price?.currency || 'USD',
      images: product.images || [],
      rating: product.rating || null,
      ratingsTotal: product.ratings_total || null,
      brand: product.brand || null,
      category: product.category?.name || null,
      availability: product.availability?.raw || null,
      features: product.feature_bullets || [],
      specifications: product.specifications || [],
      variants: product.variants || [],
      // Enhanced data for AI processing
      enrichedData: {
        keywords: this.extractKeywords(product.title, product.description),
        ageIndicators: this.extractAgeIndicators(product.title, product.description, product.feature_bullets),
        genderIndicators: this.extractGenderIndicators(product.title, product.description),
        categoryHints: this.extractCategoryHints(product.category, product.feature_bullets)
      }
    };
  }

  /**
   * Extract keywords for AI processing
   * @param {string} title - Product title
   * @param {string} description - Product description
   * @returns {string[]} Keywords array
   */
  extractKeywords(title = '', description = '') {
    const text = `${title} ${description}`.toLowerCase();
    const keywords = [];
    
    // Gaming keywords
    if (text.match(/gaming|game|xbox|playstation|nintendo|pc|console|controller/)) {
      keywords.push('gaming');
    }
    
    // Fashion keywords
    if (text.match(/fashion|clothing|shirt|dress|shoes|sneakers|style/)) {
      keywords.push('fashion');
    }
    
    // Tech keywords
    if (text.match(/tech|electronic|laptop|phone|tablet|gadget|smart/)) {
      keywords.push('technology');
    }
    
    // Sports keywords
    if (text.match(/sport|fitness|gym|exercise|basketball|soccer|football/)) {
      keywords.push('sports');
    }
    
    return keywords;
  }

  /**
   * Extract age indicators from product data
   * @param {string} title - Product title
   * @param {string} description - Product description
   * @param {string[]} features - Feature bullets
   * @returns {string[]} Age indicators
   */
  extractAgeIndicators(title = '', description = '', features = []) {
    const text = `${title} ${description} ${features.join(' ')}`.toLowerCase();
    const indicators = [];
    
    if (text.match(/\b(10|11|12)\b|tween|pre-teen/)) indicators.push('10-12');
    if (text.match(/\b(13|14|15)\b|teen|teenager|young teen/)) indicators.push('13-15');
    if (text.match(/\b(16|17|18)\b|teen|teenager|high school/)) indicators.push('16-18');
    if (text.match(/\b(19|20|21)\b|young adult|college|university/)) indicators.push('19-21');
    
    return indicators;
  }

  /**
   * Extract gender indicators from product data
   * @param {string} title - Product title
   * @param {string} description - Product description
   * @returns {string[]} Gender indicators
   */
  extractGenderIndicators(title = '', description = '') {
    const text = `${title} ${description}`.toLowerCase();
    const indicators = [];
    
    if (text.match(/\b(boy|boys|men|male|him|his)\b/)) indicators.push('male');
    if (text.match(/\b(girl|girls|women|female|her|hers)\b/)) indicators.push('female');
    if (text.match(/unisex|both|everyone|all/)) indicators.push('unisex');
    
    return indicators.length > 0 ? indicators : ['unisex'];
  }

  /**
   * Extract category hints from product data
   * @param {Object} category - Category object
   * @param {string[]} features - Feature bullets
   * @returns {string[]} Category hints
   */
  extractCategoryHints(category, features = []) {
    const hints = [];
    
    if (category?.name) {
      hints.push(category.name.toLowerCase());
    }
    
    const featuresText = features.join(' ').toLowerCase();
    if (featuresText.match(/gaming|game/)) hints.push('gaming');
    if (featuresText.match(/fashion|clothing/)) hints.push('fashion');
    if (featuresText.match(/tech|electronic/)) hints.push('technology');
    if (featuresText.match(/sport|fitness/)) hints.push('sports');
    
    return hints;
  }

  /**
   * Cache search results
   * @param {string} searchTerm - Search term
   * @param {Object} results - Results to cache
   */
  async cacheResults(searchTerm, results) {
    try {
      const expiresAt = new Date(Date.now() + this.cacheExpiry);
      
      await prisma.rainforestSearchCache.upsert({
        where: { searchTerm },
        update: {
          results,
          expiresAt,
        },
        create: {
          searchTerm,
          results,
          expiresAt,
        },
      });
      
      console.log(`💾 Cached results for: "${searchTerm}"`);
    } catch (error) {
      console.error('Cache error:', error.message);
      // Don't throw - caching is optional
    }
  }

  /**
   * Get cached search results
   * @param {string} searchTerm - Search term
   * @returns {Promise<Object|null>} Cached results or null
   */
  async getCachedResults(searchTerm) {
    try {
      const cached = await prisma.rainforestSearchCache.findUnique({
        where: { searchTerm },
      });
      
      if (cached && cached.expiresAt > new Date()) {
        return cached;
      }
      
      // Clean up expired cache
      if (cached) {
        await prisma.rainforestSearchCache.delete({
          where: { searchTerm },
        });
      }
      
      return null;
    } catch (error) {
      console.error('Cache retrieval error:', error.message);
      return null;
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache() {
    try {
      const result = await prisma.rainforestSearchCache.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      
      console.log(`🧹 Cleared ${result.count} expired cache entries`);
      return result.count;
    } catch (error) {
      console.error('Cache cleanup error:', error.message);
      return 0;
    }
  }
}

export const rainforestService = new RainforestService();
export default rainforestService;
