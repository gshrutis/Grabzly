/**
 * Money formatting helper. HappyHour uses Indian Rupees (₹) by default.
 */
export function formatMoney(amount: number | null | undefined, opts: { withDecimals?: boolean } = {}): string {
  const { withDecimals = true } = opts;
  if (amount === null || amount === undefined || isNaN(Number(amount))) return "₹0";
  const num = Number(amount);
  if (withDecimals) return `₹${num.toFixed(2)}`;
  return `₹${Math.round(num)}`;
}
