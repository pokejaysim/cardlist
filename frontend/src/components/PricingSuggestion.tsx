import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { DollarSign, Loader2, TrendingUp, AlertTriangle, Info } from "lucide-react";

interface EbayComp {
  title: string;
  sold_price: number;
  condition: string;
  sold_date: string;
}

type SourceStatus =
  | { state: "ok" }
  | { state: "no_key" }
  | { state: "api_error"; message: string }
  | { state: "not_found"; query: string };

interface PriceSuggestionResult {
  suggested_price_cad: number | null;
  pricechart_price: number | null;
  ebay_avg_price: number | null;
  ebay_comps: EbayComp[];
  reasoning: string;
  sources?: {
    pricecharting: SourceStatus;
    ebay: SourceStatus;
    fx_rate_usd_to_cad: number;
    condition_applied: string;
  };
}

interface PricingSuggestionProps {
  cardName: string;
  setName: string | null;
  condition: string | null;
  listingId?: string;
  price: string;
  onPriceChange: (price: string) => void;
}

export function PricingSuggestion({
  cardName,
  setName,
  condition,
  listingId,
  price,
  onPriceChange,
}: PricingSuggestionProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceSuggestionResult | null>(null);
  const [error, setError] = useState("");

  async function fetchSuggestion() {
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch<PriceSuggestionResult>("/pricing/suggest", {
        method: "POST",
        body: JSON.stringify({
          card_name: cardName,
          set_name: setName,
          condition,
          listing_id: listingId,
        }),
      });

      setResult(data);
      if (data.suggested_price_cad !== null && data.suggested_price_cad > 0) {
        onPriceChange(data.suggested_price_cad.toFixed(2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get pricing");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="price">Price (CAD)</Label>
          <div className="relative">
            <DollarSign className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <Button
          variant="outline"
          onClick={fetchSuggestion}
          disabled={loading || !cardName}
        >
          {loading ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <TrendingUp className="mr-1.5 size-4" />
          )}
          {loading ? "Researching..." : "Get Price Suggestion"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Price Research</span>
              {result.sources?.condition_applied && (
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {result.sources.condition_applied} adjusted
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Admin-visible banner when pricing sources aren't configured.
                This is the most likely cause of an empty price research card
                — surface it loudly instead of making the user guess. */}
            {result.sources?.pricecharting.state === "no_key" &&
              result.sources.ebay.state === "no_key" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 p-2.5 text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">Pricing sources not configured</p>
                    <p className="text-xs">
                      Neither PriceCharting nor eBay is reachable — add
                      <code className="mx-1 rounded bg-amber-100 px-1">PRICECHARTING_API_KEY</code>
                      and
                      <code className="mx-1 rounded bg-amber-100 px-1">EBAY_APP_ID</code>
                      in Railway, then redeploy.
                    </p>
                  </div>
                </div>
              )}

            {/* Per-source status — only shown when at least one is ok so the
                user can see which source contributed vs which one missed. */}
            <div className="grid grid-cols-2 gap-3">
              <SourceTile
                label="PriceCharting"
                priceCad={result.pricechart_price}
                status={result.sources?.pricecharting}
              />
              <SourceTile
                label="eBay Avg Sold"
                priceCad={result.ebay_avg_price}
                status={result.sources?.ebay}
              />
            </div>

            {/* Reasoning */}
            <p className="text-muted-foreground">{result.reasoning}</p>

            {/* Comps */}
            {result.ebay_comps.length > 0 && (
              <div>
                <p className="mb-1.5 font-medium">Recent eBay Sales</p>
                <div className="space-y-1">
                  {result.ebay_comps.slice(0, 5).map((comp, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate pr-2 text-muted-foreground">
                        {comp.title}
                      </span>
                      <span className="shrink-0 font-medium">
                        ${comp.sold_price.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Renders a single price source (PriceCharting or eBay). If the source had
 * a price, shows it. Otherwise shows a compact, source-specific reason so
 * the user can tell "no data" from "not configured" from "temporary error".
 */
function SourceTile({
  label,
  priceCad,
  status,
}: {
  label: string;
  priceCad: number | null;
  status: SourceStatus | undefined;
}) {
  if (priceCad !== null) {
    return (
      <div className="rounded-md bg-muted p-2.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">${priceCad.toFixed(2)} CAD</p>
      </div>
    );
  }

  // No price — explain why.
  const { text, tone } = describeStatus(status);
  const toneClass =
    tone === "error"
      ? "border-destructive/30 text-destructive"
      : tone === "warn"
        ? "border-amber-500/30 text-amber-900 bg-amber-50"
        : "border-muted text-muted-foreground";

  return (
    <div className={`rounded-md border p-2.5 ${toneClass}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="flex items-start gap-1.5 text-xs font-medium">
        <Info className="mt-0.5 size-3 shrink-0" />
        <span>{text}</span>
      </p>
    </div>
  );
}

function describeStatus(
  status: SourceStatus | undefined,
): { text: string; tone: "neutral" | "warn" | "error" } {
  if (!status) return { text: "Unavailable", tone: "neutral" };
  switch (status.state) {
    case "ok":
      // Source returned ok but no usable price (e.g. eBay comps were all in
      // unsupported currencies). Rare, fall back to neutral.
      return { text: "No usable price", tone: "neutral" };
    case "no_key":
      return { text: "Not configured", tone: "warn" };
    case "api_error":
      return { text: "Temporary error", tone: "error" };
    case "not_found":
      return { text: "No match found", tone: "neutral" };
  }
}
