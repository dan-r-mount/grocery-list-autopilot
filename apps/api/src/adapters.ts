import type {
  BasketRun,
  GroceryRetailer,
  ListItem,
  ListSource,
  Notifier,
  Preference,
  PreferenceStore,
  ProductCandidate,
  ShopContext,
} from "@gla/shared";
import { CompositeNotifier, ConsoleNotifier, NtfyNotifier } from "./notify/ntfy.js";

/** Seeded household list for Phase 0 / milk MVP demos. */
export class InMemoryListSource implements ListSource {
  constructor(private items: ListItem[]) {}

  async pullOpenItems(): Promise<ListItem[]> {
    return this.items.filter((i) => i.status === "open" || i.status === "needs_review");
  }
}

/**
 * Fixture catalogue so resolve/push demos work offline.
 * Replace with a real Sainsbury's HTTP client in Phase 1.
 */
export class DryRunSainsburys implements GroceryRetailer {
  private basket: string[] = [];

  constructor(
    private readonly catalogue: ProductCandidate[] = defaultMilkCatalogue(),
    private readonly writeEnabled = false,
  ) {}

  async search(query: string): Promise<ProductCandidate[]> {
    const q = query.toLowerCase();
    return this.catalogue.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sizeLabel?.toLowerCase().includes(q) ?? false),
    );
  }

  async addToBasket(productUid: string, qty: number): Promise<void> {
    if (!this.writeEnabled) {
      console.log(`[dry-run] would add ${qty}× ${productUid} to Sainsbury's basket`);
      return;
    }
    for (let i = 0; i < qty; i++) this.basket.push(productUid);
  }

  async getBasket() {
    return { itemCount: this.basket.length, productUids: [...this.basket] };
  }
}

export class MemoryPreferenceStore implements PreferenceStore {
  constructor(private prefs = new Map<string, Preference>()) {}

  async get(term: string): Promise<Preference | null> {
    return this.prefs.get(term) ?? null;
  }

  async recordConfirmation(
    term: string,
    productUid: string,
    qty: number,
    _context: ShopContext,
  ): Promise<void> {
    const existing = this.prefs.get(term);
    this.prefs.set(term, {
      termNormalized: term,
      productUid,
      defaultQty: qty,
      confirmations: (existing?.confirmations ?? 0) + 1,
      lastConfirmedAt: new Date().toISOString(),
    });
  }
}

export function defaultMilkCatalogue(): ProductCandidate[] {
  return [
    {
      productUid: "milk-4l-semi",
      sku: "MILK4LSEMI",
      name: "Sainsbury's British Semi-Skimmed Milk",
      sizeLabel: "4L",
      pricePence: 245,
    },
    {
      productUid: "milk-2l-semi",
      sku: "MILK2LSEMI",
      name: "Sainsbury's British Semi-Skimmed Milk",
      sizeLabel: "2L",
      pricePence: 145,
    },
    {
      productUid: "milk-1l-whole",
      sku: "MILK1LWHOLE",
      name: "Sainsbury's British Whole Milk",
      sizeLabel: "1L",
      pricePence: 95,
    },
  ];
}

export function seedMilkPreference(): Preference {
  return {
    termNormalized: "milk",
    productUid: "milk-4l-semi",
    defaultQty: 1,
    confirmations: 3,
    lastConfirmedAt: new Date().toISOString(),
  };
}

export function seedMilkItem(): ListItem {
  return {
    id: "item-milk-1",
    rawText: "milk",
    status: "open",
    source: "manual",
  };
}

export type AppServices = {
  list: ListSource;
  retailer: GroceryRetailer;
  prefs: PreferenceStore;
  notifier: Notifier;
  runs: BasketRun[];
};

export async function createDefaultServices(): Promise<AppServices> {
  const prefs = new MemoryPreferenceStore(
    new Map([["milk", seedMilkPreference()]]),
  );
  return {
    list: new InMemoryListSource([seedMilkItem()]),
    retailer: new DryRunSainsburys(
      defaultMilkCatalogue(),
      process.env.SAINSBURYS_WRITE_ENABLED === "true",
    ),
    prefs,
    notifier: new CompositeNotifier([new ConsoleNotifier(), new NtfyNotifier()]),
    runs: [],
  };
}
