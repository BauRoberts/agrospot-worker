// agrospot-worker/src/processors/match-processor.ts
// Updated with special offers support
import { Decimal } from "@prisma/client/runtime/library";
import { routingService, RoutingService } from "../services/routing-service";
import { getTransportRate } from "../services/transport-service";
import { getExchangeRate } from "../services/currency-service";
import { prisma } from "../lib/prisma";

const COMMISSION_RATE = 0.01;
const BATCH_SIZE = 10;
const SPECIAL_OFFER_SCORE_BONUS = 1000; // Bonus points for special offers

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
  exchangeRateUsed?: number | null;
  isSpecialOffer?: boolean; // NEW: Track if this match is from a special offer
}

interface OpportunityWithRelations {
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
  isSpecialOffer: boolean;
  companyId: number | null;
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
  quotation: QuotationWithRelations,
  exchangeRate: number // NEW: Pass exchange rate as parameter instead of fetching it
): Promise<MatchResult | null> {
  try {
    console.log(
      `Starting match calculation for opportunity ${
        opportunity.id
      } with quotation ${quotation.id}${
        opportunity.isSpecialOffer ? " [SPECIAL OFFER]" : ""
      }`
    );

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
      isSpecialOffer: opportunity.isSpecialOffer,
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
          isSpecialOffer: opportunity.isSpecialOffer,
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

      // NEW: Calculate score with special offer bonus
      let score = profitability;
      if (opportunity.isSpecialOffer) {
        score = profitability + SPECIAL_OFFER_SCORE_BONUS;
        console.log(
          `🔥 Special offer detected! Adding ${SPECIAL_OFFER_SCORE_BONUS} bonus points to score`
        );
      }

      console.log("Match calculations completed:", {
        opportunityId: opportunity.id,
        commission,
        profitability,
        score,
        transportationCost,
        pricePerTon,
        paymentOptionId: paymentOption.id,
        exchangeRate: opportunity.currency === "USD" ? exchangeRate : null,
        isSpecialOffer: opportunity.isSpecialOffer,
      });

      const matchResult: MatchResult = {
        opportunity,
        route: routeResponse,
        distance: distanceKm,
        score, // NEW: Updated score with special offer bonus
        profitability,
        transportationCost,
        bestPaymentOptionId: paymentOption.id,
        commission: commission * Number(quotation.quantityTons),
        profitabilityVsReference: 0,
        exchangeRateUsed: opportunity.currency === "USD" ? exchangeRate : null,
        isSpecialOffer: opportunity.isSpecialOffer, // NEW: Track special offer status
      };

      console.log(
        `Successfully created match result for opportunity ${opportunity.id}${
          opportunity.isSpecialOffer ? " [SPECIAL OFFER]" : ""
        }`
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
    isSpecialOffer: false, // Rosario reference is never a special offer
    companyId: null,
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

  // Count special offers for logging
  const specialOfferCount = realMatches.filter(
    (match) => match.isSpecialOffer
  ).length;
  console.log(
    `🔥 ${specialOfferCount} special offers found out of ${realMatches.length} total matches`
  );

  const matchPromises = realMatches.map(async (match) => {
    const exchangeRate = match.exchangeRateUsed;

    if (exchangeRate) {
      console.log(
        `Exchange rate for match with opportunity ${match.opportunity.id}: ${exchangeRate}`
      );
    }

    // OPTIMIZATION #3: Find the correct payment option by bestPaymentOptionId
    const selectedPaymentOption = match.opportunity.paymentOptions.find(
      (po) => po.id === match.bestPaymentOptionId
    );

    if (!selectedPaymentOption) {
      console.error(
        `Payment option ${match.bestPaymentOptionId} not found for opportunity ${match.opportunity.id}`
      );
      throw new Error(
        `Payment option ${match.bestPaymentOptionId} not found`
      );
    }

    const pricePerTon = Number(selectedPaymentOption.pricePerTon || 0);
    const totalAmount = pricePerTon * Number(match.opportunity.quantityTons || 0);

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
      pricePerTon: safeDecimal(pricePerTon),
      transportCost: safeDecimal(match.transportationCost),
      totalAmount: safeDecimal(totalAmount),
    };

    try {
      // OPTIMIZATION #4: Only select id instead of including all relations
      // We don't use the returned data, so no need to fetch ~10KB per match
      const savedMatch = await prisma.match.create({
        data: matchData,
        select: { id: true },
      });

      if (match.isSpecialOffer) {
        console.log(
          `🔥 Saved special offer match for opportunity ${match.opportunity.id}`
        );
      }

      return savedMatch;
    } catch (error) {
      console.error(
        `Failed to save match for opportunity ${match.opportunity.id}:`,
        error
      );
      throw error;
    }
  });

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
      // NEW: Order by special offers first
      orderBy: [
        { isSpecialOffer: "desc" }, // Special offers first
        { createdAt: "desc" }, // Then by creation date
      ],
    }),
    createRosarioOpportunity(quotation as QuotationWithRelations),
  ]);

  // Log special offers found
  const specialOfferOpportunities = opportunities.filter(
    (opp) => opp.isSpecialOffer
  );
  console.log(
    `🔥 Found ${specialOfferOpportunities.length} special offer opportunities out of ${opportunities.length} total opportunities`
  );

  if (rosarioOpportunity) {
    opportunities.push(rosarioOpportunity);
  }

  // OPTIMIZATION: Fetch exchange rate ONCE for all opportunities instead of per opportunity
  const exchangeRate = await getExchangeRate();
  console.log(`🚀 Using single exchange rate for all matches: ${exchangeRate} ARS/USD`);

  const matches: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
    const batch = opportunities.slice(i, i + BATCH_SIZE);
    const batchMatches = await Promise.all(
      batch.map((opportunity: any) =>
        calculateMatchData(
          opportunity as OpportunityWithRelations,
          quotation as QuotationWithRelations,
          exchangeRate // NEW: Pass exchange rate as parameter
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

  // NEW: Sort matches by score (special offers will naturally be first due to bonus)
  const sortedMatches = matches.sort((a, b) => b.score - a.score);

  console.log(`🔥 Final match order: Special offers prioritized in results`);

  // Return sorted matches for email notification
  return sortedMatches;
}
