import { PrismaClient } from "@prisma/client";

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Convert amount from one currency to another
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  try {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    // Currently only supporting USD to ARS conversion
    if (fromCurrency === "USD" && toCurrency === "ARS") {
      const config = await prisma.systemConfig.findFirst({
        where: { id: 1 },
      });

      if (!config || !config.usdToArsRate) {
        // Fallback to environment variable or hardcoded value
        const rate = Number(process.env.USD_TO_ARS_RATE) || 1000;
        return amount * rate;
      }

      return amount * Number(config.usdToArsRate);
    }

    if (fromCurrency === "ARS" && toCurrency === "USD") {
      const config = await prisma.systemConfig.findFirst({
        where: { id: 1 },
      });

      if (!config || !config.usdToArsRate) {
        // Fallback to environment variable or hardcoded value
        const rate = Number(process.env.USD_TO_ARS_RATE) || 1000;
        return amount / rate;
      }

      return amount / Number(config.usdToArsRate);
    }

    throw new Error(
      `Conversion from ${fromCurrency} to ${toCurrency} not supported`
    );
  } catch (error) {
    console.error("Error converting currency:", error);
    throw new Error(
      `Failed to convert currency: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
