/**
 * Formats a phone number for WhatsApp (E.164, digits only).
 * Target format: 549 + area code (without leading 0) + local number
 * Examples:
 *   "0351 513-4266"       → "5493515134266"
 *   "+54 9 351 513 4266"  → "5493515134266"
 *   "54903515134266"      → "5493515134266"
 *   "5493515134266"       → "5493515134266"
 */
export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");

  if (cleaned.startsWith("549")) {
    // Already has country + mobile prefix, strip any leading 0 in area code
    const rest = cleaned.slice(3);
    return "549" + rest.replace(/^0/, "");
  }

  if (cleaned.startsWith("54")) {
    // Has country code but missing the 9, strip leading 0 in area code
    const rest = cleaned.slice(2);
    return "549" + rest.replace(/^0/, "");
  }

  // No country code — strip leading 0 (trunk prefix) if present
  return "549" + cleaned.replace(/^0/, "");
}
