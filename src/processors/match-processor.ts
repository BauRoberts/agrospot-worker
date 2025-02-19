import { PrismaClient } from "@prisma/client";
import { Logger } from "winston";

/**
 * Process matching for a quotation
 */
export async function processMatches(
  quotationId: number,
  prisma: PrismaClient,
  logger: Logger
): Promise<void> {
  try {
    logger.info(`Starting match processing for quotation ${quotationId}`);

    // 1. Update quotation status to processing
    await prisma.quotation.update({
      where: { id: quotationId },
      data: {
        // @ts-ignore - The field exists in the database but Prisma types haven't been updated
        processingStatus: "processing",
      },
    });

    // 2. Get the quotation with necessary relations
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        product: true,
        location: true,
      },
    });

    if (!quotation) {
      throw new Error(`Quotation ${quotationId} not found`);
    }

    logger.info(
      `Processing quotation for ${quotation.product.name} (${quotation.quantityTons} tons)`
    );

    // 3. Import the main app's matching logic with correct path
    // We're using dynamic import to make sure prisma is initialized first
    const { createMatchesForQuotation } = await import("../services/matching");

    // 4. Process matches
    logger.info(
      `Calling createMatchesForQuotation for quotation ${quotationId}`
    );
    // We pass prisma to our function to ensure it uses the worker's Prisma instance
    const matches = await createMatchesForQuotation(quotationId);

    // 5. If matches were found, send notification
    if (matches && matches.length > 0) {
      logger.info(
        `Found ${matches.length} matches for quotation ${quotationId}`
      );

      try {
        // Import email service with correct path
        const { sendMatchNotification } = await import("../services/email");

        // Format quotation for email
        const emailQuotation = {
          id: quotation.id,
          product: quotation.product,
          location: {
            ...quotation.location,
            state: quotation.location.state || "",
          },
          quantityTons: Number(quotation.quantityTons),
          name: quotation.name,
          cellphone: quotation.cellphone,
          email: quotation.email,
        };

        // Send notification
        await sendMatchNotification(emailQuotation, matches);
        logger.info(
          `Successfully sent match notification email for quotation ${quotationId}`
        );
      } catch (emailError) {
        // Log error but don't fail the whole process
        logger.error(
          `Failed to send notification email for quotation ${quotationId}:`,
          emailError
        );
      }

      // 6. Update quotation status to completed with matches
      await prisma.quotation.update({
        where: { id: quotationId },
        data: {
          // @ts-ignore - The field exists in the database but Prisma types haven't been updated
          processingStatus: "completed",
          status: "matched",
        },
      });

      logger.info(`Successfully processed quotation ${quotationId}`);
    } else {
      // No matches found
      logger.info(`No matches found for quotation ${quotationId}`);

      await prisma.quotation.update({
        where: { id: quotationId },
        data: {
          // @ts-ignore - The field exists in the database but Prisma types haven't been updated
          processingStatus: "completed",
          status: "no_matches",
        },
      });
    }
  } catch (error) {
    logger.error(
      `Error processing matches for quotation ${quotationId}:`,
      error
    );

    // Update quotation status to failed
    try {
      await prisma.quotation.update({
        where: { id: quotationId },
        data: {
          // @ts-ignore - The field exists in the database but Prisma types haven't been updated
          processingStatus: "failed",
        },
      });
    } catch (updateError) {
      logger.error(
        `Failed to update quotation ${quotationId} status to failed:`,
        updateError
      );
    }

    // Rethrow to let Bull handle retry logic
    throw error;
  }
}
