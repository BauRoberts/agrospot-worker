// Auto-run consolidation without prompt
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mapping: [newId, oldId, productName]
const CONSOLIDATION_MAP: [number, number, string][] = [
  [15, 4, "Maíz"],
  [14, 5, "Soja"],
  [17, 7, "Sorgo"],
  [16, 6, "Trigo"],
];

async function consolidateProducts() {
  console.log("🔧 Starting product consolidation...\n");

  for (const [newId, oldId, name] of CONSOLIDATION_MAP) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`📦 Consolidating: ${name}`);
    console.log(`   Moving from ID ${newId} → ID ${oldId}`);
    console.log(`${"=".repeat(80)}\n`);

    try {
      // 1. Update opportunities
      const oppResult = await prisma.opportunity.updateMany({
        where: { productId: newId },
        data: { productId: oldId },
      });
      console.log(`✅ Migrated ${oppResult.count} opportunities`);

      // 2. Update quotations
      const quoteResult = await prisma.quotation.updateMany({
        where: { productId: newId },
        data: { productId: oldId },
      });
      console.log(`✅ Migrated ${quoteResult.count} quotations`);

      // 3. Check reference prices for both
      const oldRefPrice = await prisma.referencePrice.findFirst({
        where: { productId: oldId },
        orderBy: { createdAt: "desc" },
      });

      const newRefPrice = await prisma.referencePrice.findFirst({
        where: { productId: newId },
        orderBy: { createdAt: "desc" },
      });

      console.log(`\n📊 Reference Prices:`);
      console.log(`   Old (ID ${oldId}): ${oldRefPrice ? oldRefPrice.pricePerTon : "NONE"}`);
      console.log(`   New (ID ${newId}): ${newRefPrice ? newRefPrice.pricePerTon : "NONE"}`);

      // 4. Keep the newest reference price
      if (newRefPrice && oldRefPrice) {
        // Keep the most recent one by updating the old product to use the newer price
        if (newRefPrice.createdAt > oldRefPrice.createdAt) {
          // Delete old reference price
          await prisma.referencePrice.delete({
            where: { id: oldRefPrice.id },
          });
          // Update new reference price to point to old product
          await prisma.referencePrice.update({
            where: { id: newRefPrice.id },
            data: { productId: oldId },
          });
          console.log(`✅ Updated to use newer reference price`);
        } else {
          // Delete new reference price, keep old
          await prisma.referencePrice.delete({
            where: { id: newRefPrice.id },
          });
          console.log(`✅ Kept existing reference price (already newest)`);
        }
      } else if (newRefPrice && !oldRefPrice) {
        // Move new reference price to old product
        await prisma.referencePrice.update({
          where: { id: newRefPrice.id },
          data: { productId: oldId },
        });
        console.log(`✅ Migrated reference price from new to old`);
      } else if (!newRefPrice && !oldRefPrice) {
        console.log(`⚠️  No reference prices found for either product`);
      }

      // 5. Make sure ALL reference prices for the new product are gone
      const remainingRefPrices = await prisma.referencePrice.deleteMany({
        where: { productId: newId },
      });
      if (remainingRefPrices.count > 0) {
        console.log(`✅ Cleaned up ${remainingRefPrices.count} remaining reference prices`);
      }

      // 6. Delete the duplicate product
      await prisma.product.delete({
        where: { id: newId },
      });
      console.log(`✅ Deleted duplicate product (ID ${newId})`);

      console.log(`\n✅ Successfully consolidated ${name}!`);
    } catch (error) {
      console.error(`❌ Error consolidating ${name}:`, error);
      throw error;
    }
  }

  console.log(`\n\n${"=".repeat(80)}`);
  console.log(`🎉 All products consolidated successfully!`);
  console.log(`${"=".repeat(80)}\n`);

  // Verify results
  console.log("🔍 Verifying final state...\n");
  const products = await prisma.product.findMany({
    include: {
      _count: {
        select: {
          opportunities: true,
          quotations: true,
          referencePrice: true,
        },
      },
      referencePrice: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  console.log("📋 FINAL PRODUCT LIST:\n");
  products.forEach((p) => {
    console.log(
      `✅ ID:${p.id.toString().padStart(3)} | ${p.name.padEnd(20)} | ` +
      `Opps:${p._count.opportunities.toString().padStart(3)} | ` +
      `Quotes:${p._count.quotations.toString().padStart(3)} | ` +
      `RefPrices:${p._count.referencePrice} | ` +
      `Current: ${p.referencePrice.length > 0 ? p.referencePrice[0].pricePerTon : "N/A"}`
    );
  });

  await prisma.$disconnect();
}

consolidateProducts().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
