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

    // Find closest transport rate
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

    // If no rate found, fallback to closest rate or default value
    const defaultRate = await prisma.transportRate.findFirst({
      orderBy: {
        kilometers: "asc",
      },
    });

    if (defaultRate) {
      return Number(defaultRate.ratePerTon);
    }

    // Ultimate fallback
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
