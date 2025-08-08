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

async function processAllProducts() {
  try {
    console.log('🚀 Processing all products for AI segmentation...');
    
    // Get all products that haven't been segmented yet
    const products = await prisma.product.findMany({
      include: {
        segments: true
      }
    });
    
    console.log(`📦 Found ${products.length} products to process`);
    
    let processed = 0;
    let segmentsCreated = 0;
    
    for (const product of products) {
      try {
        console.log(`\n🔄 Processing: ${product.title.substring(0, 50)}...`);
        
        // Skip if already has segments
        if (product.segments.length > 0) {
          console.log('⏭️  Already has segments, skipping');
          continue;
        }
        
        // Segment the product
        const result = await aiSegmentationService.segmentProduct(product);
        
        if (result.success && result.segments.length > 0) {
          // Assign segments to product
          const assignments = await aiSegmentationService.assignSegmentsToProduct(
            product.id, 
            result.segments
          );
          
          console.log(`✅ Created ${result.segments.length} segments, ${assignments.length} assignments`);
          segmentsCreated += result.segments.length;
        } else {
          console.log('❌ Segmentation failed:', result.error);
        }
        
        processed++;
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing product ${product.id}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Processing complete!`);
    console.log(`📊 Products processed: ${processed}`);
    console.log(`🎯 Segments created: ${segmentsCreated}`);
    
    // Show final segment count
    const totalSegments = await prisma.segment.count();
    console.log(`💾 Total segments in database: ${totalSegments}`);
    
  } catch (error) {
    console.error('❌ Bulk processing failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

processAllProducts();
