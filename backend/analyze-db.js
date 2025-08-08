// Database Analysis Script
import { prisma } from './src/lib/prisma.js';

async function analyzeDatabase() {
  console.log('🔍 ANALYZING DATABASE STRUCTURE AND DATA\n');

  try {
    // 1. Check all products
    console.log('📦 PRODUCTS:');
    const products = await prisma.product.findMany({
      include: {
        categories: true,
        segments: {
          include: {
            segment: true
          }
        }
      }
    });
    
    console.log(`Total products: ${products.length}\n`);
    products.forEach((product, i) => {
      console.log(`${i + 1}. ${product.title} (${product.asin})`);
      console.log(`   Categories: ${product.categories.map(c => `${c.name} (${c.ageGroup}/${c.gender})`).join(', ')}`);
      console.log(`   Assigned to ${product.segments.length} segments: ${product.segments.map(s => s.segment.name).join(', ')}`);
      console.log('');
    });

    // 2. Check all segments
    console.log('\n🎯 SEGMENTS:');
    const segments = await prisma.segment.findMany({
      include: {
        _count: { select: { productSegments: true } },
        productSegments: {
          include: {
            product: true
          }
        }
      }
    });
    
    console.log(`Total segments: ${segments.length}\n`);
    segments.forEach((segment, i) => {
      console.log(`${i + 1}. ${segment.name}`);
      console.log(`   Age/Gender: ${segment.ageRange}/${segment.gender}`);
      console.log(`   Categories: [${segment.categories?.join(', ') || 'none'}]`);
      console.log(`   Product count: ${segment._count.productSegments}`);
      if (segment.productSegments.length > 0) {
        console.log(`   Products: ${segment.productSegments.map(ps => `${ps.product.title} (confidence: ${ps.confidence})`).join(', ')}`);
      }
      console.log('');
    });

    // 3. Check product-segment relationships
    console.log('\n🔗 PRODUCT-SEGMENT RELATIONSHIPS:');
    const productSegments = await prisma.productSegment.findMany({
      include: {
        product: true,
        segment: true
      }
    });
    
    console.log(`Total product-segment relationships: ${productSegments.length}\n`);
    productSegments.forEach((ps, i) => {
      console.log(`${i + 1}. ${ps.product.title} → ${ps.segment.name} (confidence: ${ps.confidence})`);
    });

    // 4. Check categories
    console.log('\n📂 CATEGORIES:');
    const categories = await prisma.category.findMany({
      include: {
        _count: { select: { products: true } }
      }
    });
    
    console.log(`Total categories: ${categories.length}\n`);
    categories.forEach((cat, i) => {
      console.log(`${i + 1}. ${cat.name} (${cat.ageGroup}/${cat.gender}) - ${cat._count.products} products`);
    });

    // 5. Find potential issues
    console.log('\n⚠️  POTENTIAL ISSUES:');
    
    // Segments with no products
    const emptySegments = segments.filter(s => s._count.productSegments === 0);
    if (emptySegments.length > 0) {
      console.log(`❌ ${emptySegments.length} segments with no products:`);
      emptySegments.forEach(s => console.log(`   - ${s.name} (${s.ageRange}/${s.gender})`));
    }
    
    // Products with no segments
    const unassignedProducts = products.filter(p => p.segments.length === 0);
    if (unassignedProducts.length > 0) {
      console.log(`❌ ${unassignedProducts.length} products with no segments:`);
      unassignedProducts.forEach(p => console.log(`   - ${p.title} (${p.asin})`));
    }
    
    // Products with no categories
    const uncategorizedProducts = products.filter(p => p.categories.length === 0);
    if (uncategorizedProducts.length > 0) {
      console.log(`❌ ${uncategorizedProducts.length} products with no categories:`);
      uncategorizedProducts.forEach(p => console.log(`   - ${p.title} (${p.asin})`));
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDatabase();
