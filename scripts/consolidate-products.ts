// Script to consolidate duplicate products
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

      // 4. If new has reference price but old doesn't, migrate it
      if (newRefPrice && !oldRefPrice) {
        await prisma.referencePrice.update({
          where: { id: newRefPrice.id },
          data: { productId: oldId },
        });
        console.log(`✅ Migrated reference price from new to old`);
      } else if (newRefPrice && oldRefPrice) {
        // Keep the most recent one
        if (newRefPrice.createdAt > oldRefPrice.createdAt) {
          await prisma.referencePrice.update({
            where: { id: newRefPrice.id },
            data: { productId: oldId },
          });
          console.log(`✅ Updated to use newer reference price`);
        } else {
          console.log(`✅ Kept existing reference price (already newest)`);
        }
      }

      // 5. Delete any remaining reference prices for the new ID
      const deletedRefPrices = await prisma.referencePrice.deleteMany({
        where: { productId: newId },
      });
      if (deletedRefPrices.count > 0) {
        console.log(`✅ Cleaned up ${deletedRefPrices.count} old reference prices`);
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
      `Ref: ${p.referencePrice.length > 0 ? p.referencePrice[0].pricePerTon : "N/A"}`
    );
  });

  await prisma.$disconnect();
}

// Main execution with confirmation
async function main() {
  console.log("\n⚠️  WARNING: This will consolidate duplicate products!");
  console.log("⚠️  Make sure you have a database backup before proceeding.\n");

  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Do you want to proceed? (yes/no): ", async (answer: string) => {
    rl.close();

    if (answer.toLowerCase() === "yes") {
      await consolidateProducts();
    } else {
      console.log("\n❌ Operation cancelled.");
      process.exit(0);
    }
  });
}

// Run only if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { consolidateProducts };
