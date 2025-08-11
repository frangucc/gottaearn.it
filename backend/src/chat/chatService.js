import aiSegmentationService from '../services/ai-segmentation.service.js';
import { rainforestService } from '../services/rainforest.service.js';
import { promptTemplates } from './promptTemplates.js';
import { productMatcher } from './productMatcher.js';
import { prisma } from '../lib/prisma.js';
import { redisService } from '../services/redis.service.js';
import crypto from 'crypto';
import { conversationLogger } from './conversationLogger.js';

class ChatService {
  constructor() {
    this.sessions = new Map(); // Active session cache
  }

  /**
   * Get or create a session for the user
   */
  async getOrCreateSession(sessionId) {
    try {
      // Try to get from Redis first
      let session = await redisService.getSession(sessionId);
      
      if (!session) {
        // Create new session
        session = {
          sessionId,
          createdAt: new Date().toISOString(),
          conversationContext: {
            category: null,
            preferences: {},
            extractedInfo: {}
          },
          heartedItems: [],
          searchHistory: [],
          lastSearchId: null
        };
        
        await redisService.setSession(sessionId, session);
        console.log(`📝 Created new session: ${sessionId}`);
      } else {
        console.log(`♻️ Retrieved existing session: ${sessionId}`);
      }
      
      return session;
    } catch (error) {
      console.error('Error managing session:', error);
      // Return a basic session on error
      return {
        sessionId,
        conversationContext: {},
        heartedItems: [],
        searchHistory: []
      };
    }
  }

  /**
   * Generate a unique search ID
   */
  generateSearchId() {
    return `search_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Start a new chat session
   */
  async createSession(userId, userProfile = {}) {
    const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Ensure anonymous user exists in database
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      // Create anonymous user
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@anonymous.local`,
          name: `Anonymous User`,
          role: 'USER'
        }
      });
    }
    
    const session = await prisma.chatSession.create({
      data: {
        userId: user.id,
        sessionId,
        userAge: userProfile.age,
        userGender: userProfile.gender,
        preferences: userProfile.preferences || {},
        context: {
          sessionStart: new Date().toISOString(),
          userAgent: userProfile.userAgent,
          initialIntent: userProfile.initialIntent || 'browse'
        },
        status: 'ACTIVE'
      }
    });

    // Cache active session
    this.sessions.set(sessionId, {
      ...session,
      lastActivity: Date.now(),
      conversationState: 'greeting'
    });

    // Log session start (only if session was created successfully)
    if (session && session.id) {
      try {
        await conversationLogger.logInteraction(session.id, {
          type: 'SESSION_START',
          data: userProfile
        });
      } catch (logError) {
        console.error('⚠️ Failed to log session start:', logError);
        // Don't fail session creation if logging fails
      }
    }

    return session;
  }

  /**
   * Process incoming user message and generate AI response
   */
  async processMessage(sessionId, userMessage) {
    const startTime = Date.now();
    let session = null;
    
    try {
      // Get session context from database
      session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Log user message
      const userMessageRecord = await conversationLogger.logMessage(
        session.id,
        'USER',
        userMessage
      );

      // Determine conversation context and appropriate prompt
      const context = await this.buildConversationContext(session, userMessage);
      const promptTemplate = await this.selectPromptTemplate(context);
      
      // Only search for products if user is actually asking for something specific
      let relevantProducts = [];
      let searchId = null;
      
      // Don't search products for welcome messages or general chat
      const isWelcomeMessage = userMessage.includes("Hi! I'm here to help you discover");
      const isGeneralChat = !context.extractedProduct?.productDetected;
      
      if (!isWelcomeMessage && context.extractedProduct?.productDetected) {
        console.log(`🎯 User requested specific product: ${context.extractedProduct.productName}`);
        
        // Generate unique search ID
        searchId = this.generateSearchId();
        
        // Search for products
        relevantProducts = await this.findRelevantProductsWithFallback(context, session);
        
        // Log search results
        if (relevantProducts.length > 0) {
          console.log(`📦 Found ${relevantProducts.length} products for searchId: ${searchId}`);
        }
        
        // Update conversation context with preferences
        if (context.extractedProduct.brand || context.extractedProduct.category) {
          // Store preferences in session context (database)
          console.log(`📝 Storing preferences - Category: ${context.extractedProduct.category}, Brand: ${context.extractedProduct.brand}`);
        }
      } else {
        console.log(`💬 General chat - no product search needed`);
      }

      // Generate dynamic prompts based on results
      let dynamicPrompts = [];
      if (relevantProducts.length > 0) {
        dynamicPrompts = await this.generateDynamicPrompts(relevantProducts, context);
      }

      // Generate AI response
      const aiResponse = await this.generateAIResponse(
        promptTemplate,
        context,
        relevantProducts,
        session
      );

      // Log AI response with full context
      const responseTime = Date.now() - startTime;
      const aiMessageRecord = await conversationLogger.logMessage(
        session.id,
        'ASSISTANT',
        aiResponse.content,
        {
          promptUsed: promptTemplate.name,
          contextData: {
            products: relevantProducts.map(p => ({ id: p.id, title: p.title })),
            userSegment: context.userSegment,
            conversationStage: context.stage,
            searchId: searchId
          },
          aiModel: aiResponse.model,
          tokens: aiResponse.tokens,
          responseTime
        }
      );

      // Update session state
      await this.updateSessionState(session, context, aiResponse);

      console.log('📦 PRODUCTS BEING RETURNED:', {
        count: relevantProducts.length,
        products: relevantProducts.map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          source: p.source || 'local'
        }))
      });

      return {
        message: aiResponse.content,
        products: relevantProducts,
        suggestions: aiResponse.suggestions || [],
        dynamicPrompts: dynamicPrompts,  // NEW: Include dynamic prompts
        searchId: searchId,               // NEW: Include search ID for filtering
        messageId: aiMessageRecord.id,
        // Debug information
        extractedProduct: context.extractedProduct,
        searchKeywords: context.searchKeywords || [],
        promptUsed: promptTemplate,
        searchStrategy: relevantProducts.length > 0 ? 'local' : 'none',
        processingTime: responseTime
      };

    } catch (error) {
      console.error('💬❌ Chat processing error:', error);
      
      // Log error
      await conversationLogger.logMessage(
        session?.id,
        'SYSTEM',
        `Error processing message: ${error.message}`
      );

      return {
        message: "I'm having trouble right now. Could you try asking that again?",
        products: [],
        suggestions: ['Browse products', 'Try a different question'],
        error: true
      };
    }
  }

  /**
   * Build conversation context for AI prompt
   */
  async buildConversationContext(session, currentMessage) {
    // Get recent message history
    const recentMessages = await conversationLogger.getRecentMessages(session.id, 5);
    
    // Determine user segment
    const userSegment = await this.determineUserSegment(session);
    
    // Analyze user intent with AI product detection (now async)
    const intentAnalysis = await this.analyzeMessageIntent(currentMessage);
    
    // Determine conversation stage
    const stage = this.determineConversationStage(recentMessages.length, intentAnalysis.intent);

    return {
      session,
      currentMessage,
      messageHistory: recentMessages.reverse(),
      userSegment,
      intent: intentAnalysis.intent,
      extractedProduct: intentAnalysis.extractedProduct,
      stage,
      preferences: session.preferences || {}
    };
  }

  /**
   * Find relevant products with Rainforest API fallback
   */
  async findRelevantProductsWithFallback(context, session) {
    let localProducts = [];
    
    // Try local database first, enhanced with extracted product info
    try {
      localProducts = await productMatcher.findRelevantProducts(context, session);
      
      // If we have extracted product info but no local matches, be more aggressive in search
      if (localProducts.length === 0 && context.extractedProduct?.productDetected) {
        console.log('🔍 No local products found, trying enhanced local search...');
        
        // Try searching by keywords from AI extraction
        const keywords = context.extractedProduct.keywords || [];
        const category = context.extractedProduct.category;
        
        if (keywords.length > 0) {
          localProducts = await this.searchLocalByKeywords(keywords, category, session);
        }
      }
      
      console.log(`📦 Found ${localProducts.length} local products`);
      
    } catch (error) {
      console.error('❌ Local product search failed:', error);
      localProducts = [];
    }
    
    // BRAND VALIDATION: Check if local products match the requested brand
    if (localProducts.length > 0 && context.extractedProduct?.brand) {
      const requestedBrand = context.extractedProduct.brand.toLowerCase();
      console.log(`🏷️ Validating brand match for: ${requestedBrand}`);
      
      // Filter products to only those matching the requested brand
      const brandMatchedProducts = localProducts.filter(product => {
        const productTitle = (product.title || '').toLowerCase();
        const productBrand = (product.brand || '').toLowerCase();
        const productDescription = (product.description || '').toLowerCase();
        
        // Check if the product actually contains the requested brand
        return productTitle.includes(requestedBrand) || 
               productBrand.includes(requestedBrand) ||
               productDescription.includes(requestedBrand);
      });
      
      console.log(`✅ Brand validation: ${brandMatchedProducts.length} of ${localProducts.length} products match brand "${requestedBrand}"`);
      
      // Log what we found vs what was requested
      if (brandMatchedProducts.length === 0 && localProducts.length > 0) {
        console.log('⚠️ Found products but none match requested brand!');
        console.log('📋 User asked for:', context.extractedProduct.productName);
        console.log('📦 Found in database:', localProducts.slice(0, 3).map(p => p.title).join(', '));
        console.log('❌ These are NOT good matches - will resort to Rainforest API');
        
        // Clear local products since they don't match the brand
        localProducts = [];
      } else {
        localProducts = brandMatchedProducts;
      }
    }
    
    // AI RELEVANCE VALIDATION: Use AI to validate each product's relevance to the query
    if (localProducts.length > 0 && context.extractedProduct?.productDetected) {
      console.log(`🤖 Running AI relevance validation on ${localProducts.length} products...`);
      const userQuery = context.currentMessage || context.extractedProduct.productName || '';
      
      // Validate each product in parallel for speed
      const validationPromises = localProducts.map(product => 
        this.validateProductRelevance(product, userQuery, context.extractedProduct)
      );
      
      const validationResults = await Promise.all(validationPromises);
      
      // Filter to only keep relevant products
      const relevantProducts = localProducts.filter((product, index) => validationResults[index]);
      
      console.log(`✨ AI validation complete: ${relevantProducts.length} of ${localProducts.length} products are relevant`);
      
      if (relevantProducts.length === 0 && localProducts.length > 0) {
        console.log('🚫 AI rejected all local products as irrelevant!');
        console.log('📋 User searched for:', userQuery);
        console.log('❌ Rejected products:', localProducts.slice(0, 3).map(p => p.title).join(', '));
        console.log('🌧️ Will fall back to Rainforest API for better matches');
      }
      
      localProducts = relevantProducts;
    }
    
    // Determine if this is a browsing query (category/brand search) vs specific product
    const isBrowsingQuery = this.isBrowsingQuery(context.extractedProduct);
    
    // If we found local products
    if (localProducts.length > 0) {
      // For browsing queries with few local results, supplement with Rainforest
      if (isBrowsingQuery && localProducts.length < 5 && context.extractedProduct?.productDetected) {
        console.log(`🔄 Hybrid search: Found ${localProducts.length} local products, supplementing with Rainforest...`);
        
        try {
          const rainforestProducts = await this.searchRainforestAPI(context.extractedProduct, session);
          
          // Combine local (shown first) with Rainforest products
          // Limit Rainforest to fill up to 8 total products
          const supplementCount = Math.min(8 - localProducts.length, rainforestProducts.length);
          const supplementProducts = rainforestProducts.slice(0, supplementCount);
          
          console.log(`✨ Hybrid results: ${localProducts.length} local + ${supplementProducts.length} from Rainforest`);
          
          return [...localProducts, ...supplementProducts];
        } catch (error) {
          console.error('❌ Failed to supplement with Rainforest:', error);
          // Still return local products if Rainforest fails
          return localProducts;
        }
      }
      
      // For specific searches or when we have enough local products
      return localProducts;
    }
    
    // No local products - fallback to Rainforest API if product was detected
    console.log('🔍 DEBUG: Checking Rainforest fallback conditions:');
    console.log('  - localProducts.length:', localProducts.length);
    console.log('  - productDetected:', context.extractedProduct?.productDetected);
    console.log('  - extractedProduct:', JSON.stringify(context.extractedProduct));
    
    if (context.extractedProduct?.productDetected) {
      console.log('🌧️ No local matches - falling back to Rainforest API...');
      return await this.searchRainforestAPI(context.extractedProduct, session);
    }
    
    // NEVER return random products - only what user specifically requested
    console.log('❌ No specific product requested - returning empty results');
    return [];
  }

  /**
   * Determine if query is for browsing (category/brand) vs specific product
   */
  isBrowsingQuery(extractedProduct) {
    try {
      if (!extractedProduct) return false;
      
      const { productName = '', keywords = [], category = '', brand = '', intent = '' } = extractedProduct;
      
      // Indicators of browsing intent
      const browsingKeywords = ['set', 'sets', 'collection', 'options', 'choices', 'products', 'items', 'toys'];
      const pluralBrands = ['legos', 'nerf guns', 'barbies', 'hot wheels'];
      const generalCategories = ['toys', 'games', 'electronics', 'books', 'clothes', 'shoes'];
      
      // Handle null productName by using keywords and brand
      const nameLower = (productName || '').toLowerCase();
      const keywordsStr = keywords.join(' ').toLowerCase();
      
      // Check for plural forms or general category searches
      const isPlural = pluralBrands.some(p => nameLower.includes(p) || keywordsStr.includes(p));
      const hasGeneralCategory = generalCategories.some(c => nameLower.includes(c) || keywordsStr.includes(c));
      
      // Check if browsing keywords exist in either productName or keywords array
      const hasBrowsingKeyword = browsingKeywords.some(k => 
        nameLower.includes(k) || keywords.some(kw => kw.toLowerCase().includes(k))
      );
      
      // Special case for LEGO - check in keywords too
      const isLegoBrowsing = (brand && brand.toLowerCase().includes('lego') && keywords.some(k => k.toLowerCase() === 'set')) ||
                            (nameLower.includes('lego') && (nameLower.includes('set') || nameLower.includes('legos'))) ||
                            (keywordsStr.includes('lego') && keywordsStr.includes('set'));
      
      // If it's just a brand name or category without specific product
      const isBrandOnly = brand && (!productName || productName.toLowerCase().replace(brand.toLowerCase(), '').trim().length < 3);
      const isCategoryOnly = category && generalCategories.includes(category.toLowerCase());
      
      // Also check if intent is explicitly "browse"
      const isBrowseIntent = intent === 'browse';
      
      const isBrowsing = isLegoBrowsing || isPlural || hasGeneralCategory || hasBrowsingKeyword || 
                        isBrandOnly || isCategoryOnly || (isBrowseIntent && hasBrowsingKeyword);
      
      console.log('🔍 Query analysis:', {
        productName: productName || 'null',
        keywords: keywords,
        brand: brand,
        intent: intent,
        isBrowsing,
        checks: {
          isLegoBrowsing,
          isPlural,
          hasGeneralCategory,
          hasBrowsingKeyword,
          isBrandOnly,
          isCategoryOnly,
          isBrowseIntent
        }
      });
      
      return isBrowsing;
    } catch (error) {
      console.error('❌ Error in isBrowsingQuery:', error);
      return false; // Default to non-browsing on error
    }
  }

  /**
   * Generate dynamic prompts based on search results
   */
  async generateDynamicPrompts(products, context) {
    try {
      if (!products || products.length === 0) return [];
      
      // Analyze products to find common patterns
      const priceRanges = this.analyzePriceRanges(products);
      const themes = this.extractThemes(products);
      const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
      
      const prompts = [];
      
      // Price-based prompts
      if (priceRanges.under50.length > 0 && priceRanges.over50.length > 0) {
        prompts.push({
          text: `Show me options under $${Math.ceil(priceRanges.median)}`,
          action: 'filter_price',
          value: { max: Math.ceil(priceRanges.median) }
        });
      }
      
      if (priceRanges.under100.length > 3) {
        prompts.push({
          text: "Focus on budget-friendly options",
          action: 'filter_price',
          value: { max: 100 }
        });
      }
      
      // Theme-based prompts
      if (themes.length > 1) {
        const topTheme = themes[0];
        prompts.push({
          text: `Show more ${topTheme} themed items`,
          action: 'filter_theme',
          value: { theme: topTheme }
        });
      }
      
      // Brand-based prompts
      if (brands.length > 1) {
        const topBrand = brands[0];
        prompts.push({
          text: `Focus on ${topBrand} products`,
          action: 'filter_brand',
          value: { brand: topBrand }
        });
      }
      
      // Generic helpful prompts
      prompts.push({
        text: "Show my hearted items",
        action: 'show_hearted',
        value: {}
      });
      
      // Limit to 4 prompts max
      return prompts.slice(0, 4);
    } catch (error) {
      console.error('Error generating dynamic prompts:', error);
      return [];
    }
  }

  /**
   * Analyze price ranges in products
   */
  analyzePriceRanges(products) {
    const prices = products.map(p => p.price || 0).filter(p => p > 0).sort((a, b) => a - b);
    
    if (prices.length === 0) {
      return { under50: [], under100: [], over50: [], median: 0 };
    }
    
    const median = prices[Math.floor(prices.length / 2)];
    
    return {
      under50: products.filter(p => p.price && p.price < 50),
      under100: products.filter(p => p.price && p.price < 100),
      over50: products.filter(p => p.price && p.price >= 50),
      median
    };
  }

  /**
   * Extract themes from product titles and descriptions
   */
  extractThemes(products) {
    const themeWords = {};
    
    products.forEach(product => {
      const text = `${product.title} ${product.description || ''}`.toLowerCase();
      
      // Common themes to look for
      const themes = [
        'star wars', 'marvel', 'disney', 'technic', 'city', 'friends',
        'gaming', 'wireless', 'pro', 'mini', 'classic', 'retro',
        'educational', 'creative', 'building', 'racing', 'adventure'
      ];
      
      themes.forEach(theme => {
        if (text.includes(theme)) {
          themeWords[theme] = (themeWords[theme] || 0) + 1;
        }
      });
    });
    
    // Sort by frequency
    return Object.entries(themeWords)
      .sort((a, b) => b[1] - a[1])
      .map(([theme]) => theme);
  }

  /**
   * Validate if a product is actually relevant to the user's search query using AI
   */
  async validateProductRelevance(product, userQuery, extractedProduct) {
    try {
      const prompt = `You are a product relevance validator. Determine if this product is a good match for the user's search query.

User searched for: "${userQuery}"
${extractedProduct?.productName ? `Specific product requested: "${extractedProduct.productName}"` : ''}
${extractedProduct?.brand ? `Brand requested: "${extractedProduct.brand}"` : ''}
${extractedProduct?.category ? `Category: "${extractedProduct.category}"` : ''}

Product found in database:
Title: ${product.title}
Brand: ${product.brand || 'Unknown'}
Description: ${product.description || 'No description'}

Is this product a RELEVANT match for what the user is searching for?
Consider:
- Product type/category match
- Brand match (if specific brand requested)
- Model/variant match (e.g., "Technic Sián" vs "Super Mario" for LEGO)
- Features match

Respond with ONLY "true" if it's a good match, or "false" if it's not relevant.`;

      const response = await aiSegmentationService.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      });

      const result = response.content?.[0]?.text?.toLowerCase().trim() === 'true';
      
      if (!result) {
        console.log(`🚫 AI rejected product: "${product.title}" for query: "${userQuery}"`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error validating product relevance:', error);
      // On error, default to keeping the product to avoid breaking the flow
      return true;
    }
  }

  /**
   * Enhanced local search using AI-extracted keywords
   */
  async searchLocalByKeywords(keywords, category, session) {
    try {
      const searchTerms = keywords.join(' ');
      
      // Check if searching for a specific brand - expanded list
      const brandKeywords = keywords.filter(k => 
        ['xbox', 'playstation', 'nintendo', 'apple', 'samsung', 'sony', 'beats', 'bose', 'jbl', 'airpods'].includes(k.toLowerCase())
      );
      
      let whereClause;
      
      if (brandKeywords.length > 0) {
        // For brand searches, be VERY strict - all brand keywords must match
        console.log(`🎯 Strict brand search for: ${brandKeywords.join(', ')}`);
        whereClause = {
          AND: brandKeywords.map(brand => ({
            OR: [
              { title: { contains: brand, mode: 'insensitive' } },
              { brand: { contains: brand, mode: 'insensitive' } }
            ]
          }))
        };
      } else {
        // For non-brand searches, use the original logic
        whereClause = {
          OR: [
            { title: { contains: searchTerms, mode: 'insensitive' } },
            { description: { contains: searchTerms, mode: 'insensitive' } },
            ...keywords.map(keyword => ({
              title: { contains: keyword, mode: 'insensitive' }
            }))
          ]
        };
      }
      
      const products = await prisma.product.findMany({
        where: whereClause,
        include: {
          segments: {
            include: { segment: true }
          }
        },
        take: 10
      });
      
      // Filter out products that don't actually match the brand if brand was specified
      let filteredProducts = products;
      if (brandKeywords.length > 0) {
        filteredProducts = products.filter(product => {
          const productText = `${product.title} ${product.brand || ''}`.toLowerCase();
          return brandKeywords.every(brand => productText.includes(brand.toLowerCase()));
        });
        console.log(`🔍 Filtered ${products.length} products to ${filteredProducts.length} exact matches`);
      }
      
      return filteredProducts.map(product => ({
        ...product,
        relevanceScore: 0.7, // AI-enhanced search
        matchReason: `Keyword match: ${searchTerms}`
      }));
      
    } catch (error) {
      console.error('❌ Enhanced local search failed:', error);
      return [];
    }
  }

  /**
   * Search Rainforest API for products
   */
  async searchRainforestAPI(extractedProduct, session) {
    try {
      // Import the existing Rainforest service
      const { rainforestService } = await import('../services/rainforest.service.js');
      
      const searchQuery = extractedProduct.productName || extractedProduct.keywords.join(' ');
      console.log(`🌧️ Searching Rainforest API for: "${searchQuery}"`);
      
      // Use your existing service with correct method signature
      const rainforestResults = await rainforestService.searchProducts(searchQuery, {
        maxResults: 8,
        category: extractedProduct.category,
        useCache: true
      });
      
      // The service already returns formatted results, just add our metadata
      return rainforestResults.products.map(product => ({
        ...product,
        source: 'rainforest',
        relevanceScore: 0.9, // High since it's from external search  
        matchReason: `External search for "${searchQuery}"`
      }));
      
    } catch (error) {
      console.error('❌ Rainforest API search failed:', error);
      return [];
    }
  }

  /**
   * Select appropriate prompt template based on context
   */
  async selectPromptTemplate(context) {
    let templateName = 'general_chat';

    // Select template based on conversation stage and intent
    if (context.stage === 'greeting') {
      templateName = 'greeting';
    } else if (context.intent === 'product_search') {
      templateName = 'product_recommendation';
    } else if (context.intent === 'purchase_help') {
      templateName = 'purchase_assistant';
    } else if (context.intent === 'comparison') {
      templateName = 'product_comparison';
    }

    return await promptTemplates.getTemplate(templateName, {
      userAge: context.session.userAge,
      userGender: context.session.userGender,
      segment: context.userSegment
    });
  }

  /**
   * Generate AI response using Anthropic
   */
  async generateAIResponse(template, context, products, session) {
    const prompt = template.buildPrompt({
      userMessage: context.currentMessage,
      userAge: session.userAge,
      userGender: session.userGender,
      products: products.slice(0, 5), // Limit to top 5 products
      messageHistory: context.messageHistory.slice(-3), // Last 3 messages
      userPreferences: context.preferences
    });

    try {
      const response = await aiSegmentationService.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      // Track prompt template usage
      await promptTemplates.trackUsage(template.name);

      const responseContent = response.content?.[0]?.text || response.content || '';
      
      return {
        content: responseContent,
        usage: response.usage,
        suggestions: this.extractSuggestions(responseContent)
      };

    } catch (error) {
      console.error('💬🤖 AI generation error:', error);
      console.error('AI Response structure:', error.response?.data || 'No response data');
      throw new Error('AI service unavailable');
    }
  }

  /**
   * Determine user segment based on age and gender
   */
  async determineUserSegment(session) {
    if (!session.userAge) return null;

    let ageRange;
    if (session.userAge >= 10 && session.userAge <= 12) ageRange = 'AGE_10_12';
    else if (session.userAge >= 13 && session.userAge <= 15) ageRange = 'AGE_13_15';
    else if (session.userAge >= 16 && session.userAge <= 18) ageRange = 'AGE_16_18';
    else if (session.userAge >= 19 && session.userAge <= 21) ageRange = 'AGE_19_21';
    else return null;

    const segment = await prisma.segment.findFirst({
      where: {
        ageRange,
        gender: session.userGender || 'UNISEX'
      }
    });

    return segment;
  }

  /**
   * Analyze message to determine user intent using AI product detection
   */
  async analyzeMessageIntent(message) {
    // First check for obvious product mentions or specific intent keywords
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
      return { intent: 'purchase_help', extractedProduct: await this.extractProductFromMessage(message) };
    }
    if (lowerMessage.includes('compare') || lowerMessage.includes('vs') || lowerMessage.includes('better')) {
      return { intent: 'comparison', extractedProduct: await this.extractProductFromMessage(message) };
    }
    if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
      return { intent: 'help_request', extractedProduct: null };
    }
    
    // Use AI to detect product mentions and intent
    const productAnalysis = await this.extractProductFromMessage(message);
    
    if (productAnalysis && productAnalysis.productDetected) {
      return { intent: 'product_search', extractedProduct: productAnalysis };
    }
    
    // Check for explicit search terms
    if (lowerMessage.includes('find') || lowerMessage.includes('looking for') || lowerMessage.includes('need')) {
      return { intent: 'product_search', extractedProduct: productAnalysis };
    }
    
    return { intent: 'general_chat', extractedProduct: null };
  }

  /**
   * Use AI to extract product information from user message
   */
  async extractProductFromMessage(message) {
    console.log('🔍 Starting product extraction for message:', message);
    
    const extractionPrompt = `Analyze this user message to detect if they're asking about a specific product or product category:

"${message}"

Respond with ONLY a JSON object in this exact format:
{
"productDetected": true/false,
"productName": "specific product name if mentioned",
"brand": "specific brand if mentioned (e.g., Apple, Beats, Sony, Samsung, Xbox, PlayStation)",
"category": "product category (gaming, electronics, headphones, clothing, etc.)",
"keywords": ["key", "search", "terms"],
"intent": "browse/compare/buy/ask"
}

IMPORTANT: If a brand is mentioned, include it in the "brand" field.

Examples:
- "I want an xbox" → {"productDetected": true, "productName": "Xbox", "brand": "Xbox", "category": "gaming", "keywords": ["xbox", "gaming", "console"], "intent": "browse"}
- "beats headphones" → {"productDetected": true, "productName": "Beats headphones", "brand": "Beats", "category": "headphones", "keywords": ["beats", "headphones", "audio"], "intent": "browse"}
- "What's good?" → {"productDetected": false, "productName": null, "brand": null, "category": null, "keywords": [], "intent": "ask"}`;

    try {
      console.log('🤖 Calling Anthropic API for product extraction...');
      
      const response = await aiSegmentationService.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        temperature: 0.1,
        messages: [{ role: 'user', content: extractionPrompt }]
      });

      const responseText = response.content?.[0]?.text || '{}';
      console.log('🤖 Raw AI response:', responseText);
      
      const productData = JSON.parse(responseText.trim());
      console.log('🔍 Product extraction result:', productData);
      
      return productData;
    } catch (error) {
      console.error('❌ Product extraction failed:', error);
      console.error('❌ Error details:', error.message);
      
      // Simple fallback detection for common product terms
      const lowerMessage = message.toLowerCase();
      const productKeywords = ['xbox', 'playstation', 'nintendo', 'iphone', 'macbook', 'headphones', 'gaming', 'laptop'];
      const detectedKeyword = productKeywords.find(keyword => lowerMessage.includes(keyword));
      
      if (detectedKeyword) {
        console.log('🔍 Fallback detection found:', detectedKeyword);
        return {
          productDetected: true,
          productName: detectedKeyword,
          category: detectedKeyword === 'xbox' ? 'gaming' : 'electronics',
          keywords: [detectedKeyword],
          intent: 'browse'
        };
      }
      
      return { productDetected: false, productName: null, category: null, keywords: [], intent: 'ask' };
    }
  }

  /**
   * Determine conversation stage
   */
  determineConversationStage(messageCount, intent) {
    if (messageCount === 0) return 'greeting';
    if (messageCount <= 3) return 'exploration';
    if (intent === 'purchase_help') return 'conversion';
    return 'engagement';
  }

  /**
   * Extract follow-up suggestions from AI response
   */
  extractSuggestions(response) {
    // Simple regex to extract suggestions (can be enhanced)
    const suggestions = [];
    const lines = response.split('\n');
    
    lines.forEach(line => {
      if (line.includes('You might also like') || line.includes('Consider')) {
        suggestions.push(line.replace(/[•\-\*]/g, '').trim());
      }
    });

    return suggestions.length > 0 ? suggestions : [
      'Tell me more about your interests',
      'Show me similar products',
      'What\'s your budget range?'
    ];
  }

  /**
   * Update session state after processing message
   */
  async updateSessionState(session, context, aiResponse) {
    await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        totalMessages: { increment: 2 }, // User + AI message
        context: {
          ...session.context,
          lastIntent: context.intent,
          conversationStage: context.stage,
          lastInteraction: new Date().toISOString()
        }
      }
    });

    // Update cached session
    if (this.sessions.has(session.sessionId)) {
      this.sessions.set(session.sessionId, {
        ...this.sessions.get(session.sessionId),
        lastActivity: Date.now(),
        conversationState: context.stage
      });
    }
  }

  /**
   * Get session (from cache or database)
   */
  async getSession(sessionId) {
    // Check cache first
    if (this.sessions.has(sessionId)) {
      const cached = this.sessions.get(sessionId);
      // Refresh if stale (older than 1 hour)
      if (Date.now() - cached.lastActivity > 3600000) {
        this.sessions.delete(sessionId);
      } else {
        return cached;
      }
    }

    // Fetch from database
    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      include: { user: true }
    });

    if (session) {
      this.sessions.set(sessionId, {
        ...session,
        lastActivity: Date.now()
      });
    }

    return session;
  }

  /**
   * Log product interaction (click, favorite, etc.)
   */
  async logProductInteraction(sessionId, productId, interactionType, data = {}) {
    const session = await this.getSession(sessionId);
    if (!session) return;

    return await conversationLogger.logInteraction(session.id, {
      type: interactionType,
      productId,
      data
    });
  }

  /**
   * Get session analytics for admin dashboard
   */
  async getSessionAnalytics(sessionId) {
    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: true,
        interactions: {
          include: {
            product: { select: { id: true, title: true, price: true } }
          }
        }
      }
    });

    if (!session) return null;

    return {
      session,
      messageCount: session.messages.length,
      interactionCount: session.interactions.length,
      productsViewed: session.interactions
        .filter(i => i.type === 'PRODUCT_CLICK')
        .map(i => i.product),
      avgResponseTime: session.messages
        .filter(m => m.responseTime)
        .reduce((avg, m) => avg + m.responseTime, 0) / 
        session.messages.filter(m => m.responseTime).length || 0
    };
  }
}

export const chatService = new ChatService();
