// src/services/whatsapp.ts
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

const KAPSO_API_KEY = process.env.KAPSO_API_KEY;
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID || "";
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === "true";
const WHATSAPP_NOTIFICATION_PHONES =
  process.env.WHATSAPP_NOTIFICATION_PHONES || "";

const client = KAPSO_API_KEY
  ? new WhatsAppClient({
      baseUrl: "https://api.kapso.ai/meta/whatsapp",
      kapsoApiKey: KAPSO_API_KEY,
    })
  : null;

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (!cleaned.startsWith("54")) cleaned = "54" + cleaned;
  return cleaned;
}

function getNotificationPhones(): string[] {
  return WHATSAPP_NOTIFICATION_PHONES.split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export async function sendQuotationNotification(
  quotation: any,
  matches: any[]
): Promise<void> {
  if (!WHATSAPP_ENABLED) {
    console.log("WhatsApp notifications disabled");
    return;
  }

  if (!client) {
    console.error("WhatsApp client not initialized - missing KAPSO_API_KEY");
    return;
  }

  // Filter profitable matches excluding Rosario reference (id < 0)
  const profitableMatches = matches
    .filter((m) => m.profitability > 0 && m.opportunity.id >= 0)
    .sort((a, b) => b.profitability - a.profitability)
    .slice(0, 3);

  if (profitableMatches.length === 0) {
    console.log("No profitable matches to notify via WhatsApp");
    return;
  }

  // Format matches text: "1. Ciudad $230k/tn (450km) • 2. ..."
  const matchesText = profitableMatches
    .map((m, i) => {
      const city = m.opportunity.location.city;
      const priceK = Math.round(m.profitability / 1000);
      const distance = Math.round(m.distance);
      return `${i + 1}. ${city} $${priceK}k/tn (${distance}km)`;
    })
    .join(" • ");

  // Send template to user if they have a cellphone
  if (quotation.cellphone) {
    try {
      const formattedPhone = formatPhoneNumber(quotation.cellphone);
      await client.messages.sendTemplate({
        phoneNumberId: KAPSO_PHONE_NUMBER_ID,
        to: formattedPhone,
        template: {
          name: "matches_disponibles2",
          language: { code: "es_AR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: quotation.name },
                { type: "text", text: profitableMatches.length.toString() },
                { type: "text", text: quotation.product.name },
                { type: "text", text: matchesText },
              ],
            },
          ],
        },
      });
      console.log(`WhatsApp template sent to user ${formattedPhone}`);
    } catch (error) {
      console.error(
        "Failed to send WhatsApp template to user:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Send internal text notification to the team
  const notificationPhones = getNotificationPhones();
  const NODE_ENV = process.env.NODE_ENV || "development";
  const envPrefix = NODE_ENV !== "production" ? `[${NODE_ENV}] ` : "";

  const internalMessage =
    `${envPrefix}🎯 *Matches Encontrados*\n\n` +
    `*Cliente:* ${quotation.name}\n` +
    `*Producto:* ${quotation.product.name}\n` +
    `*Cantidad:* ${quotation.quantityTons} tn\n` +
    `*Matches rentables:* ${profitableMatches.length}\n\n` +
    `*Top matches:*\n${matchesText}`;

  for (const phone of notificationPhones) {
    try {
      const formattedPhone = formatPhoneNumber(phone);
      await client.messages.sendText({
        phoneNumberId: KAPSO_PHONE_NUMBER_ID,
        to: formattedPhone,
        body: internalMessage,
      });
      console.log(`WhatsApp internal notification sent to ${formattedPhone}`);
    } catch (error) {
      console.error(
        `Failed to send WhatsApp internal notification to ${phone}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
