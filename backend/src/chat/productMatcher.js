import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class ProductMatcher {
  constructor() {
    this.searchCache = new Map();
  }

  /**
   * Find relevant products based on conversation context and user segment
   */
  async findRelevantProducts(context, session, limit = 8) {
    const cacheKey = this.buildCacheKey(context, session);
    
    // Check cache first (5 minute TTL)
    if (this.searchCache.has(cacheKey)) {
      const cached = this.searchCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) {
        return cached.products;
      }
    }

    const products = await this.searchProducts(context, session, limit);
    
    // Cache results
    this.searchCache.set(cacheKey, {
      products,
      timestamp: Date.now()
    });

    return products;
  }

  /**
   * Core product search logic
   */
  async searchProducts(context, session, limit) {
    // For specific product searches, ONLY search by message - no fallbacks to unrelated products
    if (context.extractedProduct?.productDetected) {
      try {
        const products = await this.searchByMessage(context.currentMessage, session, limit);
        console.log(`🎯 Specific product search for "${context.extractedProduct.productName}": found ${products.length} products`);
        return products; // Return empty if no matches - let Rainforest API handle fallback
      } catch (error) {
        console.warn('🔍⚠️ Specific product search failed:', error.message);
        return [];
      }
    }

    // For general browsing, use multiple strategies
    const searchStrategies = [
      () => this.searchBySegment(context.userSegment, limit),
      () => this.searchByAge(session.userAge, session.userGender, limit),
      () => this.searchByPopularity(session.userGender, limit),
      () => this.getFallbackProducts(limit)
    ];

    // Try each strategy until we get enough products
    for (const strategy of searchStrategies) {
      try {
        const products = await strategy();
        if (products.length >= Math.min(3, limit)) {
          return products.slice(0, limit);
        }
      } catch (error) {
        console.warn('🔍⚠️ Product search strategy failed:', error.message);
      }
    }

    return [];
  }

  /**
   * Search products based on message keywords
   */
  async searchByMessage(message, session, limit) {
    const keywords = this.extractKeywords(message);
    if (keywords.length === 0) return [];

    // Check if this is a brand search
    const brandKeywords = keywords.filter(k => 
      ['xbox', 'playstation', 'nintendo', 'apple', 'samsung'].includes(k.toLowerCase())
    );
    
    let searchConditions;
    
    if (brandKeywords.length > 0) {
      // For brand searches, ONLY search by the EXACT brand name
      console.log(`🏷️ Brand search detected: ${brandKeywords.join(', ')}`);
      
      // For brand searches, ALL brand keywords must match (use AND)
      // This prevents Xbox results when searching for PlayStation
      searchConditions = [{
        OR: brandKeywords.map(brand => ({
          OR: [
            { title: { contains: brand, mode: 'insensitive' } },
            { brand: { contains: brand, mode: 'insensitive' } }
            // Removed description search to avoid false matches
          ]
        }))
      }];
    } else {
      // For generic searches, use all keywords
      searchConditions = keywords.map(keyword => ({
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
          { brand: { contains: keyword, mode: 'insensitive' } }
        ]
      }));
    }
    
    const products = await prisma.product.findMany({
      where: {
        AND: [
          { OR: searchConditions },  // Use OR for flexibility
          this.getAgeFilter(session.userAge),
          this.getGenderFilter(session.userGender),
          { price: { not: null } } // Only products with price
        ]
      },
      include: {
        segments: {
          include: { segment: true }
        },
        brandEntity: true
      },
      orderBy: [
        { rating: 'desc' },
        { ratingsTotal: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit
    });

    return this.enrichProductData(products, { strategy: 'keyword', keywords });
  }

  /**
   * Search products by user segment
   */
  async searchBySegment(userSegment, limit) {
    if (!userSegment) return [];

    const products = await prisma.product.findMany({
      where: {
        segments: {
          some: {
            segmentId: userSegment.id,
            confidence: { gte: 0.7 } // High confidence matches only
          }
        },
        price: { not: null }
      },
      include: {
        segments: {
          include: { segment: true }
        },
        brandEntity: true
      },
      orderBy: [
        { 
          segments: {
            _count: 'desc' // Products in multiple segments first
          }
        },
        { rating: 'desc' },
        { ratingsTotal: 'desc' }
      ],
      take: limit
    });

    return this.enrichProductData(products, { 
      strategy: 'segment', 
      segment: userSegment.name 
    });
  }

  /**
   * Search products by age and gender
   */
  async searchByAge(userAge, userGender, limit) {
    if (!userAge) return [];

    const ageRange = this.mapAgeToRange(userAge);
    if (!ageRange) return [];

    const products = await prisma.product.findMany({
      where: {
        segments: {
          some: {
            segment: {
              ageRange,
              gender: userGender === 'UNISEX' ? undefined : userGender
            }
          }
        },
        price: { not: null }
      },
      include: {
        segments: {
          include: { segment: true }
        },
        brandEntity: true
      },
      orderBy: [
        { rating: 'desc' },
        { ratingsTotal: 'desc' }
      ],
      take: limit
    });

    return this.enrichProductData(products, { 
      strategy: 'age_gender', 
      ageRange, 
      gender: userGender 
    });
  }

  /**
   * Search by popularity for gender/age group
   */
  async searchByPopularity(userGender, limit) {
    const products = await prisma.product.findMany({
      where: {
        AND: [
          { price: { not: null } },
          { rating: { gte: 4.0 } },
          { ratingsTotal: { gte: 100 } },
          this.getGenderFilter(userGender)
        ]
      },
      include: {
        segments: {
          include: { segment: true }
        },
        brandEntity: true
      },
      orderBy: [
        { ratingsTotal: 'desc' },
        { rating: 'desc' }
      ],
      take: limit
    });

    return this.enrichProductData(products, { strategy: 'popularity' });
  }

  /**
   * Fallback products when other strategies fail
   */
  async getFallbackProducts(limit) {
    const products = await prisma.product.findMany({
      where: {
        price: { not: null },
        rating: { gte: 3.5 }
      },
      include: {
        segments: {
          include: { segment: true }
        },
        brandEntity: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return this.enrichProductData(products, { strategy: 'fallback' });
  }

  /**
   * Extract keywords from user message
   */
  extractKeywords(message) {
    const stopWords = ['i', 'need', 'want', 'looking', 'for', 'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'can', 'could', 'would', 'should'];
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    // Check if this is a brand search - if so, DON'T expand keywords
    const competingBrands = ['xbox', 'playstation', 'nintendo', 'iphone', 'android', 'samsung', 'apple'];
    const hasBrand = words.some(word => competingBrands.includes(word));
    
    if (hasBrand) {
      console.log(`🏷️ Brand search detected - using exact keywords only: ${words.join(', ')}`);
      return words; // Return ONLY the exact words, no expansion
    }

    // For non-brand searches, add context-aware keyword expansion
    const expandedWords = [];
    words.forEach(word => {
      expandedWords.push(word);
      
      // Add related terms
      const relations = this.getWordRelations(word);
      expandedWords.push(...relations);
    });

    return [...new Set(expandedWords)]; // Remove duplicates
  }

  /**
   * Get related terms for better matching
   */
  getWordRelations(word) {
    // Don't expand competing brand names - they should search independently
    const competingBrands = ['xbox', 'playstation', 'nintendo', 'iphone', 'android', 'samsung', 'apple'];
    if (competingBrands.includes(word.toLowerCase())) {
      // For specific brands, only return generic category terms, not competitors
      const brandCategories = {
        'xbox': ['console', 'gaming', 'game'],
        'playstation': ['console', 'gaming', 'game'],
        'nintendo': ['console', 'gaming', 'game'],
        'iphone': ['phone', 'mobile', 'smartphone'],
        'android': ['phone', 'mobile', 'smartphone'],
        'samsung': ['electronics'],
        'apple': ['electronics']
      };
      return brandCategories[word.toLowerCase()] || [];
    }

    // Generic term relations (no brand names here)
    const relations = {
      'gaming': ['game', 'console', 'video game'],
      'console': ['gaming', 'game', 'video game'],
      'phone': ['mobile', 'smartphone', 'cell'],
      'laptop': ['computer', 'notebook', 'pc'],
      'music': ['headphones', 'speaker', 'audio', 'sound'],
      'fashion': ['clothes', 'clothing', 'style', 'outfit'],
      'beauty': ['makeup', 'skincare', 'cosmetic'],
      'sports': ['athletic', 'fitness', 'exercise', 'workout'],
      'art': ['drawing', 'painting', 'creative', 'craft']
    };

    for (const [key, values] of Object.entries(relations)) {
      if (values.includes(word) || key === word) {
        return values.filter(v => v !== word);
      }
    }

    return [];
  }

  /**
   * Map user age to age range enum
   */
  mapAgeToRange(age) {
    if (age >= 10 && age <= 12) return 'AGE_10_12';
    if (age >= 13 && age <= 15) return 'AGE_13_15';
    if (age >= 16 && age <= 18) return 'AGE_16_18';
    if (age >= 19 && age <= 21) return 'AGE_19_21';
    return null;
  }

  /**
   * Get age-appropriate filter
   */
  getAgeFilter(userAge) {
    if (!userAge) return {};

    const ageRange = this.mapAgeToRange(userAge);
    if (!ageRange) return {};

    return {
      segments: {
        some: {
          segment: { ageRange }
        }
      }
    };
  }

  /**
   * Get gender-appropriate filter
   */
  getGenderFilter(userGender) {
    if (!userGender || userGender === 'UNISEX') return {};

    return {
      segments: {
        some: {
          segment: {
            OR: [
              { gender: userGender },
              { gender: 'UNISEX' }
            ]
          }
        }
      }
    };
  }

  /**
   * Enrich product data with recommendation context
   */
  enrichProductData(products, context) {
    return products.map(product => ({
      ...product,
      // Add image URL (map from 'image' field to 'imageUrl' for frontend)
      imageUrl: product.image || null,
      // Add recommendation reasoning
      recommendationReason: this.generateRecommendationReason(product, context),
      // Add match score
      matchScore: this.calculateMatchScore(product, context),
      // Format price nicely
      formattedPrice: product.price ? `$${product.price.toFixed(2)}` : 'Price not available',
      // Get primary segment
      primarySegment: product.segments[0]?.segment || null,
      // Clean title
      cleanTitle: this.cleanProductTitle(product.title)
    }));
  }

  /**
   * Generate human-readable reason for recommendation
   */
  generateRecommendationReason(product, context) {
    const reasons = [];

    if (context.strategy === 'keyword') {
      reasons.push(`Matches your search for "${context.keywords.join(', ')}"`);
    }
    
    if (context.strategy === 'segment') {
      reasons.push(`Perfect for ${context.segment}`);
    }

    if (context.strategy === 'age_gender') {
      reasons.push(`Popular with ${context.gender.toLowerCase()} teens`);
    }

    if (product.rating >= 4.5) {
      reasons.push(`Highly rated (${product.rating}★)`);
    }

    if (product.ratingsTotal > 1000) {
      reasons.push(`Trusted by ${product.ratingsTotal}+ customers`);
    }

    return reasons[0] || 'Recommended for you';
  }

  /**
   * Calculate match score for ranking
   */
  calculateMatchScore(product, context) {
    let score = 0;

    // Base score from rating and reviews
    score += (product.rating || 0) * 10;
    score += Math.min((product.ratingsTotal || 0) / 100, 20);

    // Strategy bonuses
    switch (context.strategy) {
      case 'keyword':
        score += 50;
        break;
      case 'segment':
        score += 40;
        break;
      case 'age_gender':
        score += 30;
        break;
      case 'popularity':
        score += 20;
        break;
    }

    // Segment confidence bonus
    const highConfidenceSegment = product.segments.find(s => s.confidence >= 0.8);
    if (highConfidenceSegment) score += 15;

    return Math.round(score);
  }

  /**
   * Clean product title for better display
   */
  cleanProductTitle(title) {
    return title
      .replace(/^\s*\w+\s*-\s*/, '') // Remove "Amazon - " prefix
      .replace(/\s*\|\s*Amazon.*$/, '') // Remove "| Amazon..." suffix
      .slice(0, 80) // Limit length
      .trim();
  }

  /**
   * Build cache key for search results
   */
  buildCacheKey(context, session) {
    const keyParts = [
      context.currentMessage.toLowerCase().replace(/[^\w]/g, ''),
      session.userAge || 'noage',
      session.userGender || 'nogender',
      context.userSegment?.id || 'nosegment'
    ];

    return keyParts.join('_');
  }

  /**
   * Get product recommendations based on viewed/favorited products
   */
  async getRelatedProducts(productId, session, limit = 4) {
    const baseProduct = await prisma.product.findUnique({
      where: { id: productId },
      include: { segments: { include: { segment: true } } }
    });

    if (!baseProduct) return [];

    // Find products in same segments
    const relatedProducts = await prisma.product.findMany({
      where: {
        AND: [
          { id: { not: productId } }, // Exclude the base product
          {
            segments: {
              some: {
                segmentId: {
                  in: baseProduct.segments.map(s => s.segmentId)
                }
              }
            }
          },
          { price: { not: null } }
        ]
      },
      include: {
        segments: { include: { segment: true } },
        brandEntity: true
      },
      orderBy: { rating: 'desc' },
      take: limit
    });

    return this.enrichProductData(relatedProducts, { 
      strategy: 'related',
      baseProduct: baseProduct.title 
    });
  }

  /**
   * Clear search cache (for admin/debugging)
   */
  clearCache() {
    this.searchCache.clear();
  }
}

export const productMatcher = new ProductMatcher();
