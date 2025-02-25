import { PrismaClient } from "@prisma/client";

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Get transport rate per ton for a given distance
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
      return Number(transportRate.ratePerTon);
    }

    // 4. Final fallback to closest rate or default value
    const defaultRate = await prisma.transportRate.findFirst({
      orderBy: {
        kilometers: "asc",
      },
    });

    if (defaultRate) {
      return Number(defaultRate.ratePerTon);
    }

    // 5. Ultimate fallback
    return distance * 10; // Very basic fallback rate
  } catch (error) {
    console.error("Error getting transport rate:", error);
    throw new Error(
      `Failed to get transport rate: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
