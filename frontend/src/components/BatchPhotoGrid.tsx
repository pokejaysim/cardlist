import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle, X, Sparkles } from "lucide-react";

export type BatchCardStatus =
  | "uploading"
  | "ready"
  | "identifying"
  | "identified"
  | "error";

export interface BatchCardResult {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  condition: string;
  card_game: string;
  confidence: number;
}

export interface BatchCard {
  id: string;
  preview_url: string;
  file_url: string | null;
  status: BatchCardStatus;
  result: BatchCardResult | null;
  price_cad?: string;
  error: string | null;
}

interface Props {
  cards: BatchCard[];
  onUpdateCard: (id: string, updates: Partial<BatchCard>) => void;
  onRemoveCard: (id: string) => void;
}

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;

export default function BatchPhotoGrid({ cards, onUpdateCard, onRemoveCard }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <CardTile
          key={card.id}
          card={card}
          onUpdateCard={onUpdateCard}
          onRemoveCard={onRemoveCard}
        />
      ))}
    </div>
  );
}

function CardTile({
  card,
  onUpdateCard,
  onRemoveCard,
}: {
  card: BatchCard;
  onUpdateCard: (id: string, updates: Partial<BatchCard>) => void;
  onRemoveCard: (id: string) => void;
}) {
  function updateResultField(field: keyof BatchCardResult, value: string) {
    if (!card.result) return;
    onUpdateCard(card.id, {
      result: { ...card.result, [field]: value },
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Photo */}
      <div className="relative aspect-[3/4] bg-muted">
        <img
          src={card.preview_url}
          alt="Card"
          className="size-full object-cover"
        />
        {/* Status overlay */}
        {card.status === "uploading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex flex-col items-center gap-1 text-white">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-xs">Uploading...</span>
            </div>
          </div>
        )}
        {card.status === "identifying" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex flex-col items-center gap-1 text-white">
              <Sparkles className="size-6 animate-pulse" />
              <span className="text-xs">Identifying...</span>
            </div>
          </div>
        )}
        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemoveCard(card.id)}
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
          title="Remove"
        >
          <X className="size-3.5" />
        </button>
        {/* Status badge */}
        {card.status === "identified" && card.result && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-xs font-medium text-primary-foreground">
            <CheckCircle2 className="size-3" />
            {Math.round(card.result.confidence * 100)}%
          </div>
        )}
        {card.status === "error" && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-destructive/90 px-2 py-0.5 text-xs font-medium text-destructive-foreground">
            <AlertCircle className="size-3" />
            Failed
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-3">
        {card.status === "identified" && card.result ? (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Card Name</Label>
              <Input
                value={card.result.card_name}
                onChange={(e) => updateResultField("card_name", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Set</Label>
                <Input
                  value={card.result.set_name}
                  onChange={(e) => updateResultField("set_name", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Number</Label>
                <Input
                  value={card.result.card_number}
                  onChange={(e) => updateResultField("card_number", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Rarity</Label>
                <Input
                  value={card.result.rarity}
                  onChange={(e) => updateResultField("rarity", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Condition</Label>
                <div className="flex gap-0.5">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateResultField("condition", c)}
                      className={`flex-1 rounded border px-1 py-1 text-xs font-medium transition ${
                        card.result?.condition === c
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-accent"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Price (CAD)</Label>
              <Input
                inputMode="decimal"
                value={card.price_cad ?? ""}
                onChange={(e) =>
                  onUpdateCard(card.id, { price_cad: e.target.value })
                }
                className="h-8 text-sm"
                placeholder="0.00"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Creates an eBay.ca draft with this photo attached. Empty prices
                stay blocked by publish readiness.
              </p>
            </div>
          </div>
        ) : card.status === "error" ? (
          <div className="text-sm">
            <p className="font-medium text-destructive">Could not process</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {card.error ?? "Unknown error"}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => onRemoveCard(card.id)}
            >
              Remove
            </Button>
          </div>
        ) : card.status === "ready" ? (
          <p className="text-xs text-muted-foreground">Ready to identify</p>
        ) : (
          <p className="text-xs text-muted-foreground">Processing...</p>
        )}
      </div>
    </div>
  );
}
