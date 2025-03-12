// fix-quotation-status.ts
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

// Initialize Prisma client
const prisma = new PrismaClient();

async function fixQuotationStatus() {
  console.log("Starting quotation status fix script...");

  try {
    // Find quotations with 'processing' status
    const pendingQuotations = await prisma.quotation.findMany({
      where: {
        processingStatus: "pending",
      },
    });

    console.log(
      `Found ${pendingQuotations.length} quotations in 'processing' status`
    );

    if (pendingQuotations.length === 0) {
      console.log("No quotations need to be fixed.");
      return;
    }

    // Fix each quotation
    for (const quotation of pendingQuotations) {
      console.log(`Fixing quotation ${quotation.id}...`);

      // Check if this quotation has any matches
      const matchCount = await prisma.match.count({
        where: {
          quotationId: quotation.id,
        },
      });

      let newStatus = "no_matches";
      if (matchCount > 0) {
        newStatus = "matched";
        console.log(
          `Quotation ${quotation.id} has ${matchCount} matches, updating to 'matched'`
        );
      } else {
        console.log(
          `Quotation ${quotation.id} has no matches, updating to 'no_matches'`
        );
      }

      // Update the quotation status
      await prisma.quotation.update({
        where: {
          id: quotation.id,
        },
        data: {
          // @ts-ignore - The field exists in the database but Prisma types might not be updated
          processingStatus: "completed",
          status: newStatus,
        },
      });

      console.log(`Successfully updated quotation ${quotation.id}`);
    }

    console.log("Status fix completed successfully");
  } catch (error) {
    console.error("Error fixing quotation status:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
fixQuotationStatus()
  .then(() => console.log("Script completed"))
  .catch((error) => console.error("Script failed:", error));
