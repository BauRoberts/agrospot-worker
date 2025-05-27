//src/services/transport-service.ts
import { PrismaClient } from "@prisma/client";

// Initialize Prisma client
const prisma = new PrismaClient();

// Discount to apply to transport rates (15%)
const TRANSPORT_RATE_DISCOUNT = 0.15;

/**
 * Get transport rate per ton for a given distance
 * Applies a 15% discount to rates from the transport rates table
 */
export async function getTransportRate(distanceKm: number): Promise<number> {
  try {
    // Round up distance to nearest km
    const distance = Math.ceil(distanceKm);

    // 1. First, check if there's a custom price range that matches
    const priceRange = await prisma.transportPriceRange.findFirst({
      where: {
        minDistance: { lte: distance },
        maxDistance: { gte: distance },
      },
    });

    if (priceRange) {
      // Custom price ranges are returned without discount
      return Number(priceRange.ratePerTon);
    }

    // 2. If no exact range match, check if there's a range with a lower minDistance
    // that could apply (for distances beyond the defined ranges)
    const fallbackRange = await prisma.transportPriceRange.findFirst({
      where: {
        minDistance: { lte: distance },
      },
      orderBy: {
        maxDistance: "desc",
      },
    });

    if (fallbackRange) {
      // Custom price ranges are returned without discount
      return Number(fallbackRange.ratePerTon);
    }

    // 3. If no custom ranges apply, fall back to the existing table logic
    const transportRate = await prisma.transportRate.findFirst({
      where: {
        kilometers: {
          lte: distance,
        },
      },
      orderBy: {
        kilometers: "desc",
      },
    });

    if (transportRate) {
      // Apply 15% discount to the transport rate
      const baseRate = Number(transportRate.ratePerTon);
      const discountedRate = baseRate * (1 - TRANSPORT_RATE_DISCOUNT);
      
      // Round to 2 decimal places
      return Math.round(discountedRate * 100) / 100;
    }

    // 4. Final fallback to closest rate or default value
    const defaultRate = await prisma.transportRate.findFirst({
      orderBy: {
        kilometers: "asc",
      },
    });

    if (defaultRate) {
      // Apply 15% discount to the default rate
      const baseRate = Number(defaultRate.ratePerTon);
      const discountedRate = baseRate * (1 - TRANSPORT_RATE_DISCOUNT);
      
      // Round to 2 decimal places
      return Math.round(discountedRate * 100) / 100;
    }

    // 5. Ultimate fallback
    return distance * 10 * (1 - TRANSPORT_RATE_DISCOUNT); // Very basic fallback rate with discount
  } catch (error) {
    console.error("Error getting transport rate:", error);
    throw new Error(
      `Failed to get transport rate: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}