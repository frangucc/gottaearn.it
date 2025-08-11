import express from 'express';
import { redisService } from '../services/redis.service.js';
import { chatService } from '../chat/chatService.js';

const router = express.Router();

/**
 * Filter cached search results based on dynamic prompt action
 */
router.post('/filter', async (req, res) => {
  try {
    const { sessionId, searchId, action, value } = req.body;
    
    if (!sessionId || !searchId || !action) {
      return res.status(400).json({
        success: false,
        error: 'Session ID, search ID, and action are required'
      });
    }
    
    // Get cached search results
    const cachedData = await redisService.getCachedResults(sessionId, searchId);
    
    if (!cachedData) {
      return res.status(404).json({
        success: false,
        error: 'Cached results not found. Please perform a new search.'
      });
    }
    
    let filteredProducts = cachedData.results.products || [];
    let message = '';
    
    // Apply filter based on action
    switch (action) {
      case 'filter_price':
        const maxPrice = value?.max || 100;
        filteredProducts = filteredProducts.filter(p => 
          p.price && p.price <= maxPrice
        );
        message = `Here are options under $${maxPrice}:`;
        break;
        
      case 'filter_theme':
        const theme = value?.theme?.toLowerCase() || '';
        filteredProducts = filteredProducts.filter(p => {
          const text = `${p.title} ${p.description || ''}`.toLowerCase();
          return text.includes(theme);
        });
        message = `Here are ${theme} themed products:`;
        break;
        
      case 'filter_brand':
        const brand = value?.brand?.toLowerCase() || '';
        filteredProducts = filteredProducts.filter(p => {
          const productBrand = (p.brand || '').toLowerCase();
          const title = (p.title || '').toLowerCase();
          return productBrand.includes(brand) || title.includes(brand);
        });
        message = `Here are ${value?.brand} products:`;
        break;
        
      case 'show_hearted':
        const heartedItems = await redisService.getHeartedItems(sessionId);
        filteredProducts = heartedItems;
        message = heartedItems.length > 0 
          ? `Here are your hearted items:`
          : `You haven't hearted any items yet. Heart items you like to save them!`;
        break;
        
      default:
        message = 'Showing all results:';
    }
    
    // Generate new dynamic prompts based on filtered results
    const dynamicPrompts = await chatService.generateDynamicPrompts(
      filteredProducts, 
      cachedData.results.extractedProduct
    );
    
    // Log the filter action
    console.log(`🔍 Filter applied: ${action} for session ${sessionId}`);
    console.log(`📊 Results: ${filteredProducts.length} products after filtering`);
    
    res.json({
      success: true,
      message,
      products: filteredProducts,
      dynamicPrompts,
      action,
      originalCount: cachedData.results.products.length,
      filteredCount: filteredProducts.length
    });
    
  } catch (error) {
    console.error('Error filtering results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to filter results'
    });
  }
});

/**
 * Get cached results without filtering
 */
router.get('/cached/:sessionId/:searchId', async (req, res) => {
  try {
    const { sessionId, searchId } = req.params;
    
    const cachedData = await redisService.getCachedResults(sessionId, searchId);
    
    if (!cachedData) {
      return res.status(404).json({
        success: false,
        error: 'Cached results not found'
      });
    }
    
    res.json({
      success: true,
      ...cachedData.results,
      cached: true,
      cachedAt: cachedData.timestamp
    });
    
  } catch (error) {
    console.error('Error getting cached results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cached results'
    });
  }
});

export default router;
