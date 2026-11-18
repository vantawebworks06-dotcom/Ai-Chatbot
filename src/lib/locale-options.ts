// Options for business localization fields. Businesses pick their own; the
// product has no built-in country assumptions.

export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "JPY", "CNY", "INR", "SGD", "HKD", "CHF", "SEK",
  "NOK", "DKK", "PLN", "BRL", "MXN", "ARS", "CLP", "COP", "ZAR", "NGN", "KES", "GHS", "EGP",
  "AED", "SAR", "TRY", "ILS", "KRW", "THB", "MYR", "IDR", "PHP", "VND", "JMD", "TTD", "BBD",
  "XCD", "BSD", "DOP",
] as const;

export function timezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}
