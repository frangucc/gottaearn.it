import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');
config({ path: envPath });

import { prisma } from './src/lib/prisma.js';
import { aiSegmentationService } from './src/services/ai-segmentation.service.js';

async function testSegmentation() {
  try {
    console.log('🔍 Testing AI Segmentation...');
    console.log('Anthropic API Key:', process.env.ANTHROPIC_API_KEY ? 'Set ✓' : 'Missing ✗');
    
    // Get a product to test with
    const product = await prisma.product.findFirst({
      where: {
        title: {
          contains: 'Nike'
        }
      }
    });
    
    if (!product) {
      console.log('❌ No Nike product found for testing');
      return;
    }
    
    console.log(`📦 Testing with product: ${product.title}`);
    
    // Test segmentation
    const result = await aiSegmentationService.segmentProduct(product);
    
    console.log('🤖 Segmentation Result:', JSON.stringify(result, null, 2));
    
    if (result.success && result.segments.length > 0) {
      console.log('✅ Segmentation successful!');
      
      // Assign segments to product
      const assignments = await aiSegmentationService.assignSegmentsToProduct(
        product.id, 
        result.segments
      );
      
      console.log(`📊 Created ${assignments.length} segment assignments`);
    } else {
      console.log('❌ Segmentation failed or no segments created');
    }
    
    // Check segments in database
    const segments = await prisma.segment.findMany();
    console.log(`💾 Total segments in database: ${segments.length}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSegmentation();
