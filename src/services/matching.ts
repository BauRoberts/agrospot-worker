// agrospot-worker/src/processors/matching-processor.ts
import { PrismaClient } from "@prisma/client";
// Import Decimal from the runtime library instead
import { Decimal } from "@prisma/client/runtime/library";
import { routingService, RoutingService } from "../services/routing-service";
import { getTransportRate } from "../services/transport-service";
import { convertCurrency, getExchangeRate } from "../services/currency-service";

// Use the global Prisma instance or create a new one if needed
const prisma = new PrismaClient();

const COMMISSION_RATE = 0.01;
const BATCH_SIZE = 10;

type BaseLocation = {
  id: number;
  city: string;
  state: string | null;
  country: string;
  latitude: number;
  longitude: number;
  placeId: string;
  createdAt: Date;
  updatedAt: Date;
};

type BaseProduct = {
  id: number;
  name: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
};

type BasePaymentOption = {
  id: number;
  opportunityId: number;
  pricePerTon: Decimal | null;
  paymentTermDays: number;
  createdAt: Date;
  updatedAt: Date;
  isReferenceBased: boolean;
  referenceDiff: Decimal | null;
  referenceDiffType: string;
  referenceDiffCurrency: string;
};

type BaseOpportunity = {
  id: number;
  productId: number;
  quantityTons: Decimal | null;
  status: string;
  locationId: number;
  name: string;
  cellphone: string;
  email: string;
  quality: string | null;
  transportationCostPerKm: Decimal;
  marketType: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  expirationDate: Date | null;
  userId: string | null;
};

const ROSARIO_LOCATION: BaseLocation = {
  id: -1,
  city: "Rosario",
  state: "Santa Fe",
  country: "Argentina",
  latitude: -32.9595,
  longitude: -60.6393,
  placeId: "rosario-reference",
  createdAt: new Date(),
  updatedAt: new Date(),
};

interface MatchResult {
  opportunity: OpportunityWithRelations;
  distance: number;
  score: number;
  profitability: number;
  transportationCost: number;
  bestPaymentOptionId: number;
  commission: number;
  route: {
    distance: number;
    duration: number;
    geometry?: string;
  };
  profitabilityVsReference: number;
  routeId?: number;
  exchangeRateUsed?: number | null; // Added to track the exchange rate used
}

interface OpportunityWithRelations extends BaseOpportunity {
  location: BaseLocation;
  product: BaseProduct;
  paymentOptions: BasePaymentOption[];
}

interface QuotationWithRelations {
  id: number;
  productId: number;
  quantityTons: Decimal;
  location: BaseLocation;
  product: BaseProduct;
}

// Helper function to create safe decimal values
function safeDecimal(value: number, precision: number = 2): Decimal {
  const MAX_VALUE = 99999999.99;
  return new Decimal(Math.min(Math.abs(value), MAX_VALUE).toFixed(precision));
}

async function calculateMatchData(
  opportunity: OpportunityWithRelations,
  quotation: QuotationWithRelations
): Promise<MatchResult | null> {
  try {
    console.log(
      `Starting match calculation for opportunity ${opportunity.id} with quotation ${quotation.id}`
    );

    // Fetch the exchange rate at the beginning of calculation
    // to ensure consistent currency handling throughout this match
    const exchangeRate = await getExchangeRate();
    console.log(`Using exchange rate for calculation: ${exchangeRate} ARS/USD`);

    // Get route information
    console.log(
      `Fetching route from ${quotation.location.city} to ${opportunity.location.city}`
    );
    const routeResponse = await routingService.getRoute(
      quotation.location,
      opportunity.id === -1 ? ROSARIO_LOCATION : opportunity.location
    );

    console.log("Route data:", {
      opportunityId: opportunity.id,
      distance: routeResponse.distance,
      duration: routeResponse.duration,
      hasGeometry: !!routeResponse.geometry,
    });

    const distanceKm = RoutingService.metersToKm(routeResponse.distance);
    console.log(`Distance calculated: ${distanceKm}km`);

    // Get transport rate
    let ratePerTon;
    try {
      ratePerTon = await getTransportRate(distanceKm);
      console.log(`Transport rate retrieved: ${ratePerTon} per ton`);
    } catch (error) {
      console.error(
        `Failed to get transport rate for distance ${distanceKm}km:`,
        error
      );
      return null;
    }

    // Calculate transportation costs
    const transportationCost = ratePerTon * Number(quotation.quantityTons);
    const transportCostPerTon =
      transportationCost / Number(quotation.quantityTons);

    console.log("Transportation costs calculated:", {
      ratePerTon,
      totalCost: transportationCost,
      costPerTon: transportCostPerTon,
    });

    // Process payment options
    for (const paymentOption of opportunity.paymentOptions) {
      if (!paymentOption.pricePerTon) {
        console.log(
          `Skipping payment option ${paymentOption.id} - no price per ton`
        );
        continue;
      }

      let pricePerTon;
      try {
        // Convert price to ARS if needed, using our fetched exchange rate
        if (opportunity.currency === "USD") {
          console.log(
            `Converting price from USD to ARS for opportunity ${opportunity.id}`
          );

          // Use the exchange rate we already fetched
          pricePerTon = Number(paymentOption.pricePerTon) * exchangeRate;

          console.log(
            `Converted price: ${Number(
              paymentOption.pricePerTon
            )} USD → ${pricePerTon} ARS (rate: ${exchangeRate})`
          );
        } else {
          pricePerTon = Number(paymentOption.pricePerTon);
        }

        console.log("Price information:", {
          originalPrice: paymentOption.pricePerTon,
          convertedPrice: pricePerTon,
          currency: opportunity.currency,
        });
      } catch (error) {
        console.error(
          `Failed to convert currency for opportunity ${opportunity.id}:`,
          error
        );
        continue;
      }

      // Calculate final values
      const commission = pricePerTon * COMMISSION_RATE;
      const profitability = pricePerTon - transportCostPerTon - commission;

      console.log("Match calculations completed:", {
        opportunityId: opportunity.id,
        commission,
        profitability,
        transportationCost,
        pricePerTon,
        paymentOptionId: paymentOption.id,
        exchangeRate: opportunity.currency === "USD" ? exchangeRate : null,
      });

      const matchResult: MatchResult = {
        opportunity,
        route: routeResponse,
        distance: distanceKm,
        score: profitability,
        profitability,
        transportationCost,
        bestPaymentOptionId: paymentOption.id,
        commission: commission * Number(quotation.quantityTons),
        profitabilityVsReference: 0,
        exchangeRateUsed: opportunity.currency === "USD" ? exchangeRate : null,
      };

      console.log(
        `Successfully created match result for opportunity ${opportunity.id}`
      );
      return matchResult;
    }

    console.log(
      `No valid payment options found for opportunity ${opportunity.id}`
    );
    return null;
  } catch (error) {
    console.error(
      `Failed to calculate match for opportunity ${opportunity.id}:`,
      error
    );
    if (error instanceof Error) {
      console.error("Error stack:", error.stack);
    }
    return null;
  }
}

async function createRosarioOpportunity(
  quotation: QuotationWithRelations
): Promise<OpportunityWithRelations | null> {
  const referencePrice = await prisma.referencePrice.findFirst({
    where: { productId: quotation.productId },
    orderBy: { createdAt: "desc" },
  });

  if (!referencePrice) return null;

  return {
    id: -1,
    productId: quotation.productId,
    quantityTons: quotation.quantityTons,
    status: "active",
    locationId: -1,
    name: "Rosario Reference",
    cellphone: "",
    email: "",
    quality: "Export",
    transportationCostPerKm: new Decimal(0),
    marketType: "Export",
    currency: "ARS",
    location: ROSARIO_LOCATION,
    product: quotation.product,
    paymentOptions: [
      {
        id: -1,
        opportunityId: -1,
        pricePerTon: referencePrice.pricePerTon,
        paymentTermDays: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        isReferenceBased: true,
        referenceDiff: new Decimal(0),
        referenceDiffType: "fixed",
        referenceDiffCurrency: "ARS",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    expirationDate: null,
    userId: null,
  };
}

async function saveMatchesToDatabase(
  quotationId: number,
  matches: MatchResult[]
) {
  // Filter out Rosario reference match (id: -1) before saving
  const realMatches = matches.filter((match) => match.opportunity.id > 0);

  console.log(
    `Saving ${realMatches.length} matches to database (excluding Rosario reference)`
  );

  const matchPromises = realMatches.map(async (match) => {
    // Store the exchange rate in a variable but don't use it in the Prisma query yet
    // until the schema is updated
    const exchangeRate = match.exchangeRateUsed;

    // Log the exchange rate for debugging
    if (exchangeRate) {
      console.log(
        `Exchange rate for match with opportunity ${match.opportunity.id}: ${exchangeRate}`
      );
    }

    const matchData = {
      quotation: {
        connect: { id: quotationId },
      },
      opportunity: {
        connect: { id: match.opportunity.id },
      },
      paymentOption: {
        connect: { id: match.bestPaymentOptionId },
      },
      matchScore: safeDecimal(match.score),
      commission: safeDecimal(match.commission),
      profitability: safeDecimal(match.profitability),
      transportationCost: safeDecimal(match.transportationCost),
      profitabilityVsReference: safeDecimal(match.profitabilityVsReference),
      pricePerTon: safeDecimal(
        Number(match.opportunity.paymentOptions[0].pricePerTon || 0)
      ),
      transportCost: safeDecimal(match.transportationCost),
      totalAmount: safeDecimal(
        Number(match.opportunity.paymentOptions[0].pricePerTon || 0) *
          Number(match.opportunity.quantityTons || 0)
      ),
      // Remove this line until the schema is updated
      // exchangeRateUsed: match.exchangeRateUsed ? safeDecimal(match.exchangeRateUsed) : null,
    };

    try {
      return await prisma.match.create({
        data: matchData,
        include: {
          opportunity: {
            include: {
              location: true,
              product: true,
              paymentOptions: true,
            },
          },
          paymentOption: true,
          quotation: {
            include: {
              location: true,
              product: true,
            },
          },
        },
      });
    } catch (error) {
      console.error(
        `Failed to save match for opportunity ${match.opportunity.id}:`,
        error
      );
      throw error;
    }
  });

  // We still want to use Promise.all to save all matches concurrently
  return Promise.all(matchPromises);
}

export async function createMatchesForQuotation(quotationId: number) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { location: true, product: true },
  });

  if (!quotation) return [];

  const [opportunities, rosarioOpportunity] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        productId: quotation.productId,
        status: "active",
      },
      include: {
        location: true,
        product: true,
        paymentOptions: true,
      },
    }),
    createRosarioOpportunity(quotation as QuotationWithRelations),
  ]);

  if (rosarioOpportunity) {
    opportunities.push(rosarioOpportunity);
  }

  const matches: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
    const batch = opportunities.slice(i, i + BATCH_SIZE);
    const batchMatches = await Promise.all(
      batch.map((opportunity: any) =>
        calculateMatchData(
          opportunity as OpportunityWithRelations,
          quotation as QuotationWithRelations
        )
      )
    );

    matches.push(
      ...batchMatches.filter((match): match is MatchResult => match !== null)
    );
  }

  // Save only real matches to database
  if (matches.length > 0) {
    try {
      const savedMatches = await saveMatchesToDatabase(quotationId, matches);
      console.log(
        `Successfully saved ${savedMatches.length} matches for quotation ${quotationId}`
      );
    } catch (error) {
      console.error(
        `Error saving matches for quotation ${quotationId}:`,
        error
      );
    }
  }

  // Return all matches (including Rosario) for email notification
  return matches;
}
