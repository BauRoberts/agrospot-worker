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

    // Apply fixed rates for distances >= 350 km
    if (distance >= 400) {
      return 33000; // Fixed rate for distances > 400 km
    } else if (distance >= 350) {
      return 26000; // Fixed rate for distances between 350-400 km
    }

    // For distances < 350 km, continue using the rate table
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
