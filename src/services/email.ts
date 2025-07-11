//src/services/email.ts
// Updated with special offers support
import sgMail from "@sendgrid/mail";
import { getExchangeRate } from "./currency-service";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDER_EMAIL = "info@agrospot.com.ar";

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || "development";
const EMAIL_ENABLED = process.env.EMAIL_ENABLED !== "false";

// Configure SendGrid client
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

// Get recipient emails based on environment
function getRecipientEmails(): string[] {
  if (NODE_ENV === "production") {
    return (
      process.env.PROD_RECIPIENT_EMAILS ||
      "bautistaroberts@gmail.com,santiagogarciacastellanos@gmail.com,felipe@agrospot.com.ar,santiago@agrospot.com.ar"
    )
      .split(",")
      .filter(Boolean);
  } else if (process.env.USE_STAGING_EMAILS === "true") {
    return (
      process.env.STAGING_RECIPIENT_EMAILS ||
      "bautistaroberts@gmail.com,santiagogarciacastellanos@gmail.com,felipe@agrospot.com.ar,santiago@agrospot.com.ar"
    )
      .split(",")
      .filter(Boolean);
  } else {
    // development, test, or any other environment
    return (process.env.DEV_RECIPIENT_EMAILS || "bautistaroberts@gmail.com")
      .split(",")
      .filter(Boolean);
  }
}

// Format currency - always in ARS regardless of original currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format original price with currency indicator
function formatOriginalPrice(
  amount: number,
  currency: string,
  exchangeRate: number
): string {
  if (currency === "USD") {
    // For USD, show both the original USD and converted ARS
    const formattedUSD = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);

    const arsAmount = amount * exchangeRate;
    return `${formattedUSD} (${formatCurrency(arsAmount)})`;
  } else {
    // For ARS, just show the ARS format
    return formatCurrency(amount);
  }
}

// This function handles any type of numerical input and converts it to a number
function toNumber(value: any): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return parseFloat(value) || 0;
  }

  // Handle any other type by converting to string first
  try {
    return Number(String(value)) || 0;
  } catch (e) {
    console.error("Error converting value to number:", e);
    return 0;
  }
}

function formatReferencePrice(match: any, matches: any[]): string {
  const rosarioMatch = matches.find((m) => m.opportunity.id === -1);
  if (!rosarioMatch) return "-";

  const referencePrice = toNumber(
    rosarioMatch.opportunity.paymentOptions[0].pricePerTon
  );
  return `${formatCurrency(referencePrice)}/tn`;
}

// Updated to handle both percentage and fixed amount adjustments
function formatPriceDiscount(match: any): string {
  const paymentOption = match.opportunity.paymentOptions[0];

  if (!paymentOption.isReferenceBased) {
    return ""; // No discount for fixed price
  }

  // Check the adjustment type
  if (paymentOption.referenceDiffType === "percentage") {
    // For percentage adjustments, format with % sign
    const adjustmentPercent = toNumber(paymentOption.referenceDiff);
    const sign = adjustmentPercent >= 0 ? "+" : ""; // Add + sign for positive adjustments
    return `${sign}${adjustmentPercent}%`;
  } else {
    // For fixed amount adjustments
    const amount = toNumber(paymentOption.referenceDiff);
    const sign = amount >= 0 ? "+" : ""; // Add + sign for positive adjustments

    // Show the currency with the fixed amount
    const currency =
      paymentOption.referenceDiffCurrency || match.opportunity.currency;

    if (currency === "USD") {
      return `${sign}USD ${Math.abs(amount)}`;
    } else {
      return `${sign}${formatCurrency(amount)}`;
    }
  }
}

function formatDistance(meters: number): string {
  return `${Math.round(meters / 1000)}`;
}

function calculateRosarioDifference(
  match: any,
  matches: any[],
  quotation: any,
  exchangeRate: number
): string {
  const rosarioMatch = matches.find((m) => m.opportunity.id === -1);
  if (!rosarioMatch) return "-";

  const paymentOption = match.opportunity.paymentOptions[0];
  const rosarioPaymentOption = rosarioMatch.opportunity.paymentOptions[0];

  // Get the exchange rate used for this match (if any)
  const exchangeRateToUse = match.exchangeRateUsed || exchangeRate;

  // Calculate the proper price based on currency
  let pricePerTonInARS = toNumber(paymentOption.pricePerTon);
  if (match.opportunity.currency === "USD") {
    // If the opportunity is in USD, multiply by exchange rate to get ARS equivalent
    pricePerTonInARS = pricePerTonInARS * exchangeRateToUse;
  }

  // Safely handle null quantityTons
  const quotationQuantity = toNumber(quotation.quantityTons);
  if (quotationQuantity === 0) return "-"; // Avoid division by zero

  const matchFinalPrice =
    pricePerTonInARS - match.transportationCost / quotationQuantity;

  const rosarioFinalPrice =
    toNumber(rosarioPaymentOption.pricePerTon) -
    rosarioMatch.transportationCost / quotationQuantity;

  const difference = matchFinalPrice - rosarioFinalPrice;

  // Add a plus sign for positive differences
  const sign = difference > 0 ? "+" : "";

  // Always return in ARS
  return `${sign}${formatCurrency(Math.abs(difference))}`;
}

// New function to calculate percentage difference with Rosario
function calculateRosarioDifferencePercentage(
  match: any,
  matches: any[],
  quotation: any,
  exchangeRate: number
): string {
  const rosarioMatch = matches.find((m) => m.opportunity.id === -1);
  if (!rosarioMatch) return "-";

  const paymentOption = match.opportunity.paymentOptions[0];
  const rosarioPaymentOption = rosarioMatch.opportunity.paymentOptions[0];

  // Get the exchange rate used for this match (if any)
  const exchangeRateToUse = match.exchangeRateUsed || exchangeRate;

  // Calculate the proper price based on currency
  let pricePerTonInARS = toNumber(paymentOption.pricePerTon);
  if (match.opportunity.currency === "USD") {
    // If the opportunity is in USD, multiply by exchange rate to get ARS equivalent
    pricePerTonInARS = pricePerTonInARS * exchangeRateToUse;
  }

  // Safely handle null quantityTons
  const quotationQuantity = toNumber(quotation.quantityTons);
  if (quotationQuantity === 0) return "-"; // Avoid division by zero

  const matchFinalPrice =
    pricePerTonInARS - match.transportationCost / quotationQuantity;

  const rosarioFinalPrice =
    toNumber(rosarioPaymentOption.pricePerTon) -
    rosarioMatch.transportationCost / quotationQuantity;

  // Avoid division by zero
  if (rosarioFinalPrice === 0) return "-";

  // Calculate percentage difference
  const percentageDiff =
    ((matchFinalPrice - rosarioFinalPrice) / rosarioFinalPrice) * 100;

  // Format to 2 decimal places
  const formattedPercentage = percentageDiff.toFixed(2);

  // Add a plus sign for positive differences
  const sign = percentageDiff > 0 ? "+" : "";

  return `${sign}${formattedPercentage}%`;
}

// NEW: Helper function to check if a match is a special offer
function isSpecialOffer(match: any): boolean {
  return (
    match.opportunity.is_special_offer === true || match.isSpecialOffer === true
  );
}

function generateTableRowHTML(
  match: any,
  isReferencePrice: boolean = false,
  quotation: any,
  matches: any[],
  exchangeRate: number
): string {
  const opportunity = match.opportunity;
  const paymentOption = opportunity.paymentOptions[0];

  // Safely handle null quantityTons
  const quotationQuantity = toNumber(quotation.quantityTons);
  if (quotationQuantity === 0) {
    // Handle the case where quantity is zero or null
    return `<tr><td colspan="11">Invalid quotation quantity</td></tr>`;
  }

  const transportCostPerTon = match.transportationCost / quotationQuantity;
  const commissionPerTon = match.commission / quotationQuantity;

  // Calculate the final price per ton in ARS
  let pricePerTonInARS = toNumber(paymentOption.pricePerTon);
  if (opportunity.currency === "USD") {
    pricePerTonInARS =
      pricePerTonInARS * (match.exchangeRateUsed || exchangeRate);
  }

  const finalPricePerTon =
    pricePerTonInARS - transportCostPerTon - commissionPerTon;

  // Original price display (includes currency indicator for USD)
  const priceDisplay = formatOriginalPrice(
    toNumber(paymentOption.pricePerTon),
    opportunity.currency,
    exchangeRate
  );

  // NEW: Determine background color and styling based on match type
  let backgroundColor = "white";
  let textColor = "inherit";
  let borderLeft = "";

  const isSpecial = isSpecialOffer(match);

  if (isReferencePrice) {
    backgroundColor = "#94B0AB";
    textColor = "white";
  } else if (isSpecial) {
    // 🔥 SPECIAL OFFER STYLING
    backgroundColor = "#fff8e1"; // Light golden background
    borderLeft = "4px solid #f59e0b"; // Golden left border
    textColor = "#92400e"; // Dark golden text
  } else if (paymentOption.isReferenceBased) {
    // Lighter background for reference-based prices
    backgroundColor = "#f0f7f6";
  }

  // Create a custom tag for fixed, reference, or special pricing
  let pricingTypeTag = "";
  if (isSpecial) {
    pricingTypeTag = `<span style="font-size: 10px; background-color: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-weight: bold;">🔥 ESPECIAL</span>`;
  } else if (paymentOption.isReferenceBased) {
    pricingTypeTag = `<span style="font-size: 10px; background-color: #e0f2f1; color: #00796b; padding: 2px 4px; border-radius: 4px; margin-left: 4px;">Ref</span>`;
  } else {
    pricingTypeTag = `<span style="font-size: 10px; background-color: #f0f4fa; color: #3b5998; padding: 2px 4px; border-radius: 4px; margin-left: 4px;">Fijo</span>`;
  }

  return `
    <tr style="background-color: ${backgroundColor}; color: ${textColor}; border-bottom: 1px solid #e5e7eb; ${
    borderLeft ? `border-left: ${borderLeft};` : ""
  }">
      <td style="padding: 12px; text-align: left; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${opportunity.location.city} 
        ${isReferencePrice ? "" : pricingTypeTag}
      </td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${formatReferencePrice(match, matches)}
      </td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${formatPriceDiscount(match)}
      </td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${priceDisplay}
      </td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${formatDistance(match.route.distance)}
      </td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${formatCurrency(transportCostPerTon)}
      </td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${formatCurrency(commissionPerTon)}
      </td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${paymentOption.paymentTermDays}
      </td>
      <td style="padding: 12px; text-align: right; font-weight: bold; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        ${formatCurrency(finalPricePerTon)}
      </td>
      <td style="padding: 12px; text-align: right; font-weight: bold; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif; 
        ${
          calculateRosarioDifference(
            match,
            matches,
            quotation,
            exchangeRate
          ).startsWith("+")
            ? "color: #0d9488;"
            : "color: #ef4444;"
        }">
        ${calculateRosarioDifference(match, matches, quotation, exchangeRate)}
      </td>
      <td style="padding: 12px; text-align: right; font-weight: bold; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif; 
        ${
          calculateRosarioDifferencePercentage(
            match,
            matches,
            quotation,
            exchangeRate
          ).startsWith("+")
            ? "color: #0d9488;"
            : "color: #ef4444;"
        }">
        ${calculateRosarioDifferencePercentage(
          match,
          matches,
          quotation,
          exchangeRate
        )}
      </td>
    </tr>
  `;
}

async function generateEmailHTML(
  quotation: any,
  matches: any[]
): Promise<string> {
  // Get the current exchange rate directly from the service
  const exchangeRate = await getExchangeRate();

  // First convert all values to ARS for filtering
  const matchesWithConvertedValues = matches.map((match) => {
    const clone = { ...match };

    // Convert profitability to ARS if needed
    if (match.opportunity.currency === "USD") {
      clone.profitability = match.profitability * exchangeRate;
    }

    return clone;
  });

  const sortedMatches = [...matchesWithConvertedValues]
    .filter((match) => {
      if (match.opportunity.id === -1) return true; // Keep Rosario

      // Calculate difference with Rosario entirely in ARS
      const rosarioMatch = matches.find((m) => m.opportunity.id === -1);
      if (!rosarioMatch) return false;

      const paymentOption = match.opportunity.paymentOptions[0];
      const rosarioPaymentOption = rosarioMatch.opportunity.paymentOptions[0];

      // Safely handle null values in quantityTons
      const quotationQuantity = toNumber(quotation.quantityTons);
      if (quotationQuantity === 0) return false; // Skip if quantity is zero or null

      // Convert to ARS if needed
      let pricePerTonInARS = toNumber(paymentOption.pricePerTon);
      if (match.opportunity.currency === "USD") {
        pricePerTonInARS = pricePerTonInARS * exchangeRate;
      }

      const matchFinalPrice =
        pricePerTonInARS - match.transportationCost / quotationQuantity;

      const rosarioFinalPrice =
        toNumber(rosarioPaymentOption.pricePerTon) -
        rosarioMatch.transportationCost / quotationQuantity;

      const difference = matchFinalPrice - rosarioFinalPrice;

      // Log the difference calculation
      console.log(
        `Difference vs Rosario for opportunity ${match.opportunity.id} (${
          match.opportunity.currency
        })${isSpecialOffer(match) ? " [SPECIAL OFFER]" : ""}: ${formatCurrency(
          difference
        )}`
      );

      return difference > 0;
    })
    .sort((a, b) => {
      // NEW: Sort with special offers first, then by profitability
      const aIsSpecial = isSpecialOffer(a);
      const bIsSpecial = isSpecialOffer(b);

      if (aIsSpecial && !bIsSpecial) return -1; // a (special) comes first
      if (!aIsSpecial && bIsSpecial) return 1; // b (special) comes first

      // If both are special or both are regular, sort by profitability
      return b.profitability - a.profitability;
    });

  // Count special offers for logging
  const specialOfferCount = sortedMatches.filter(isSpecialOffer).length;
  console.log(
    `🔥 Email will show ${specialOfferCount} special offers out of ${sortedMatches.length} total matches`
  );

  // Map back to original matches for rendering
  const originalSortedMatches = sortedMatches
    .map((sortedMatch) =>
      matches.find((m) => m.opportunity.id === sortedMatch.opportunity.id)
    )
    .filter((m) => m !== undefined) as any[];

  // NEW: Check if we have special offers for email subject
  const hasSpecialOffers = originalSortedMatches.some(isSpecialOffer);

  // Add environment banner for non-production environments
  const environmentBanner =
    NODE_ENV !== "production"
      ? `<div style="background-color: #f44336; color: white; padding: 10px; text-align: center; margin-bottom: 20px; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        <strong>⚠️ ${NODE_ENV.toUpperCase()} ENVIRONMENT ⚠️</strong> - This is a test email from the ${NODE_ENV} environment
      </div>`
      : "";

  // NEW: Special offers banner
  const specialOffersBanner = hasSpecialOffers
    ? `<div style="background-color: #f59e0b; color: white; padding: 15px; text-align: center; margin-bottom: 20px; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif; border-radius: 8px;">
        <strong>🔥 ¡OFERTAS ESPECIALES DISPONIBLES! 🔥</strong><br>
        <span style="font-size: 14px;">Encontramos ofertas especiales para tu cotización - ¡No te las pierdas!</span>
      </div>`
    : "";

  // Safe handling for quantityTons that might be null
  const quotationTons = toNumber(quotation.quantityTons);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 40px 20px; background-color: #f9fafb; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
      <div style="max-width: 900px; margin: 0 auto;">
        ${environmentBanner}
        ${specialOffersBanner}
        
        <!-- Logo -->
        <div style="text-align: center; margin-bottom: 40px;">
          <img src="https://framerusercontent.com/images/CTGwFZoDEoDJHfm98YY4qFDzjU.png" alt="Agrospot" style="width: 200px; height: auto;">
        </div>
        
        <!-- Thank you message -->
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="font-size: 20px;color: #4B5563; margin: 0 0 20px 0; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">¡Gracias ${
            quotation.name
          } por llenar tu cotización!</h1>
          <p style="font-size: 12px; color: #4B5563; margin: 0; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
            Para tu cotización de ${
              quotation.product.name
            } de ${quotationTons} toneladas encontramos estas oportunidades comerciales en el mercado local.
          </p>
        </div>

        <!-- Price Legend -->
        <div style="margin-bottom: 20px; font-size: 12px; color: #4B5563;">
          <div style="display: inline-block; margin-right: 15px;">
            <span style="font-size: 10px; background-color: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; margin-right: 4px; font-weight: bold;">🔥 ESPECIAL</span>
            <span>Oferta especial del día</span>
          </div>
          <div style="display: inline-block; margin-right: 15px;">
            <span style="font-size: 10px; background-color: #e0f2f1; color: #00796b; padding: 2px 4px; border-radius: 4px; margin-right: 4px;">Ref</span>
            <span>Precio basado en referencia</span>
          </div>
          <div style="display: inline-block;">
            <span style="font-size: 10px; background-color: #f0f4fa; color: #3b5998; padding: 2px 4px; border-radius: 4px; margin-right: 4px;">Fijo</span>
            <span>Precio fijo</span>
          </div>
        </div>

        <!-- Table -->
        <div style="overflow-x: auto; background-color: white; border-radius: 16px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; min-width: 800px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: left;">Ubicación</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Precio Ref.</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Ajuste</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Precio</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Distancia (km)</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Precio Flete</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Comisión</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Plazo de pago</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Precio final TN</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Dif. vs Rosario</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Dif. % vs Rosario</th>
              </tr>
            </thead>
            <tbody>
              ${originalSortedMatches
                .map((match) =>
                  generateTableRowHTML(
                    match,
                    match.opportunity.id === -1,
                    quotation,
                    originalSortedMatches,
                    exchangeRate
                  )
                )
                .join("")}
            </tbody>
          </table>
        </div>
        
        <!-- Exchange Rate Footer -->
        <div style="text-align: right; margin-top: 20px; font-size: 12px; color: #6B7280;">
          <p>Tipo de cambio utilizado: ${formatCurrency(exchangeRate)}/USD</p>
        </div>
        
        <!-- Contact Info Footer -->
        <div style="text-align: right; margin-top: 20px; font-size: 12px; color: #6B7280;">
          <p>Nombre: ${quotation.name}</p>
          <p>Email: ${quotation.email}</p>
          <p>Numero: ${quotation.cellphone}</p>
        </div>
        
        ${
          NODE_ENV !== "production"
            ? `<!-- Environment Debug Info -->
        <div style="margin-top: 30px; padding: 10px; background-color: #f0f0f0; border: 1px solid #ddd; font-size: 10px; color: #666;">
          <p>Environment: ${NODE_ENV}</p>
          <p>Notification Recipients: ${getRecipientEmails().join(", ")}</p>
          <p>Generated: ${new Date().toISOString()}</p>
          <p>Exchange Rate: ${exchangeRate}</p>
          <p>Special Offers: ${specialOfferCount}</p>
        </div>`
            : ""
        }
      </div>
    </body>
    </html>
  `;
}

export async function sendMatchNotification(quotation: any, matches: any[]) {
  try {
    // Skip sending email if disabled in environment
    if (!EMAIL_ENABLED) {
      console.log(`Email notifications disabled in ${NODE_ENV} environment`);
      return;
    }

    if (!matches?.length) {
      console.log("No matches found, skipping email");
      return;
    }

    const validMatches = matches.filter(
      (match) => match?.opportunity?.product && match?.opportunity?.location
    );

    if (!validMatches.length) {
      console.log("No valid matches found, skipping email");
      return;
    }

    // Get recipient emails based on environment
    const recipientEmails = getRecipientEmails();

    // NEW: Check if we have special offers for email subject
    const hasSpecialOffers = validMatches.some(isSpecialOffer);
    const specialOfferPrefix = hasSpecialOffers ? "🔥 " : "";

    // Add environment indicator to subject for non-production environments
    const subjectPrefix =
      NODE_ENV !== "production" ? `[${NODE_ENV.toUpperCase()}] ` : "";

    // Create two separate email objects - one for admin recipients and one for the quotation submitter
    // Email for admin recipients
    const adminEmailMsg = {
      to: recipientEmails,
      from: { email: SENDER_EMAIL, name: "Agrospot" },
      subject: `${subjectPrefix}${specialOfferPrefix}Agrospot: Cotización de ${toNumber(
        quotation.quantityTons
      )}tn en ${quotation.location.city}`,
      html: await generateEmailHTML(quotation, validMatches),
    };

    // Email for the quotation submitter
    // Only send to the quotation submitter if they provided an email address
    const userEmailMsg = quotation.email
      ? {
          to: [{ email: quotation.email }],
          from: { email: SENDER_EMAIL, name: "Agrospot" },
          subject: `${subjectPrefix}${specialOfferPrefix}Agrospot: Tu cotización de ${toNumber(
            quotation.quantityTons
          )}tn en ${quotation.location.city}`,
          html: await generateEmailHTML(quotation, validMatches),
        }
      : null;

    console.log(
      `Sending email notification in ${NODE_ENV} environment to admins: ${recipientEmails.join(
        ", "
      )}${hasSpecialOffers ? " [WITH SPECIAL OFFERS]" : ""}`
    );

    if (userEmailMsg) {
      console.log(
        `Also sending email notification to quotation submitter: ${
          quotation.email
        }${hasSpecialOffers ? " [WITH SPECIAL OFFERS]" : ""}`
      );
    }

    if (!SENDGRID_API_KEY) {
      console.error("SENDGRID_API_KEY is not set, cannot send email");
      return false;
    }

    // Send emails to admin recipients
    await sgMail.send(adminEmailMsg);
    console.log("Email sent successfully to admin recipients");

    // Send email to quotation submitter if they provided an email
    if (userEmailMsg) {
      await sgMail.send(userEmailMsg);
      console.log("Email sent successfully to quotation submitter");
    }

    return true;
  } catch (error: any) {
    console.error(
      "Failed to send email:",
      error.response?.body?.errors || error.message
    );
    throw error;
  }
}

export default sendMatchNotification;
