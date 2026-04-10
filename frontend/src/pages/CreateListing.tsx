import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoUploader, type PhotoFile } from "@/components/PhotoUploader";
import { PricingSuggestion } from "@/components/PricingSuggestion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { apiFetch, apiUpload } from "@/lib/api";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
  Save,
  PenLine,
  Lock,
} from "lucide-react";
import type { UsageInfo } from "../../../shared/types";

type Step = "photos" | "identify" | "details" | "pricing" | "preview";

interface CardDetails {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  condition: string;
  card_game: string;
  confidence?: number;
}

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
const CARD_GAMES = [
  { key: "pokemon", label: "Pokemon" },
  { key: "yugioh", label: "Yu-Gi-Oh!" },
  { key: "mtg", label: "MTG" },
  { key: "sports", label: "Sports" },
  { key: "other", label: "Other" },
] as const;

const STEPS: { key: Step; label: string }[] = [
  { key: "photos", label: "Photos" },
  { key: "identify", label: "Identify" },
  { key: "details", label: "Details" },
  { key: "pricing", label: "Pricing" },
  { key: "preview", label: "Preview" },
];

export default function CreateListing() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [_identifying, setIdentifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [identifiedBy, setIdentifiedBy] = useState<"manual" | "ai">("manual");
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiFetch<UsageInfo>("/account/usage"),
  });

  const [card, setCard] = useState<CardDetails>({
    card_name: "",
    set_name: "",
    card_number: "",
    rarity: "",
    language: "English",
    condition: "NM",
    card_game: "",
  });

  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedDescription, setGeneratedDescription] = useState("");
  const [listingType, setListingType] = useState<"auction" | "fixed_price">(
    "auction"
  );
  const [price, setPrice] = useState("");

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  // ── Step 1 → 2: Upload photos, then identify ────────

  async function handleIdentify() {
    setError("");
    setIdentifying(true);

    try {
      const frontPhoto = photos[0];
      if (!frontPhoto) return;

      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(frontPhoto.file);
      });

      const result = await apiFetch<CardDetails>("/cards/identify", {
        method: "POST",
        body: JSON.stringify({ image_url: dataUrl }),
      });

      setCard({
        card_name: result.card_name,
        set_name: result.set_name,
        card_number: result.card_number,
        rarity: result.rarity,
        language: result.language,
        condition: result.condition,
        card_game: result.card_game ?? "",
        confidence: result.confidence,
      });
      setIdentifiedBy("ai");
      setStep("details");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Card identification failed";
      if (msg.includes("Upgrade")) {
        setShowUpgrade(true);
      } else {
        setError(msg);
      }
    } finally {
      setIdentifying(false);
    }
  }

  // ── Manual entry: skip identification ───────────────

  function handleManualEntry() {
    setIdentifiedBy("manual");
    setCard({
      card_name: "",
      set_name: "",
      card_number: "",
      rarity: "",
      language: "English",
      condition: "NM",
      card_game: "",
    });
    setStep("details");
  }

  // ── Validation ────────────────────────────────────────

  function validateDetails(): string | null {
    if (!card.card_name.trim()) return "Card name is required.";
    if (card.card_name.length > 200) return "Card name is too long (max 200 characters).";
    if (!card.condition) return "Please select a condition.";
    if (!card.card_game) return "Please select a card game.";
    return null;
  }

  function validatePricing(): string | null {
    if (price && (isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
      return "Price must be a positive number.";
    }
    if (price && parseFloat(price) > 99999) {
      return "Price seems too high. Please double-check.";
    }
    return null;
  }

  function goToPricing() {
    const err = validateDetails();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep("pricing");
  }

  // ── Step 3: Generate title/desc preview ──────────────

  function goToPreview() {
    const err = validatePricing();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    const parts = [card.card_name];
    if (card.card_number) parts.push(card.card_number);
    if (card.set_name) parts.push(card.set_name);
    if (card.rarity) parts.push(card.rarity);
    if (card.condition) parts.push(card.condition);
    if (card.language && card.language !== "English") parts.push(card.language);
    setGeneratedTitle(parts.join(" ").slice(0, 80));
    setGeneratedDescription(
      `${card.card_name} — ${card.set_name ?? ""} ${card.card_number ?? ""} — Condition: ${card.condition ?? "NM"}`
    );
    setStep("preview");
  }

  // ── Step 4: Save listing ─────────────────────────────

  async function handleSave() {
    // Final validation before saving
    const detailsErr = validateDetails();
    if (detailsErr) {
      setError(detailsErr);
      return;
    }
    const pricingErr = validatePricing();
    if (pricingErr) {
      setError(pricingErr);
      return;
    }
    if (!generatedTitle.trim()) {
      setError("Listing title is empty. Go back and check card details.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      // 1. Create the draft listing
      const listing = await apiFetch<{ id: string }>("/listings", {
        method: "POST",
        body: JSON.stringify({
          card_name: card.card_name,
          set_name: card.set_name || undefined,
          card_number: card.card_number || undefined,
          rarity: card.rarity || undefined,
          language: card.language,
          condition: card.condition,
          card_game: card.card_game || undefined,
          identified_by: identifiedBy,
          listing_type: listingType,
          price_cad: price ? parseFloat(price) : undefined,
        }),
      });

      // 2. Upload photos to the listing
      if (photos.length > 0) {
        for (const photo of photos) {
          const formData = new FormData();
          formData.append("photo", photo.file);
          formData.append("listing_id", listing.id);
          formData.append("position", String(photo.position));

          await apiUpload("/photos", formData);
        }
      }

      navigate("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save listing";
      if (msg.includes("Upgrade") || msg.includes("limit")) {
        setShowUpgrade(true);
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  function updateCard(field: keyof CardDetails, value: string) {
    setCard((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Upgrade modal */}
      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-bold">New Listing</h1>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex gap-1">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`h-1.5 flex-1 rounded-full transition ${
              i <= currentStepIndex ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Step 1: Photos ──────────────────────────── */}
      {step === "photos" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Card Photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PhotoUploader photos={photos} onChange={setPhotos} />

            {/* Two-button fork: AI identify vs Manual entry */}
            <div className="flex flex-col gap-3 sm:flex-row">
              {usage?.ai_identify ? (
                <Button
                  onClick={() => {
                    setStep("identify");
                    handleIdentify();
                  }}
                  disabled={photos.length === 0}
                  className="flex-1"
                >
                  Auto-Identify with AI
                  <Sparkles className="ml-1.5 size-4" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  className="relative flex-1 opacity-60"
                  onClick={() => setShowUpgrade(true)}
                >
                  Auto-Identify with AI
                  <Lock className="ml-1.5 size-4" />
                  <Badge className="absolute -right-2 -top-2 text-[10px]">
                    Pro
                  </Badge>
                </Button>
              )}

              <Button
                variant="outline"
                onClick={handleManualEntry}
                disabled={photos.length === 0}
                className="flex-1"
              >
                Enter Details Manually
                <PenLine className="ml-1.5 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Identifying ─────────────────────── */}
      {step === "identify" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="size-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Identifying your card...</p>
              <p className="text-sm text-muted-foreground">
                Claude Vision is analyzing the photo
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Card Details ────────────────────── */}
      {step === "details" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Card Details</CardTitle>
              {card.confidence !== undefined && (
                <Badge
                  variant={card.confidence >= 0.8 ? "default" : "secondary"}
                >
                  {Math.round(card.confidence * 100)}% confidence
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Card Game selector */}
            <div className="space-y-2">
              <Label>Card Game</Label>
              <div className="flex flex-wrap gap-1.5">
                {CARD_GAMES.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => updateCard("card_game", g.key)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                      card.card_game === g.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:bg-accent"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="card_name">Card Name *</Label>
                <Input
                  id="card_name"
                  value={card.card_name}
                  onChange={(e) => updateCard("card_name", e.target.value)}
                  placeholder="e.g. Charizard"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="set_name">Set / Expansion</Label>
                <Input
                  id="set_name"
                  value={card.set_name}
                  onChange={(e) => updateCard("set_name", e.target.value)}
                  placeholder="e.g. Base Set"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card_number">Card Number</Label>
                <Input
                  id="card_number"
                  value={card.card_number}
                  onChange={(e) => updateCard("card_number", e.target.value)}
                  placeholder="e.g. 4/102"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rarity">Rarity</Label>
                <Input
                  id="rarity"
                  value={card.rarity}
                  onChange={(e) => updateCard("rarity", e.target.value)}
                  placeholder="e.g. Holo Rare"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Input
                  id="language"
                  value={card.language}
                  onChange={(e) => updateCard("language", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="condition">Condition</Label>
                <div className="flex gap-1.5">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateCard("condition", c)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                        card.condition === c
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

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("photos")}>
                <ArrowLeft className="mr-1.5 size-4" />
                Back
              </Button>
              <Button
                onClick={goToPricing}
                disabled={!card.card_name}
              >
                Pricing
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Pricing ────────────────────────── */}
      {step === "pricing" && (
        <Card>
          <CardHeader>
            <CardTitle>Set Your Price</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PricingSuggestion
              cardName={card.card_name}
              setName={card.set_name || null}
              condition={card.condition || null}
              price={price}
              onPriceChange={setPrice}
            />

            <div className="space-y-2">
              <Label>Listing Type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setListingType("auction")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    listingType === "auction"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  Auction
                </button>
                <button
                  type="button"
                  onClick={() => setListingType("fixed_price")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    listingType === "fixed_price"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  Buy It Now
                </button>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("details")}>
                <ArrowLeft className="mr-1.5 size-4" />
                Back
              </Button>
              <Button onClick={goToPreview}>
                Preview
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 5: Preview & Save ──────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Listing Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Photos preview */}
              {photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {photos.map((p, i) => (
                    <img
                      key={p.preview}
                      src={p.preview}
                      alt={`Photo ${i + 1}`}
                      className="h-24 w-24 shrink-0 rounded-lg border object-cover"
                    />
                  ))}
                </div>
              )}

              {/* Title */}
              <div className="space-y-1">
                <Label>eBay Title ({generatedTitle.length}/80)</Label>
                <Input
                  value={generatedTitle}
                  onChange={(e) =>
                    setGeneratedTitle(e.target.value.slice(0, 80))
                  }
                />
              </div>

              {/* Description preview */}
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={generatedDescription}
                  onChange={(e) => setGeneratedDescription(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Full HTML description will be generated on save
                </p>
              </div>

              {/* Pricing summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-muted p-2.5">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm font-medium">
                    {listingType === "auction" ? "Auction" : "Buy It Now"}
                  </p>
                </div>
                <div className="rounded-md bg-muted p-2.5">
                  <p className="text-xs text-muted-foreground">Price (CAD)</p>
                  <p className="text-sm font-medium">
                    {price ? `$${price}` : "Not set"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage counter for free users */}
          {usage?.listings_limit !== null && usage?.listings_limit !== undefined && (
            <p className="text-center text-xs text-muted-foreground">
              {usage.listings_this_month} / {usage.listings_limit} listings used
              this month
            </p>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("pricing")}>
              <ArrowLeft className="mr-1.5 size-4" />
              Back
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-4" />
              )}
              {saving ? "Saving..." : "Save Draft"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
