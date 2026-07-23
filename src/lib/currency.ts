/**
 * Currency — single source of truth for deal-value formatting and
 * the currency picker options.
 *
 * Before this module, ~6 components each defined their own
 * `Intl.NumberFormat(..., { currency: "USD" })` helper with USD
 * baked in. The default currency is now configurable per account
 * (accounts.default_currency, migration 021), so every formatter
 * takes a currency and falls back to DEFAULT_CURRENCY only when
 * nothing is known.
 */

/** App-wide fallback when no account/deal currency is available. */
export const DEFAULT_CURRENCY = "BRL";

export interface CurrencyOption {
  /** ISO-4217 code, e.g. "BRL". Stored verbatim in the DB. */
  code: string;
  /** Human label for the dropdown, e.g. "Real Brasileiro". */
  label: string;
  /** Symbol for compact display, e.g. "R$". */
  symbol: string;
}

/**
 * The currencies offered in pickers. Default to BRL.
 */
export const CURRENCIES: CurrencyOption[] = [
  { code: "BRL", label: "Real Brasileiro", symbol: "R$" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
];

/**
 * Format a deal value as a currency string in pt-BR locale.
 */
export function formatCurrency(
  value: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const code = (currency || DEFAULT_CURRENCY).trim();
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code === "USD" || code === "EUR" ? code : "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `R$ ${new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
    }).format(amount)}`;
  }
}

/**
 * Compact currency for tight spaces:
 * "R$ 1.2M" / "R$ 34.5k" / "R$ 900".
 */
export function formatCurrencyShort(
  value: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const code = currency || DEFAULT_CURRENCY;
  const symbol = CURRENCIES.find((c) => c.code === code)?.symbol ?? "R$";
  const v = Number(value || 0);
  if (v >= 1_000_000) return `${symbol} ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${symbol} ${(v / 1_000).toFixed(1)}k`;
  return `${symbol} ${v.toFixed(0)}`;
}
