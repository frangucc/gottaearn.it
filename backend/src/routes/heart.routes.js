import express from 'express';
import { redisService } from '../services/redis.service.js';

const router = express.Router();

/**
 * Add item to hearted list
 */
router.post('/heart', async (req, res) => {
  try {
    const { sessionId, product } = req.body;
    
    if (!sessionId || !product) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and product are required'
      });
    }
    
    const heartedItems = await redisService.addHeartedItem(sessionId, product);
    
    console.log(`❤️ Item hearted: ${product.title || product.name} for session ${sessionId}`);
    
    res.json({
      success: true,
      heartedItems,
      count: heartedItems.length
    });
  } catch (error) {
    console.error('Error hearting item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to heart item'
    });
  }
});

/**
 * Remove item from hearted list
 */
router.delete('/heart', async (req, res) => {
  try {
    const { sessionId, productId } = req.body;
    
    if (!sessionId || !productId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and product ID are required'
      });
    }
    
    const heartedItems = await redisService.removeHeartedItem(sessionId, productId);
    
    console.log(`💔 Item unhearted: ${productId} for session ${sessionId}`);
    
    res.json({
      success: true,
      heartedItems,
      count: heartedItems.length
    });
  } catch (error) {
    console.error('Error unhearting item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unheart item'
    });
  }
});

/**
 * Get all hearted items for a session
 */
router.get('/heart/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }
    
    const heartedItems = await redisService.getHeartedItems(sessionId);
    
    res.json({
      success: true,
      heartedItems,
      count: heartedItems.length
    });
  } catch (error) {
    console.error('Error getting hearted items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get hearted items'
    });
  }
});

export default router;
