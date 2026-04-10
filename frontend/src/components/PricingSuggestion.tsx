import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { DollarSign, Loader2, TrendingUp } from "lucide-react";

interface EbayComp {
  title: string;
  sold_price: number;
  condition: string;
  sold_date: string;
}

interface PriceSuggestionResult {
  suggested_price_cad: number;
  pricechart_price: number | null;
  ebay_avg_price: number | null;
  ebay_comps: EbayComp[];
  reasoning: string;
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
      if (data.suggested_price_cad > 0) {
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
            <CardTitle className="text-sm">Price Research</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Sources */}
            <div className="grid grid-cols-2 gap-3">
              {result.pricechart_price !== null && (
                <div className="rounded-md bg-muted p-2.5">
                  <p className="text-xs text-muted-foreground">PriceCharting</p>
                  <p className="font-medium">
                    ${result.pricechart_price.toFixed(2)} CAD
                  </p>
                </div>
              )}
              {result.ebay_avg_price !== null && (
                <div className="rounded-md bg-muted p-2.5">
                  <p className="text-xs text-muted-foreground">eBay Avg Sold</p>
                  <p className="font-medium">
                    ${result.ebay_avg_price.toFixed(2)} CAD
                  </p>
                </div>
              )}
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
