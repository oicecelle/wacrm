/**
 * WhatsApp label colours: the API uses an index 0–19 (`color`) and
 * documents the matching hex for each (`colorHex` in the Label schema).
 */
export const WA_LABEL_COLORS = [
  "#ff9484", "#64c4ff", "#fed428", "#dfaef0", "#9ab6c1",
  "#56ccb4", "#fe9dfe", "#d3a91f", "#6f7bcf", "#d8e651",
  "#01d0e2", "#ffc5c7", "#92ceac", "#f64847", "#00a1f2",
  "#83e421", "#ffae04", "#b4ebff", "#9ba6ff", "#9568cf",
] as const;

const FALLBACK = "#9ab6c1";

export function waLabelColor(index: number | null | undefined): string {
  return typeof index === "number" && index >= 0 && index < WA_LABEL_COLORS.length
    ? WA_LABEL_COLORS[index]
    : FALLBACK;
}
