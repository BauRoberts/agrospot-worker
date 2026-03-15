//src/services/transport-service.ts
import { prisma } from "../lib/prisma";

// 10% discount applied to FETRA reference rates (Jan 2026)
const TRANSPORT_RATE_DISCOUNT = 0.10;

/**
 * Get transport rate per ton for a given distance
 * Applies a 10% discount to FETRA reference rates (Jan 2026)
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

    // 3. If no custom ranges apply, use the transport rates table
    // Use >= distance to get the closest rate at or above the actual distance
    const transportRate = await prisma.transportRate.findFirst({
      where: {
        kilometers: {
          gte: distance,
        },
      },
      orderBy: {
        kilometers: "asc",
      },
    });

    if (transportRate) {
      const baseRate = Number(transportRate.ratePerTon);
      return Math.round(baseRate * (1 - TRANSPORT_RATE_DISCOUNT) * 100) / 100;
    }

    // 4. Distance beyond table range — use the maximum rate
    const maxRate = await prisma.transportRate.findFirst({
      orderBy: {
        kilometers: "desc",
      },
    });

    if (maxRate) {
      const baseRate = Number(maxRate.ratePerTon);
      return Math.round(baseRate * (1 - TRANSPORT_RATE_DISCOUNT) * 100) / 100;
    }

    // 5. Ultimate fallback
    return Math.round(distance * 10 * (1 - TRANSPORT_RATE_DISCOUNT) * 100) / 100;
  } catch (error) {
    console.error("Error getting transport rate:", error);
    throw new Error(
      `Failed to get transport rate: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}