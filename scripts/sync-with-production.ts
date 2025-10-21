import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncWithProduction() {
  console.log('🔄 Starting sync with production IDs...\n');

  try {
    // Mapping: old local ID → new production ID
    const productMapping = {
      4: 15,  // Maíz
      5: 14,  // Soja
      6: 16,  // Trigo
      7: 17,  // Sorgo
    };

    // Step 1: Create temporary products with production IDs
    console.log('Step 1: Creating temporary products with production IDs...');

    for (const [oldId, newId] of Object.entries(productMapping)) {
      const oldProduct = await prisma.product.findUnique({
        where: { id: parseInt(oldId) }
      });

      if (!oldProduct) {
        console.log(`  ⚠️  Product ${oldId} not found, skipping...`);
        continue;
      }

      // Check if production ID already exists
      const existingNew = await prisma.product.findUnique({
        where: { id: newId }
      });

      if (existingNew) {
        console.log(`  ✓ Product ${newId} (${existingNew.name}) already exists`);
        continue;
      }

      await prisma.product.create({
        data: {
          id: newId,
          name: oldProduct.name,
          category: oldProduct.category,
          createdAt: oldProduct.createdAt,
          updatedAt: oldProduct.updatedAt,
        }
      });
      console.log(`  ✓ Created product ${newId} (${oldProduct.name})`);
    }

    // Step 2: Update all foreign key references
    console.log('\nStep 2: Updating foreign key references...');

    for (const [oldId, newId] of Object.entries(productMapping)) {
      const oldIdNum = parseInt(oldId);

      // Update opportunities
      const oppsResult = await prisma.opportunity.updateMany({
        where: { productId: oldIdNum },
        data: { productId: newId }
      });
      console.log(`  ✓ Updated ${oppsResult.count} opportunities: ${oldId} → ${newId}`);

      // Update quotations
      const quotsResult = await prisma.quotation.updateMany({
        where: { productId: oldIdNum },
        data: { productId: newId }
      });
      console.log(`  ✓ Updated ${quotsResult.count} quotations: ${oldId} → ${newId}`);

      // Update reference prices
      const refPricesResult = await prisma.referencePrice.updateMany({
        where: { productId: oldIdNum },
        data: { productId: newId }
      });
      console.log(`  ✓ Updated ${refPricesResult.count} reference prices: ${oldId} → ${newId}`);
    }

    // Step 3: Delete old products
    console.log('\nStep 3: Deleting old products...');
    for (const oldId of Object.keys(productMapping)) {
      await prisma.product.delete({
        where: { id: parseInt(oldId) }
      });
      console.log(`  ✓ Deleted old product ${oldId}`);
    }

    // Step 4: Verify Rosario opportunities
    console.log('\nStep 4: Verifying Rosario opportunities...');
    const rosarioOpps = await prisma.opportunity.findMany({
      where: { id: { in: [-1, -2, -3, -4] } },
      include: { product: true }
    });

    console.log('\n📊 Final Rosario Opportunities:');
    rosarioOpps.forEach(o => {
      console.log(`  Opp ID ${o.id}: Product ${o.productId} (${o.product.name})`);
    });

    // Step 5: Verify final state
    console.log('\n✅ Final verification:');
    const finalProducts = await prisma.product.findMany({ orderBy: { id: 'asc' } });
    console.log('\n📦 Products:');
    finalProducts.forEach(p => console.log(`  ID ${p.id}: ${p.name}`));

    console.log('\n🎉 Sync completed successfully!');
    console.log('\nNow your local database matches production IDs:');
    console.log('  - Soja: 14');
    console.log('  - Maíz: 15');
    console.log('  - Trigo: 16');
    console.log('  - Sorgo: 17');

  } catch (error) {
    console.error('❌ Error during sync:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

syncWithProduction()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
