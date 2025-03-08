import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDER_EMAIL = "info@agrospot.com.ar";

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || "development";
const EMAIL_ENABLED = process.env.EMAIL_ENABLED !== "false";

// Get recipient emails based on environment
function getRecipientEmails(): string[] {
  if (NODE_ENV === "production") {
    return (
      process.env.PROD_RECIPIENT_EMAILS ||
      "bautistaroberts@gmail.com,santiagogarciacastellanos@gmail.com"
    )
      .split(",")
      .filter(Boolean);
  } else if (process.env.USE_STAGING_EMAILS === "true") {
    return (
      process.env.STAGING_RECIPIENT_EMAILS ||
      "bautistaroberts@gmail.com,santiagogarciacastellanos@gmail.com"
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

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatReferencePrice(match: any, matches: any[]): string {
  const rosarioMatch = matches.find((m) => m.opportunity.id === -1);
  if (!rosarioMatch) return "-";

  const referencePrice = Number(
    rosarioMatch.opportunity.paymentOptions[0].pricePerTon
  );
  return `${formatCurrency(
    referencePrice,
    rosarioMatch.opportunity.currency
  )}/tn`;
}

function formatPriceDiscount(match: any): string {
  const paymentOption = match.opportunity.paymentOptions[0];

  if (!paymentOption.isReferenceBased) {
    return "";
  }

  if (paymentOption.referenceDiffType === "percentage") {
    return `${paymentOption.referenceDiff}%`;
  }

  const amount = Number(paymentOption.referenceDiff);
  return `${formatCurrency(amount, paymentOption.referenceDiffCurrency)} ${
    paymentOption.referenceDiffCurrency
  }`;
}

function formatDistance(meters: number): string {
  return `${Math.round(meters / 1000)}`;
}

function calculateRosarioDifference(
  match: any,
  matches: any[],
  quotation: any
): string {
  const rosarioMatch = matches.find((m) => m.opportunity.id === -1);
  if (!rosarioMatch) return "-";

  const paymentOption = match.opportunity.paymentOptions[0];
  const rosarioPaymentOption = rosarioMatch.opportunity.paymentOptions[0];

  const matchFinalPrice =
    Number(paymentOption.pricePerTon) -
    match.transportationCost / Number(quotation.quantityTons);
  const rosarioFinalPrice =
    Number(rosarioPaymentOption.pricePerTon) -
    rosarioMatch.transportationCost / Number(quotation.quantityTons);

  const difference = matchFinalPrice - rosarioFinalPrice;
  return formatCurrency(difference, match.opportunity.currency);
}

function generateTableRowHTML(
  match: any,
  isReferencePrice: boolean = false,
  quotation: any,
  matches: any[]
): string {
  const opportunity = match.opportunity;
  const paymentOption = opportunity.paymentOptions[0];
  const transportCostPerTon =
    match.transportationCost / Number(quotation.quantityTons);
  const commissionPerTon = match.commission / Number(quotation.quantityTons);
  const finalPricePerTon =
    Number(paymentOption.pricePerTon) - transportCostPerTon - commissionPerTon;

  return `
    <tr style="${
      isReferencePrice
        ? "background-color: #94B0AB; color: white;"
        : "background-color: white;"
    } border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px; text-align: left; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${
        opportunity.location.city
      }</td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${formatReferencePrice(
        match,
        matches
      )}</td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${formatPriceDiscount(
        match
      )}</td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${formatCurrency(
        Number(paymentOption.pricePerTon),
        opportunity.currency
      )}</td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${formatDistance(
        match.route.distance
      )}</td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${formatCurrency(
        transportCostPerTon,
        opportunity.currency
      )}</td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${formatCurrency(
        commissionPerTon,
        opportunity.currency
      )}</td>
      <td style="padding: 12px; text-align: right; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${
        paymentOption.paymentTermDays
      }</td>
      <td style="padding: 12px; text-align: right; font-weight: bold; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${formatCurrency(
        finalPricePerTon,
        opportunity.currency
      )}</td>
      <td style="padding: 12px; text-align: right; font-weight: bold; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">${calculateRosarioDifference(
        match,
        matches,
        quotation
      )}</td>
    </tr>
  `;
}

function generateEmailHTML(quotation: any, matches: any[]): string {
  const sortedMatches = [...matches]
    .filter((match) => {
      if (match.opportunity.id === -1) return true; // Keep Rosario
      const difference = calculateRosarioDifference(match, matches, quotation);
      return (
        difference !== "-" &&
        parseFloat(difference.replace(/[^0-9.-]+/g, "")) > 0
      );
    })
    .sort((a, b) => b.profitability - a.profitability);

  // Add environment banner for non-production environments
  const environmentBanner =
    NODE_ENV !== "production"
      ? `<div style="background-color: #f44336; color: white; padding: 10px; text-align: center; margin-bottom: 20px; font-family: Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif;">
        <strong>⚠️ ${NODE_ENV.toUpperCase()} ENVIRONMENT ⚠️</strong> - This is a test email from the ${NODE_ENV} environment
      </div>`
      : "";

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
            Para tu cotización de ${quotation.product.name} de ${
    quotation.quantityTons
  } toneladas encontramos estas oportunidades comerciales en el mercado local.
          </p>
        </div>

        <!-- Table -->
        <div style="overflow-x: auto; background-color: white; border-radius: 16px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; min-width: 800px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: left;">Ubicación</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Precio Ref.</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Descuento Flete</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Precio</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Distancia (km)</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Precio Flete</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Comisión</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Plazo de pago</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Precio final TN</th>
                <th style="padding: 16px; font-weight: 600; color: #374151; text-align: right;">Dif. vs Rosario</th>
              </tr>
            </thead>
            <tbody>
              ${sortedMatches
                .map((match) =>
                  generateTableRowHTML(
                    match,
                    match.opportunity.id === -1,
                    quotation,
                    sortedMatches
                  )
                )
                .join("")}
            </tbody>
          </table>
        </div>
        
        <!-- Dollar Rate Footer -->
        <div style="text-align: right; margin-top: 20px; font-size: 12px; color: #6B7280;">
          <p>Tipo de cambio utilizado: ${
            process.env.USD_TO_ARS_RATE || 1000
          } ARS/USD</p>
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

    // Add environment indicator to subject for non-production environments
    const subjectPrefix =
      NODE_ENV !== "production" ? `[${NODE_ENV.toUpperCase()}] ` : "";

    const msg = {
      to: recipientEmails,
      from: { email: SENDER_EMAIL, name: "Agrospot" },
      subject: `${subjectPrefix}Agrospot: Cotización de ${quotation.quantityTons}tn en ${quotation.location.city}`,
      html: generateEmailHTML(quotation, validMatches),
    };

    console.log(
      `Sending email notification in ${NODE_ENV} environment to: ${recipientEmails.join(
        ", "
      )}`
    );

    if (!SENDGRID_API_KEY) {
      console.error("SENDGRID_API_KEY is not set, cannot send email");
      return false;
    }

    await sgMail.send(msg);
    console.log("Email sent successfully to all recipients");
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
