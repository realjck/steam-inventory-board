/** Steam market order book: lowest sell and highest buy order for one item. */
import { currencyCode } from "./currency.ts";

/** Prices in hundredths of the currency unit; currency is a Steam currency id. */
export type OrderBookPrices = { sell: number | null; buy: number | null; currency: number };

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

// Endpoint used by the redesigned market pages themselves (see README.md, "Steam data").
function orderBookUrl(marketHashName: string): string {
  const url = new URL("https://steamcommunity.com/market/orderbook");
  url.searchParams.set("q", "Load");
  url.searchParams.set("qp", JSON.stringify([753, marketHashName]));
  return url.toString();
}

const priceOrNull = (cents: number | undefined) => (cents && cents > 0 ? cents : null);

/** The currency is chosen by Steam (from the caller's location), so it is reported, not requested. */
export async function fetchOrderBook(marketHashName: string, fetchFn: FetchFn = fetch): Promise<OrderBookPrices> {
  const res = await fetchFn(orderBookUrl(marketHashName), { headers: { "x-valve-request-type": "queryAction" } });
  if (res.status === 429) throw new RateLimitError();
  if (!res.ok) throw new Error(`Order book request failed: HTTP ${res.status}`);

  const book = ((await res.json()) as OrderBookResponse).data;
  if (!book?.success || !book.data) throw new Error(`Steam returned no order book for ${marketHashName}`);
  const currency = book.data.eCurrency ?? 0;
  if (currencyCode(currency) === null) throw new Error(`Steam returned prices in unsupported currency ${currency}`);
  return { sell: priceOrNull(book.data.amtMinSellOrder), buy: priceOrNull(book.data.amtMaxBuyOrder), currency };
}
