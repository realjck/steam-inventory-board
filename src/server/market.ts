/** Steam market order book: lowest sell and highest buy order for one item. */

export type OrderBookPrices = { sell: number | null; buy: number | null };

/** Steam answered HTTP 429: the caller should back off before retrying. */
export class RateLimitError extends Error {
  constructor() {
    super("Steam market rate limit reached (HTTP 429)");
    this.name = "RateLimitError";
  }
}

type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

type OrderBookResponse = {
  data?: {
    success?: boolean;
    data?: { eCurrency?: number; amtMinSellOrder?: number; amtMaxBuyOrder?: number };
  };
};

// Endpoint used by the redesigned market pages themselves (see SPEC.md, "Sources de données").
function orderBookUrl(marketHashName: string): string {
  const url = new URL("https://steamcommunity.com/market/orderbook");
  url.searchParams.set("q", "Load");
  url.searchParams.set("qp", JSON.stringify([753, marketHashName]));
  return url.toString();
}

const priceOrNull = (cents: number | undefined) => (cents && cents > 0 ? cents : null);

/** Prices are in cents; the currency is chosen by Steam, so it is checked, not requested. */
export async function fetchOrderBook(
  marketHashName: string,
  expectedCurrency: number,
  fetchFn: FetchFn = fetch,
): Promise<OrderBookPrices> {
  const res = await fetchFn(orderBookUrl(marketHashName), { headers: { "x-valve-request-type": "queryAction" } });
  if (res.status === 429) throw new RateLimitError();
  if (!res.ok) throw new Error(`Order book request failed: HTTP ${res.status}`);

  const book = ((await res.json()) as OrderBookResponse).data;
  if (!book?.success || !book.data) throw new Error(`Steam returned no order book for ${marketHashName}`);
  if (book.data.eCurrency !== expectedCurrency) {
    throw new Error(`Steam returned prices in currency ${book.data.eCurrency}, expected ${expectedCurrency}`);
  }
  return { sell: priceOrNull(book.data.amtMinSellOrder), buy: priceOrNull(book.data.amtMaxBuyOrder) };
}
