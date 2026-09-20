// Per-user sidebar ordering. Stored in localStorage — this is a
// personal display preference, not business data, so it doesn't need
// a database round-trip or to sync across devices; keeping it local
// also means it works even during a Supabase outage.
//
// Items are identified by a stable string key (an item's href, or its
// label for the one group with no href — "Marketing"). Storing keys
// rather than full item objects means a code change that adds,
// renames, or reorders items in sidebar.tsx doesn't break anyone's
// saved preference: unknown/new keys are simply appended at the end,
// in their original code-defined order.

const STORAGE_KEY = "sidebar_item_order_v1";
export const SIDEBAR_ORDER_CHANGED_EVENT = "sidebar-order-changed";

export function getSidebarOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function setSidebarOrder(order: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    window.dispatchEvent(new Event(SIDEBAR_ORDER_CHANGED_EVENT));
  } catch {
    // Storage can fail (private browsing, quota) — reordering just
    // won't persist this time, not worth surfacing an error for.
  }
}

export function resetSidebarOrder() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(SIDEBAR_ORDER_CHANGED_EVENT));
  } catch {
    // See setSidebarOrder.
  }
}

/**
 * Reorders `items` (each with a stable `key`) according to the saved
 * preference. Items with no saved position keep their original
 * relative order and are appended after the ones that do.
 */
export function applySidebarOrder<T extends { key: string }>(items: T[], savedOrder: string[]): T[] {
  if (savedOrder.length === 0) return items;
  const byKey = new Map(items.map((item) => [item.key, item]));
  const ordered: T[] = [];
  for (const key of savedOrder) {
    const item = byKey.get(key);
    if (item) {
      ordered.push(item);
      byKey.delete(key);
    }
  }
  // Whatever's left (new items not in the saved order yet) keeps its
  // original position among itself, appended at the end.
  for (const item of items) {
    if (byKey.has(item.key)) ordered.push(item);
  }
  return ordered;
}
