// agrospot-worker/src/processors/match-processor.ts
// This is the solution to the TypeScript error you're experiencing

import { PrismaClient } from "@prisma/client";
import { Match, Quotation, NumberLike, toNumber } from "../services/types";
import { createMatchesForQuotation } from "../services/matching";
import sendMatchNotification from "../services/email";

const prisma = new PrismaClient();

// Make sure the types being used in both files are the same
// The issue is with NumberLike vs string | number | null

export async function processMatches(quotationId: number): Promise<boolean> {
  try {
    console.log(`Processing matches for quotation ${quotationId}`);

    // Update the quotation status to 'processing'
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: "processing" },
    });

    // Get the quotation with included relations
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        location: true,
        product: true,
      },
    });

    if (!quotation) {
      console.error(`Quotation ${quotationId} not found`);
      return false;
    }

    console.log(
      `Processing quotation for ${quotation.product.name} (${quotation.quantityTons} tons)`
    );

    // Calculate matches
    console.log(
      `Calling createMatchesForQuotation for quotation ${quotationId}`
    );
    const matches = await createMatchesForQuotation(quotationId);

    // Convert matches to the expected format
    const matchesForEmail = matches.map((match) => {
      // Deep clone the match with all needed properties
      const convertedMatch: Match = {
        opportunity: {
          id: match.opportunity.id,
          // If productId is present in match.opportunity, use it, otherwise use opportunity.product.id
          productId:
            match.opportunity.productId || match.opportunity.product.id,
          product: match.opportunity.product,
          // Convert quantityTons to string to ensure compatibility
          quantityTons: match.opportunity.quantityTons
            ? String(match.opportunity.quantityTons)
            : "0",
          status: match.opportunity.status,
          locationId: match.opportunity.locationId,
          name: match.opportunity.name,
          cellphone: match.opportunity.cellphone,
          email: match.opportunity.email,
          quality: match.opportunity.quality,
          marketType: match.opportunity.marketType,
          currency: match.opportunity.currency,
          location: match.opportunity.location,
          // Convert paymentOptions
          paymentOptions: match.opportunity.paymentOptions.map((po) => ({
            id: po.id,
            opportunityId: po.opportunityId,
            // Convert pricePerTon to string
            pricePerTon: po.pricePerTon ? String(po.pricePerTon) : "0",
            paymentTermDays: po.paymentTermDays,
            isReferenceBased: po.isReferenceBased,
            referenceDiff: po.referenceDiff ? String(po.referenceDiff) : null,
            referenceDiffType: po.referenceDiffType,
            referenceDiffCurrency: po.referenceDiffCurrency,
          })),
        },
        distance: match.distance,
        score: match.score,
        profitability: match.profitability,
        transportationCost: match.transportationCost,
        bestPaymentOptionId: match.bestPaymentOptionId,
        commission: match.commission,
        route: match.route,
        profitabilityVsReference: match.profitabilityVsReference,
        routeId: match.routeId,
        exchangeRateUsed: match.exchangeRateUsed,
      };

      return convertedMatch;
    });

    console.log(
      `Found ${matchesForEmail.length} matches for quotation ${quotationId}`
    );

    // Convert the quotation for email to fix the type error
    // Make sure to convert to string to avoid Decimal issues
    const quotationForEmail: Quotation = {
      id: quotation.id,
      product: quotation.product,
      // Convert to string explicitly
      quantityTons: String(quotation.quantityTons),
      location: quotation.location,
      name: quotation.name,
      cellphone: quotation.cellphone,
      email: quotation.email,
      status: quotation.status,
    };

    // Send email notification
    const emailSent = await sendMatchNotification(
      quotationForEmail,
      matchesForEmail
    );

    if (emailSent) {
      console.log(
        `Successfully sent match notification email for quotation ${quotationId}`
      );
    } else {
      console.warn(
        `Email notification was not sent for quotation ${quotationId}`
      );
    }

    // Update the quotation status to 'completed'
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: "completed" },
    });

    console.log(`Successfully processed quotation ${quotationId}`);
    return true;
  } catch (error) {
    console.error(
      `Error processing matches for quotation ${quotationId}:`,
      error
    );

    // Update the quotation status to 'failed'
    try {
      await prisma.quotation.update({
        where: { id: quotationId },
        data: { status: "failed" },
      });
    } catch (updateError) {
      console.error(`Failed to update quotation status:`, updateError);
    }

    return false;
  }
}
