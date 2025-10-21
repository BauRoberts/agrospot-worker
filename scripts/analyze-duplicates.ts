// Script to analyze duplicate products and their references
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function analyzeDuplicates() {
  console.log("🔍 Analyzing product duplicates...\n");

  // 1. Get all products grouped by name
  const products = await prisma.product.findMany({
    include: {
      referencePrice: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      opportunities: {
        select: { id: true },
      },
      quotations: {
        select: { id: true },
      },
    },
    orderBy: { name: "asc" },
  });

  // Group by name to find duplicates
  const productsByName = new Map<string, typeof products>();

  products.forEach((product) => {
    const existing = productsByName.get(product.name) || [];
    existing.push(product);
    productsByName.set(product.name, existing);
  });

  // Report duplicates
  console.log("📊 DUPLICATE PRODUCTS REPORT\n");
  console.log("=" .repeat(80));

  let totalDuplicates = 0;

  productsByName.forEach((prods, name) => {
    if (prods.length > 1) {
      totalDuplicates++;
      console.log(`\n🔴 DUPLICATE: ${name} (${prods.length} entries)`);
      console.log("-".repeat(80));

      prods.forEach((p) => {
        console.log(`\n  ID: ${p.id}`);
        console.log(`  Category: ${p.category}`);
        console.log(`  Created: ${p.createdAt.toISOString()}`);
        console.log(`  Reference Price: ${
          p.referencePrice.length > 0
            ? `${p.referencePrice[0].pricePerTon} ${p.referencePrice[0].currency}`
            : "❌ MISSING"
        }`);
        console.log(`  Opportunities: ${p.opportunities.length}`);
        console.log(`  Quotations: ${p.quotations.length}`);
      });

      console.log("\n");
    }
  });

  if (totalDuplicates === 0) {
    console.log("\n✅ No duplicate products found!");
  } else {
    console.log("\n" + "=".repeat(80));
    console.log(`\n⚠️  Total duplicate product names: ${totalDuplicates}`);
  }

  // 2. Show all products summary
  console.log("\n\n📋 ALL PRODUCTS SUMMARY\n");
  console.log("=".repeat(80));

  products.forEach((p) => {
    const hasRef = p.referencePrice.length > 0 ? "✅" : "❌";
    console.log(
      `${hasRef} ID:${p.id.toString().padStart(3)} | ${p.name.padEnd(20)} | ` +
      `Opps:${p.opportunities.length.toString().padStart(3)} | ` +
      `Quotes:${p.quotations.length.toString().padStart(3)} | ` +
      `Ref: ${p.referencePrice.length > 0 ? p.referencePrice[0].pricePerTon : "N/A"}`
    );
  });

  await prisma.$disconnect();
}

analyzeDuplicates().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
