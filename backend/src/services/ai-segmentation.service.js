// AI Segmentation Service using Anthropic Claude
import axios from 'axios';
import { Anthropic } from '@anthropic-ai/sdk';
import { prisma } from '../lib/prisma.js';

class AISegmentationService {
  constructor() {
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    this.anthropicUrl = 'https://api.anthropic.com/v1/messages';
    
    // Initialize Anthropic client for chat service
    this.client = new Anthropic({
      apiKey: this.anthropicApiKey
    });
    
    // Age range mapping
    this.ageRangeMap = {
      'AGE_10_12': { min: 10, max: 12, label: '10-12 years' },
      'AGE_13_15': { min: 13, max: 15, label: '13-15 years' },
      'AGE_16_18': { min: 16, max: 18, label: '16-18 years' },
      'AGE_19_21': { min: 19, max: 21, label: '19-21 years' },
    };
  }

  /**
   * Get AI segmentation preview without saving to database
   * @param {Object} product - Product data from Rainforest API
   * @returns {Promise<Object>} Raw AI parsing results
   */
  async previewSegmentation(product) {
    try {
      console.log(`🔮 AI preview for product: ${product.title}`);
      
      const prompt = this.buildSegmentationPrompt(product);
      const aiResponse = await this.callAnthropicAPI(prompt);
      const segmentationResult = this.parseSegmentationResponse(aiResponse);
      
      return {
        success: true,
        ...segmentationResult,
        metadata: {
          processedAt: new Date().toISOString(),
          aiModel: 'claude-3-sonnet',
          productAsin: product.asin
        }
      };
    } catch (error) {
      console.error('❌ AI preview failed:', error.message);
      return {
        success: false,
        error: error.message,
        confidence: 0,
        reasoning: 'AI analysis failed',
        ageRanges: [],
        gender: 'UNISEX',
        suggestedCategories: [],
        suggestedBrand: ''
      };
    }
  }

  /**
   * Analyze and segment a product using AI
   * @param {Object} product - Product data from Rainforest API
   * @returns {Promise<Object>} Segmentation results
   */
  async segmentProduct(product) {
    try {
      console.log(`🤖 AI segmenting product: ${product.title}`);
      
      const prompt = this.buildSegmentationPrompt(product);
      const aiResponse = await this.callAnthropicAPI(prompt);
      const segmentationResult = this.parseSegmentationResponse(aiResponse);
      
      // Find or create segments based on AI analysis
      const segments = await this.findOrCreateSegments(segmentationResult);
      
      return {
        success: true,
        segments,
        reasoning: segmentationResult.reasoning,
        confidence: segmentationResult.confidence,
        metadata: {
          processedAt: new Date().toISOString(),
          aiModel: 'claude-3-sonnet',
          productAsin: product.asin
        }
      };
      
    } catch (error) {
      console.error('AI Segmentation Error:', error.message);
      return {
        success: false,
        error: error.message,
        segments: [],
        reasoning: null,
        confidence: 0
      };
    }
  }

  /**
   * Build the segmentation prompt for Anthropic
   * @param {Object} product - Product data
   * @returns {string} Formatted prompt
   */
  buildSegmentationPrompt(product) {
    return `You are an expert product analyst specializing in age and gender-based market segmentation for products targeted at ages 10-21.

PRODUCT TO ANALYZE:
Title: ${product.title}
Price: ${product.priceString || 'Not specified'}
Brand: ${product.brand || 'Not specified'}
Category: ${product.category || 'Not specified'}
Description: ${product.description || 'Not available'}
Features: ${product.features ? product.features.join(', ') : 'Not available'}
Keywords: ${product.enrichedData?.keywords?.join(', ') || 'None detected'}

AGE SEGMENTS TO CONSIDER:
- Boys 10-12: Gaming consoles, LEGO, RC cars, trading cards, sports gear
- Boys 13-15: Gaming accessories, streaming gear, e-sports merch, entry-level laptops, streetwear
- Boys 16-18: Gaming PCs, gaming chairs, wireless earbuds, premium sneakers, tech gadgets, gym gear
- Boys 19-21: High-performance laptops, VR headsets, pro gaming peripherals, designer sneakers, fitness supplements

- Girls 10-12: Dolls, craft kits, stationery, entry-level tablets, handheld gaming, plush items, beginner makeup
- Girls 13-15: Teen fashion, K-beauty, makeup sets, pop-culture merch, mid-tier tablets, jewelry, earbuds
- Girls 16-18: Higher-end makeup, trendy fashion, laptops for creative work, fitness gear, cameras, subscription boxes
- Girls 19-21: Premium fashion, high-end beauty, ultrabooks/MacBooks, professional makeup tools, travel accessories

TASK:
Analyze this product and determine:
1. Which age/gender segments it would appeal to most
2. Brand classification (normalized brand name)
3. Category classification (what type of product this is)
4. Multiple age ranges if applicable

Consider:
1. Age appropriateness and appeal
2. Gender targeting (be conservative - only suggest cross-gender if clearly unisex or explicitly marketed to both)
3. Price point alignment with segment
4. Category fit with segment preferences
5. Brand positioning and recognition

IMPORTANT GUIDELINES:
- Beauty/cosmetics products (makeup, skincare, fragrance) are typically gender-specific. Sephora, Ulta, and similar beauty retailers primarily target FEMALE demographics unless the product explicitly mentions "men's" or "for him"
- Gaming products can be cross-gender but consider the specific product type
- Fashion items should match their intended gender unless clearly unisex
- Gift cards should match the primary demographic of the retailer (e.g., Sephora = FEMALE, GameStop = cross-gender)
- Only assign confidence >0.7 if you're very sure about the segment fit
- Avoid creating segments for demographics the product wasn't intended for

STRICT CONSTRAINTS:
- ageRanges MUST be array of: "AGE_10_12", "AGE_13_15", "AGE_16_18", "AGE_19_21" (can have multiple)
- gender MUST be exactly one of: "MALE", "FEMALE", "UNISEX"
- suggestedCategories MUST use array of: "toys", "gaming", "beauty", "fashion", "electronics", "sports", "books", "music", "art", "collectibles", "general"
- suggestedBrand MUST be normalized brand name (e.g., "Apple" not "Apple Inc.")
- confidence MUST be a number between 0.0 and 1.0
- All field names must match exactly (case-sensitive)

RESPONSE FORMAT (JSON):
{
  "ageRanges": ["AGE_13_15", "AGE_16_18"],
  "gender": "MALE",
  "confidence": 0.85,
  "reasoning": "Comprehensive analysis of why these segments were chosen",
  "suggestedCategories": ["electronics", "gaming"],
  "suggestedBrand": "Apple",
  "priceAppropriate": true,
  "ageIndicators": ["specific age-related features or marketing"],
  "genderIndicators": ["specific gender-related features or marketing"]
}

Provide only the JSON response, no additional text.`;
  }

  /**
   * Call Anthropic API for segmentation analysis
   * @param {string} prompt - The analysis prompt
   * @returns {Promise<string>} AI response
   */
  async callAnthropicAPI(prompt) {
    // Check API key first
    if (!this.anthropicApiKey) {
      console.error('❌ ANTHROPIC_API_KEY environment variable is not set');
      throw new Error('Anthropic API key is not configured. Please set ANTHROPIC_API_KEY environment variable.');
    }

    console.log('🔑 Calling Anthropic API with timeout 15s...');
    
    try {
      const response = await axios.post(
        this.anthropicUrl,
        {
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.anthropicApiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 15000 // Reduced timeout to 15 seconds
        }
      );

      console.log('✅ Anthropic API response received');
      return response.data.content[0].text;
    } catch (error) {
      console.error('❌ Anthropic API call failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        code: error.code,
        timeout: error.code === 'ECONNABORTED'
      });
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Anthropic API key - check your API key is correct');
      } else if (error.response?.status === 429) {
        throw new Error('Anthropic API rate limit exceeded - please try again later');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Anthropic API timeout - the service took too long to respond');
      } else {
        throw new Error(`Anthropic API error: ${error.message}`);
      }
    }
  }

  /**
   * Parse AI response into structured data
   * @param {string} aiResponse - Raw AI response
   * @returns {Object} Parsed segmentation data
   */
  parseSegmentationResponse(aiResponse) {
    try {
      console.log('\n🤖 RAW AI RESPONSE:', aiResponse);
      
      // Clean up the response (remove any markdown formatting)
      const cleanResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      console.log('\n🎨 CLEANED RESPONSE:', cleanResponse);
      
      const parsed = JSON.parse(cleanResponse);
      console.log('\n📊 PARSED RESPONSE:', JSON.stringify(parsed, null, 2));
      
      // Validate required fields
      if (!parsed.ageRanges || !Array.isArray(parsed.ageRanges)) {
        throw new Error('Invalid ageRanges format - must be array');
      }
      
      // Valid enum values
      const validAgeRanges = ['AGE_10_12', 'AGE_13_15', 'AGE_16_18', 'AGE_19_21'];
      const validGenders = ['MALE', 'FEMALE', 'UNISEX'];
      const validCategories = ['toys', 'gaming', 'beauty', 'fashion', 'electronics', 'sports', 'books', 'music', 'art', 'collectibles', 'general'];
      
      // Validate age ranges
      const cleanAgeRanges = parsed.ageRanges.filter(age => validAgeRanges.includes(age));
      if (cleanAgeRanges.length === 0) {
        console.warn('No valid age ranges found, defaulting to AGE_13_15');
        cleanAgeRanges.push('AGE_13_15');
      }
      
      // Validate gender
      let cleanGender = parsed.gender;
      if (!validGenders.includes(cleanGender)) {
        console.warn(`Invalid gender: ${cleanGender}, defaulting to UNISEX`);
        cleanGender = 'UNISEX';
      }
      
      // Validate category suggestions
      const cleanCategories = parsed.suggestedCategories ? 
        parsed.suggestedCategories.filter(cat => validCategories.includes(cat)) : [];
      
      // Clean brand suggestion
      const cleanBrand = parsed.suggestedBrand ? 
        parsed.suggestedBrand.trim() : null;
      
      // Create segments array from age ranges (for backward compatibility)
      const segments = cleanAgeRanges.map(ageRange => ({
        ageRange,
        gender: cleanGender,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
        reasoning: parsed.reasoning || 'No reasoning provided'
      }));
      
      return {
        segments: segments,
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
        suggestedCategories: cleanCategories,
        suggestedBrand: cleanBrand,
        ageRanges: cleanAgeRanges,
        gender: cleanGender,
        priceAppropriate: parsed.priceAppropriate !== false,
        ageIndicators: parsed.ageIndicators || [],
        genderIndicators: parsed.genderIndicators || []
      };
      
    } catch (error) {
      console.error('Failed to parse AI response:', error.message);
      console.error('Raw response:', aiResponse);
      
      // Return fallback segmentation
      return {
        segments: [{
          ageRange: 'AGE_13_15',
          gender: 'UNISEX',
          confidence: 0.3,
          reasoning: 'Fallback segmentation due to parsing error'
        }],
        reasoning: `AI parsing failed: ${error.message}`,
        confidence: 0.3,
        suggestedCategories: [],
        suggestedBrand: null,
        ageRanges: ['AGE_13_15'],
        gender: 'UNISEX',
        priceAppropriate: true,
        ageIndicators: [],
        genderIndicators: []
      };
    }
  }

  /**
   * Find or create segments based on AI analysis
   * @param {Object} segmentationResult - Parsed AI results
   * @returns {Promise<Array>} Array of segment objects
   */
  async findOrCreateSegments(segmentationResult) {
    const segments = [];
    
    for (const segmentData of segmentationResult.segments) {
      try {
        const segmentName = this.generateSegmentName(
          segmentData.ageRange, 
          segmentData.gender, 
          segmentationResult.suggestedCategories
        );
        
        const segment = await prisma.segment.upsert({
          where: {
            name_ageRange_gender: {
              name: segmentName,
              ageRange: segmentData.ageRange,
              gender: segmentData.gender
            }
          },
          update: {
            keywords: {
              set: [...new Set([
                ...segmentationResult.suggestedCategories,
                ...segmentationResult.ageIndicators,
                ...segmentationResult.genderIndicators
              ])]
            },
            updatedAt: new Date()
          },
          create: {
            name: segmentName,
            description: this.generateSegmentDescription(segmentData.ageRange, segmentData.gender),
            ageRange: segmentData.ageRange,
            gender: segmentData.gender,
            categories: segmentationResult.suggestedCategories,
            keywords: [
              ...segmentationResult.suggestedCategories,
              ...segmentationResult.ageIndicators,
              ...segmentationResult.genderIndicators
            ]
          }
        });
        
        segments.push({
          ...segment,
          confidence: segmentData.confidence,
          reasoning: segmentData.reasoning
        });
        
      } catch (error) {
        console.error('Error creating segment:', error.message);
      }
    }
    
    return segments;
  }

  /**
   * Generate a segment name
   * @param {string} ageRange - Age range enum
   * @param {string} gender - Gender enum
   * @param {string[]} categoryTags - Category tags
   * @returns {string} Segment name
   */
  generateSegmentName(ageRange, gender, categoryTags = []) {
    const ageLabel = this.ageRangeMap[ageRange]?.label || ageRange;
    const genderLabel = gender.toLowerCase();
    const primaryCategory = categoryTags[0] || 'general';
    
    return `${genderLabel} ${primaryCategory} ${ageLabel}`.replace(/\s+/g, ' ').trim();
  }

  /**
   * Generate a segment description
   * @param {string} ageRange - Age range enum
   * @param {string} gender - Gender enum
   * @returns {string} Segment description
   */
  generateSegmentDescription(ageRange, gender) {
    const ageInfo = this.ageRangeMap[ageRange];
    const genderLabel = gender.toLowerCase();
    
    return `Products targeted at ${genderLabel} customers aged ${ageInfo?.label || ageRange}`;
  }

  /**
   * Assign segments to a product
   * @param {string} productId - Product ID
   * @param {Array} segments - Segments with confidence scores
   * @returns {Promise<Array>} Created product segment assignments
   */
  async assignSegmentsToProduct(productId, segments) {
    const assignments = [];
    
    for (const segment of segments) {
      try {
        const assignment = await prisma.productSegment.upsert({
          where: {
            productId_segmentId: {
              productId,
              segmentId: segment.id
            }
          },
          update: {
            confidence: segment.confidence,
            reasoning: segment.reasoning,
            updatedAt: new Date()
          },
          create: {
            productId,
            segmentId: segment.id,
            confidence: segment.confidence,
            reasoning: segment.reasoning
          }
        });
        
        assignments.push(assignment);
      } catch (error) {
        console.error('Error assigning segment to product:', error.message);
      }
    }
    
    return assignments;
  }

  /**
   * Get products by segment
   * @param {string} ageRange - Age range filter
   * @param {string} gender - Gender filter
   * @param {number} minConfidence - Minimum confidence score
   * @returns {Promise<Array>} Products in segment
   */
  async getProductsBySegment(ageRange, gender, minConfidence = 0.5) {
    try {
      const products = await prisma.product.findMany({
        where: {
          segments: {
            some: {
              segment: {
                ageRange,
                gender
              },
              confidence: {
                gte: minConfidence
              }
            }
          }
        },
        include: {
          segments: {
            include: {
              segment: true
            },
            where: {
              confidence: {
                gte: minConfidence
              }
            }
          },
          categories: true
        },
        orderBy: {
          segments: {
            _count: 'desc'
          }
        }
      });
      
      return products;
    } catch (error) {
      console.error('Error fetching products by segment:', error.message);
      return [];
    }
  }

  /**
   * Get segment analytics
   * @returns {Promise<Object>} Segment statistics
   */
  async getSegmentAnalytics() {
    try {
      const analytics = await prisma.segment.findMany({
        include: {
          _count: {
            select: {
              productSegments: true
            }
          },
          productSegments: {
            select: {
              confidence: true
            }
          }
        }
      });
      
      return analytics.map(segment => ({
        ...segment,
        productCount: segment._count.productSegments,
        averageConfidence: segment.productSegments.length > 0
          ? segment.productSegments.reduce((sum, ps) => sum + ps.confidence, 0) / segment.productSegments.length
          : 0
      }));
    } catch (error) {
      console.error('Error fetching segment analytics:', error.message);
      return [];
    }
  }
}

export const aiSegmentationService = new AISegmentationService();
export default aiSegmentationService;
