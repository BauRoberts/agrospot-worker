// Clean up remaining duplicates after partial consolidation
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanup() {
  console.log("🧹 Cleaning up remaining duplicate products...\n");

  // Products to clean: Soja (14), Sorgo (17), Trigo (16)
  const duplicateIds = [14, 17, 16];
  const consolidateTo = [5, 7, 6]; // Soja -> 5, Sorgo -> 7, Trigo -> 6
  const names = ["Soja", "Sorgo", "Trigo"];

  for (let i = 0; i < duplicateIds.length; i++) {
    const dupId = duplicateIds[i];
    const targetId = consolidateTo[i];
    const name = names[i];

    console.log(`\n📦 Processing: ${name} (ID ${dupId} → ${targetId})`);

    try {
      // 1. Migrate opportunities
      const oppResult = await prisma.opportunity.updateMany({
        where: { productId: dupId },
        data: { productId: targetId },
      });
      console.log(`  ✅ Migrated ${oppResult.count} opportunities`);

      // 2. Migrate quotations
      const quoteResult = await prisma.quotation.updateMany({
        where: { productId: dupId },
        data: { productId: targetId },
      });
      console.log(`  ✅ Migrated ${quoteResult.count} quotations`);

      // 3. Delete ALL reference prices for duplicate
      const refResult = await prisma.referencePrice.deleteMany({
        where: { productId: dupId },
      });
      console.log(`  ✅ Deleted ${refResult.count} reference prices`);

      // 4. Delete the duplicate product
      await prisma.product.delete({
        where: { id: dupId },
      });
      console.log(`  ✅ Deleted duplicate product`);

    } catch (error) {
      console.error(`  ❌ Error:`, error);
    }
  }

  console.log("\n\n✅ Cleanup complete!\n");

  // Verify final state
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
      `Ref: ${p.referencePrice.length > 0 ? p.referencePrice[0].pricePerTon : "N/A"}`
    );
  });

  await prisma.$disconnect();
}

cleanup().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
