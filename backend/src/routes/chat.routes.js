import express from 'express';
import { chatService } from '../chat/chatService.js';
import { productMatcher } from '../chat/productMatcher.js';
import { conversationLogger } from '../chat/conversationLogger.js';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Start a new chat session
 */
router.post('/start', async (req, res) => {
  try {
    const { userAge, userGender, userId, preferences = {}, userProfile = {} } = req.body;

    // Handle both nested userProfile and direct properties
    const extractedAge = userAge || userProfile.age;
    const extractedGender = userGender || userProfile.gender;
    const extractedPreferences = preferences || userProfile.preferences || {};
    const extractedUserId = userId || userProfile.userId;

    // Generate unique session ID
    const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Convert gender to uppercase for Prisma enum
    const normalizedGender = extractedGender ? extractedGender.toUpperCase() : null;

    const session = await chatService.createSession(
      extractedUserId || `user_${Date.now()}`,
      {
        sessionId,
        age: extractedAge,
        gender: normalizedGender,
        preferences: extractedPreferences,
        initialIntent: userProfile.initialIntent || 'browse'
      }
    );

    // Send welcome message using the session ID string, not database session.id
    const welcomeResponse = await chatService.processMessage(
      session.sessionId,
      "START_CHAT"  // This will trigger the greeting template
    );

    res.json({
      success: true,
      sessionId: session.sessionId,
      session,
      welcomeMessage: welcomeResponse
    });

  } catch (error) {
    console.error('❌ Chat start error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start chat session' 
    });
  }
});

/**
 * Send a message to the chat
 */
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and message are required'
      });
    }

    const response = await chatService.processMessage(sessionId, message);

    // Map 'products' to 'suggestedProducts' for frontend compatibility
    // Separate local and Rainforest products
    const localProducts = (response.products || []).filter(p => p.source !== 'rainforest');
    const rainforestProducts = (response.products || []).filter(p => p.source === 'rainforest');
    
    // Debug logging for image URLs
    console.log('🖼️ Image URL Debug:');
    console.log('Local products:', localProducts.map(p => ({
      title: p.title?.substring(0, 40),
      imageUrl: p.imageUrl,
      image: p.image
    })));
    console.log('Rainforest products:', rainforestProducts.map(p => ({
      title: p.title?.substring(0, 40),
      imageUrl: p.imageUrl,
      image: p.image,
      id: p.id
    })));
    
    const formattedResponse = {
      content: response.message,  // Also map 'message' to 'content'
      suggestedProducts: localProducts,
      rainforestProducts: rainforestProducts,
      suggestions: response.suggestions || [],
      dynamicPrompts: response.dynamicPrompts || [],  // NEW: Include dynamic prompts
      searchId: response.searchId                      // NEW: Include search ID for filtering
    };

    // If no local products found but AI detected a product mention, search Rainforest API
    if (formattedResponse.suggestedProducts.length === 0 && response.products !== undefined) {
      // Products were searched but none found - don't add Rainforest fallback since
      // the chatService already handles this internally
    }

    console.log('📤 Sending response with products:', {
      localCount: formattedResponse.suggestedProducts.length,
      hasRainforest: formattedResponse.rainforestProducts.length > 0
    });

    // Add debug information for the debug panel
    const debugInfo = {
      extractedProduct: response.extractedProduct || null,
      searchKeywords: response.searchKeywords || [],
      promptUsed: response.promptUsed || 'unknown',
      searchStrategy: response.searchStrategy || 'unknown',
      processingTime: response.processingTime || 0
    };

    res.json({
      success: true,
      response: formattedResponse,
      debug: debugInfo
    });

  } catch (error) {
    console.error('❌ Chat message error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process message' 
    });
  }
});

/**
 * Get chat history for a session
 */
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            interactions: {
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    price: true,
                    imageUrl: true,
                    rating: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }

    res.json({
      success: true,
      session,
      messages: session.messages
    });

  } catch (error) {
    console.error('❌ Chat history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get chat history' 
    });
  }
});

/**
 * Log user interaction (product click, favorite, etc.)
 */
router.post('/interaction', async (req, res) => {
  try {
    const { sessionId, messageId, type, productId, data } = req.body;

    const session = await prisma.chatSession.findUnique({
      where: { sessionId }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }

    const interaction = await conversationLogger.logInteraction(session.id, {
      messageId,
      type,
      productId,
      data
    });

    // If it's a product interaction, get related products
    let relatedProducts = [];
    if (productId && (type === 'PRODUCT_CLICK' || type === 'PRODUCT_FAVORITE')) {
      relatedProducts = await productMatcher.getRelatedProducts(productId, session, 3);
    }

    res.json({
      success: true,
      interaction,
      relatedProducts
    });

  } catch (error) {
    console.error('❌ Interaction logging error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to log interaction' 
    });
  }
});

/**
 * Search Rainforest API for products not in our database
 */
async function searchRainforestAPI(query) {
  try {
    const apiKey = process.env.RAINFOREST_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ Rainforest API key not found');
      return [];
    }

    const response = await fetch('https://api.rainforestapi.com/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        type: 'search',
        amazon_domain: 'amazon.com',
        search_term: query,
        max_page: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Rainforest API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.search_results) {
      return [];
    }

    // Transform Rainforest results to our format
    return data.search_results.slice(0, 3).map(result => ({
      id: `rainforest_${result.asin || result.position}`,
      title: result.title,
      price: result.price?.value,
      formattedPrice: result.price?.raw || 'Price not available',
      imageUrl: result.image,
      rating: result.rating,
      ratingsTotal: result.ratings_total,
      url: result.link,
      source: 'rainforest',
      asin: result.asin,
      isExternal: true
    }));

  } catch (error) {
    console.error('🔍❌ Rainforest API search failed:', error);
    return [];
  }
}

/**
 * End chat session
 */
router.post('/end', async (req, res) => {
  try {
    const { sessionId, reason = 'user_ended' } = req.body;

    await conversationLogger.logSessionEnd(sessionId, reason);

    res.json({
      success: true,
      message: 'Chat session ended'
    });

  } catch (error) {
    console.error('❌ Chat end error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to end chat session' 
    });
  }
});

/**
 * Get chat analytics (admin only)
 */
router.get('/analytics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const analytics = await conversationLogger.getConversationAnalytics(timeframe);

    res.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get analytics' 
    });
  }
});

export default router;
