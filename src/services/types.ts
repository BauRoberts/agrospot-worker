// agrospot-worker/src/services/types.ts
// Fixed version with proper Decimal support
import { Decimal } from "@prisma/client/runtime/library";

// Define a helper type to handle Prisma's Decimal type
export type PrismaDecimal = Decimal;
export type NumberLike = number | string | PrismaDecimal | null;

export interface Location {
  id: number;
  city: string;
  state: string | null;
  country: string;
  latitude: number;
  longitude: number;
  placeId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Product {
  id: number;
  name: string;
  category?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaymentOption {
  id: number;
  opportunityId: number;
  pricePerTon: NumberLike;
  paymentTermDays: number;
  isReferenceBased?: boolean;
  referenceDiff?: NumberLike;
  referenceDiffType?: string;
  referenceDiffCurrency?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Opportunity {
  id: number;
  productId?: number;
  product: Product;
  quantityTons: NumberLike;
  status: string;
  locationId: number;
  name: string;
  cellphone: string;
  email: string;
  quality?: string | null;
  marketType: string;
  currency: string;
  location: Location;
  paymentOptions: PaymentOption[];
  createdAt?: Date;
  updatedAt?: Date;
  expirationDate?: Date | null;
  userId?: string | null;
}

export interface Route {
  distance: number;
  duration: number;
  geometry?: string;
}

export interface Match {
  opportunity: Opportunity;
  distance: number;
  score: number;
  profitability: number;
  transportationCost: number;
  bestPaymentOptionId: number;
  commission: number;
  route: Route;
  profitabilityVsReference: number;
  routeId?: number;
  exchangeRateUsed?: number | null;
}

export interface Quotation {
  id: number;
  product: Product;
  quantityTons: NumberLike;
  location: Location;
  name: string;
  cellphone: string;
  email: string;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Helper function to safely convert any number-like value to a JavaScript number
export function toNumber(value: NumberLike): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return parseFloat(value) || 0;
  }

  // Handle Prisma Decimal objects
  try {
    return Number(value.toString());
  } catch (e) {
    console.error("Error converting value to number:", e);
    return 0;
  }
}
