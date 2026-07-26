export type ItemStatus =
  | "open"
  | "resolved"
  | "pushed"
  | "done"
  | "skipped"
  | "needs_review";

export type ListSourceKind = "manual" | "keep" | "import";

export interface ListItem {
  id: string;
  rawText: string;
  status: ItemStatus;
  source: ListSourceKind;
  externalId?: string;
}

export interface ProductCandidate {
  productUid: string;
  sku: string;
  name: string;
  sizeLabel?: string;
  pricePence?: number;
  imageUrl?: string;
}

export interface Preference {
  termNormalized: string;
  productUid: string;
  defaultQty: number;
  confirmations: number;
  lastConfirmedAt?: string;
}

export type ResolutionReason =
  | "exact_preference"
  | "size_match"
  | "search_rank"
  | "needs_review";

export interface Resolution {
  itemId: string;
  termNormalized: string;
  chosen: ProductCandidate;
  qty: number;
  confidence: number;
  reason: ResolutionReason;
}

export type BasketRunStatus =
  | "dry_run"
  | "partial"
  | "pushed"
  | "failed"
  | "awaiting_signoff";

export interface BasketRunLine {
  itemId: string;
  rawText: string;
  productUid: string;
  productName: string;
  qty: number;
  confidence: number;
  result: "would_add" | "added" | "held" | "failed";
  error?: string;
}

export interface BasketRun {
  id: string;
  scheduledFor: string;
  startedAt: string;
  finishedAt?: string;
  status: BasketRunStatus;
  lines: BasketRunLine[];
  notification?: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  runId: string;
}

export interface ShopContext {
  kind: "main" | "top_up" | "unknown";
  daysSinceLastShop?: number;
}

export interface ListSource {
  pullOpenItems(): Promise<ListItem[]>;
  markDone?(externalId: string): Promise<void>;
}

export interface GroceryRetailer {
  search(query: string): Promise<ProductCandidate[]>;
  addToBasket(productUid: string, qty: number): Promise<void>;
  getBasket(): Promise<{ itemCount: number; productUids: string[] }>;
}

export interface Notifier {
  notify(message: NotificationPayload): Promise<void>;
}

export interface PreferenceStore {
  get(term: string): Promise<Preference | null>;
  recordConfirmation(
    term: string,
    productUid: string,
    qty: number,
    context: ShopContext,
  ): Promise<void>;
}

export function normalizeTerm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a free-text list item to a retailer product using preferences first.
 * Kept pure so API and tests share one algorithm.
 */
export function resolveItem(
  item: ListItem,
  candidates: ProductCandidate[],
  preference: Preference | null,
  confidenceThreshold = 0.8,
): Resolution {
  const termNormalized = normalizeTerm(item.rawText);

  if (!candidates.length) {
    throw new Error(`No product candidates for "${item.rawText}"`);
  }

  if (preference) {
    const match = candidates.find((c) => c.productUid === preference.productUid);
    if (match) {
      return {
        itemId: item.id,
        termNormalized,
        chosen: match,
        qty: preference.defaultQty,
        confidence: Math.min(0.95, 0.7 + preference.confirmations * 0.05),
        reason: "exact_preference",
      };
    }
  }

  const preferredSize = extractSizeHint(preference, candidates);
  if (preferredSize) {
    const sizeMatch = candidates.find((c) =>
      (c.sizeLabel ?? c.name).toLowerCase().includes(preferredSize),
    );
    if (sizeMatch) {
      return {
        itemId: item.id,
        termNormalized,
        chosen: sizeMatch,
        qty: preference?.defaultQty ?? 1,
        confidence: 0.7,
        reason: "size_match",
      };
    }
  }

  const top = candidates[0]!;
  const confidence = 0.4;
  return {
    itemId: item.id,
    termNormalized,
    chosen: top,
    qty: preference?.defaultQty ?? 1,
    confidence,
    reason: confidence >= confidenceThreshold ? "search_rank" : "needs_review",
  };
}

function extractSizeHint(
  preference: Preference | null,
  candidates: ProductCandidate[],
): string | null {
  if (!preference) return null;
  const preferred = candidates.find((c) => c.productUid === preference.productUid);
  if (!preferred?.sizeLabel) return null;
  const m = preferred.sizeLabel.toLowerCase().match(/\d+(?:\.\d+)?\s*l/);
  return m?.[0] ?? null;
}

export function shouldAutoAdd(resolution: Resolution, threshold = 0.8): boolean {
  return resolution.confidence >= threshold && resolution.reason !== "needs_review";
}
