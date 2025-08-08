// Cleanup Script - Remove segments that don't return products
import { prisma } from './src/lib/prisma.js';

async function cleanupSegments() {
  console.log('🧹 CLEANING UP SEGMENTS THAT DON\'T RETURN PRODUCTS\n');

  try {
    // Get all segments
    const segments = await prisma.segment.findMany({
      include: {
        _count: { select: { productSegments: true } }
      }
    });

    console.log(`Found ${segments.length} total segments\n`);

    const segmentsToRemove = [];

    // Test each segment to see if it actually returns products
    for (const segment of segments) {
      console.log(`Testing: ${segment.name} (${segment.ageRange}/${segment.gender})`);
      console.log(`  ProductSegments count: ${segment._count.productSegments}`);

      // Query products the same way the frontend does
      const products = await prisma.product.findMany({
        where: {
          segments: {
            some: {
              segmentId: segment.id,
            },
          },
        },
        include: { categories: true },
      });

      console.log(`  Actual products returned: ${products.length}`);

      if (products.length === 0 && segment._count.productSegments > 0) {
        console.log(`  ❌ MISMATCH: Has ${segment._count.productSegments} productSegments but returns 0 products`);
        segmentsToRemove.push(segment);
      } else if (products.length === 0) {
        console.log(`  ❌ EMPTY: No products at all`);
        segmentsToRemove.push(segment);
      } else {
        console.log(`  ✅ GOOD: Returns ${products.length} products`);
      }
      console.log('');
    }

    console.log(`\n🗑️  SEGMENTS TO REMOVE: ${segmentsToRemove.length}`);
    
    if (segmentsToRemove.length > 0) {
      console.log('\nSegments that will be removed:');
      segmentsToRemove.forEach(seg => {
        console.log(`  - ${seg.name} (${seg.ageRange}/${seg.gender})`);
      });

      console.log('\nRemoving segments and their product assignments...');
      
      for (const segment of segmentsToRemove) {
        // Remove product segment assignments first
        await prisma.productSegment.deleteMany({
          where: { segmentId: segment.id }
        });
        
        // Remove the segment
        await prisma.segment.delete({
          where: { id: segment.id }
        });
        
        console.log(`  ✅ Removed: ${segment.name}`);
      }
      
      console.log(`\n🎉 Cleanup complete! Removed ${segmentsToRemove.length} empty segments.`);
    } else {
      console.log('\n✅ No cleanup needed - all segments return products!');
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupSegments();
