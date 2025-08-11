const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addPlayStationProducts() {
  console.log('🎮 Adding PlayStation products to database...');
  
  const playstationProducts = [
    {
      asin: 'PS5-CONSOLE-001',
      title: 'PlayStation 5 Console - 825GB SSD - DualSense Wireless Controller - 4K Gaming - Ray Tracing',
      price: 499.99,
      brand: 'Sony',
      description: 'Experience lightning-fast loading with an ultra-high speed SSD, deeper immersion with support for haptic feedback, adaptive triggers, and 3D Audio.',
      imageUrl: 'https://m.media-amazon.com/images/I/619BkvKW35L._SL1500_.jpg',
      link: 'https://www.amazon.com/PlayStation-5-Console/dp/B09DFCB66S',
      rating: 4.8,
      ratingsTotal: 15234,
      isPrime: true
    },
    {
      asin: 'PS5-DIGITAL-001',
      title: 'PlayStation 5 Digital Edition Console - All Digital Gaming - 825GB SSD - DualSense Controller',
      price: 399.99,
      brand: 'Sony',
      description: 'All-digital PlayStation 5 console with no disc drive. Play your favorite PS5 games via digital download.',
      imageUrl: 'https://m.media-amazon.com/images/I/619BkvKW35L._SL1500_.jpg',
      link: 'https://www.amazon.com/PlayStation-5-Digital/dp/B09DFHJTF5',
      rating: 4.7,
      ratingsTotal: 12456,
      isPrime: true
    },
    {
      asin: 'PS4-PRO-001',
      title: 'PlayStation 4 Pro 1TB Console - 4K Gaming - HDR Technology - Enhanced Gameplay',
      price: 299.99,
      brand: 'Sony',
      description: 'Take play to the next level with PS4 Pro. Heighten your experiences with 4K gaming and entertainment.',
      imageUrl: 'https://m.media-amazon.com/images/I/71jN27mYlhL._SL1500_.jpg',
      link: 'https://www.amazon.com/PlayStation-4-Pro-1TB/dp/B01LOP8EZC',
      rating: 4.6,
      ratingsTotal: 8934,
      isPrime: true
    }
  ];

  try {
    for (const product of playstationProducts) {
      const created = await prisma.product.upsert({
        where: { asin: product.asin },
        update: product,
        create: product
      });
      console.log(`✅ Added: ${created.title}`);
    }
    
    console.log('🎮 Successfully added PlayStation products!');
  } catch (error) {
    console.error('❌ Error adding products:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addPlayStationProducts();
