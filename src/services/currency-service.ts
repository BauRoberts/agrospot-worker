// agrospot-worker/src/services/currency-service.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Cache management
interface CacheItem {
  value: number;
  timestamp: number;
}

// In-memory cache with 5-minute expiration for the worker service
const rateCache: Record<string, CacheItem> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds for the worker

/**
 * Get the current USD to ARS exchange rate from the database
 */
export async function getExchangeRate(): Promise<number> {
  const cacheKey = "USD_TO_ARS_RATE";

  // Check if we have a valid cached rate
  const cachedRate = rateCache[cacheKey];
  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
    console.log("[Worker] Using cached exchange rate:", cachedRate.value);
    return cachedRate.value;
  }

  try {
    // Fetch rate from database (single source of truth)
    const settings = await prisma.systemConfig.findFirst({
      where: { id: 1 },
    });

    // Use settings or default to 1000 if no settings exist
    const rate = settings?.usdToArsRate ? Number(settings.usdToArsRate) : 1000;

    // Update cache
    rateCache[cacheKey] = {
      value: rate,
      timestamp: Date.now(),
    };

    console.log("[Worker] Fetched fresh exchange rate from database:", rate);
    return rate;
  } catch (error) {
    console.error("[Worker] Failed to get exchange rate from database:", error);

    // If we have an expired cache, use it rather than failing completely
    if (cachedRate) {
      console.log(
        "[Worker] Using expired cached exchange rate as fallback:",
        cachedRate.value
      );
      return cachedRate.value;
    }

    // Last resort fallback
    console.log("[Worker] Using default exchange rate (1000) as last resort");
    return 1000;
  }
}

/**
 * Convert an amount from one currency to another
 * Currently supports USD to ARS and ARS to USD conversion
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  console.log(
    `[Worker] Converting ${amount} from ${fromCurrency} to ${toCurrency}`
  );

  // Get the current exchange rate
  const rate = await getExchangeRate();
  console.log(`[Worker] Using exchange rate: ${rate} ARS/USD`);

  // USD to ARS conversion
  if (fromCurrency === "USD" && toCurrency === "ARS") {
    return amount * rate;
  }

  // ARS to USD conversion
  if (fromCurrency === "ARS" && toCurrency === "USD") {
    return amount / rate;
  }

  // If trying to convert between the same currency, return the original amount
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // Throw error for unsupported conversion pairs
  throw new Error(
    `[Worker] Currency conversion from ${fromCurrency} to ${toCurrency} is not supported`
  );
}
