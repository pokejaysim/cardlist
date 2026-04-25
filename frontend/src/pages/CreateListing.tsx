import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoUploader, type PhotoFile } from "@/components/PhotoUploader";
import { PricingSuggestion } from "@/components/PricingSuggestion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { apiFetch, apiUpload } from "@/lib/api";
import { CardSearch } from "@/components/CardSearch";
import {
  fallbackDescriptionPreview,
  renderDescriptionTemplatePreview,
} from "@/lib/descriptionTemplatePreview";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
  Save,
  PenLine,
  Search,
} from "lucide-react";
import type { PokemonTcgCardDetail } from "../../../shared/types";
import { formatEbayTitle } from "../../../shared/titleFormatter";
import {
  CANADA_BETA_CURRENCY_CODE,
  CANADA_BETA_MARKETPLACE_ID,
  EBAY_MARKETPLACE_CONFIG,
} from "../../../shared/types";
import type { ListingPreference, UsageInfo } from "../../../shared/types";

type Step = "photos" | "search" | "identify" | "details" | "pricing" | "preview";

interface CardDetails {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  condition: string;
  card_game: string;
  card_type: "raw" | "graded";
  grading_company: string;
  grade: string;
  confidence?: number;
}

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
const GRADING_COMPANIES = [
  { key: "PSA", label: "PSA" },
  { key: "BGS", label: "BGS" },
  { key: "CGC", label: "CGC" },
  { key: "SGC", label: "SGC" },
  { key: "other", label: "Other" },
] as const;
const STEPS: { key: Step; label: string }[] = [
  { key: "photos", label: "Photos" },
  { key: "search", label: "Find Card" },
  { key: "details", label: "Details" },
  { key: "pricing", label: "Pricing" },
  { key: "preview", label: "Preview" },
];
const CANADA_BETA_CONFIG = EBAY_MARKETPLACE_CONFIG[CANADA_BETA_MARKETPLACE_ID];

export default function CreateListing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [_identifying, setIdentifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [identifiedBy, setIdentifiedBy] = useState<"manual" | "ai" | "pokemon_tcg">("manual");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiFetch<UsageInfo>("/account/usage"),
  });

  const { data: listingPreferences } = useQuery({
    queryKey: ["listing-preferences"],
    queryFn: () => apiFetch<ListingPreference>("/account/listing-preferences"),
  });

  const [card, setCard] = useState<CardDetails>({
    card_name: "",
    set_name: "",
    card_number: "",
    rarity: "",
    language: "English",
    condition: "NM",
    card_game: "pokemon",
    card_type: "raw",
    grading_company: "",
    grade: "",
  });

  const [generatedTitle, setGeneratedTitle] = useState("");
  const [listingType, setListingType] = useState<"auction" | "fixed_price">(
    "auction"
  );
  const [price, setPrice] = useState("");

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);
  const descriptionPreviewHtml = buildCreateDescriptionPreview(
    generatedTitle,
    card,
    price,
    listingPreferences,
  );

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
        card_type: result.card_type ?? "raw",
        grading_company: result.grading_company ?? "",
        grade: result.grade ?? "",
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
      card_game: "pokemon",
      card_type: "raw",
      grading_company: "",
      grade: "",
    });
    setStep("details");
  }

  // ── Validation ────────────────────────────────────────

  function validateDetails(): string | null {
    if (!card.card_name.trim()) return "Card name is required.";
    if (card.card_name.length > 200) return "Card name is too long (max 200 characters).";
    if (card.card_type === "graded") {
      if (!card.grading_company) return "Please select a grading company.";
      if (!card.grade.trim()) return "Please enter a grade.";
    } else {
      if (!card.condition) return "Please select a condition.";
    }
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
    setGeneratedTitle(formatEbayTitle(card));
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
          condition: card.card_type === "raw" ? card.condition : undefined,
          card_game: card.card_game || undefined,
          card_type: card.card_type,
          grading_company: card.card_type === "graded" ? card.grading_company || undefined : undefined,
          grade: card.card_type === "graded" ? card.grade || undefined : undefined,
          identified_by: identifiedBy,
          listing_type: listingType,
          price_cad: price ? parseFloat(price) : undefined,
          marketplace_id: CANADA_BETA_MARKETPLACE_ID,
          currency_code: CANADA_BETA_CURRENCY_CODE,
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

      await queryClient.invalidateQueries({ queryKey: ["listings"] });
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
            <p className="mt-1 text-sm text-muted-foreground">
              Upload photos of <span className="font-medium">one card</span> (front, back, etc.). Listing multiple different cards?{" "}
              <button
                type="button"
                onClick={() => navigate("/listings/batch")}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Use Batch Upload
              </button>{" "}
              instead.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <PhotoUploader
              photos={photos}
              onChange={setPhotos}
              labels={
                card.card_type === "graded"
                  ? ["Front", "Back", "Label/Grade", "Extra"]
                  : undefined
              }
            />

            {/* Three-option fork: Search / AI identify / Manual entry */}
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => setStep("search")}
                className="w-full"
                size="lg"
              >
                Search by Card Name
                <Search className="ml-1.5 size-4" />
              </Button>

              <div className="flex gap-3">
                <Button
                  variant="outline"
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

                <Button
                  variant="outline"
                  onClick={handleManualEntry}
                  className="flex-1"
                >
                  Enter Manually
                  <PenLine className="ml-1.5 size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2a: Card Search ─────────────────────── */}
      {step === "search" && (
        <Card>
          <CardHeader>
            <CardTitle>Find Your Card</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CardSearch
              onSelect={(detail: PokemonTcgCardDetail) => {
                setCard({
                  card_name: detail.name,
                  set_name: detail.set_name,
                  card_number: detail.number,
                  rarity: detail.rarity ?? "",
                  language: "English",
                  condition: "NM",
                  card_game: "pokemon",
                  card_type: "raw",
                  grading_company: "",
                  grade: "",
                });
                setIdentifiedBy("pokemon_tcg");
                setReferenceImageUrl(detail.image_large);
                setStep("details");
              }}
            />

            <p className="text-xs text-muted-foreground">
              Search the Pokemon TCG database to auto-fill card details. You'll still set condition and pricing yourself.
            </p>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("photos")}>
                <ArrowLeft className="mr-1.5 size-4" />
                Back
              </Button>
              <Button variant="outline" onClick={handleManualEntry}>
                Skip — Enter Manually
                <PenLine className="ml-1.5 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2b: Identifying ─────────────────────── */}
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
            {/* Reference image from Pokemon TCG search */}
            {referenceImageUrl && identifiedBy === "pokemon_tcg" && (
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-accent p-3">
                <img
                  src={referenceImageUrl}
                  alt="Reference"
                  className="h-24 w-auto shrink-0 rounded"
                />
                <div className="min-w-0 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Reference image from Pokemon TCG database</p>
                  <p className="mt-1">This is a stock image for reference only. Use your own photos for the eBay listing.</p>
                </div>
              </div>
            )}

            {/* Card Game — Pokemon only for now */}
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
              <Badge variant="secondary">Pokemon</Badge>
              <span className="text-xs text-muted-foreground">
                More card games coming soon
              </span>
            </div>

            {/* Raw vs Graded toggle */}
            <div className="space-y-2">
              <Label>Card Type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCard((prev) => ({
                      ...prev,
                      card_type: "raw",
                      condition: prev.condition || "NM",
                      grading_company: "",
                      grade: "",
                    }));
                  }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    card.card_type === "raw"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  Raw Card
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCard((prev) => ({
                      ...prev,
                      card_type: "graded",
                      condition: "",
                    }));
                  }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    card.card_type === "graded"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  Graded Card
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {card.card_type === "raw"
                  ? "Ungraded card with condition rating"
                  : "PSA, BGS, CGC, or SGC graded with numeric grade"}
              </p>
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

              {/* Condition (raw) or Grading (graded) */}
              {card.card_type === "raw" ? (
                <div className="space-y-2">
                  <Label>Condition</Label>
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
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Grading Company *</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {GRADING_COMPANIES.map((g) => (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => updateCard("grading_company", g.key)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                            card.grading_company === g.key
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input hover:bg-accent"
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grade">Grade *</Label>
                    <Input
                      id="grade"
                      value={card.grade}
                      onChange={(e) => updateCard("grade", e.target.value)}
                      placeholder="e.g. 10, 9.5"
                    />
                  </div>
                </>
              )}
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
              cardNumber={card.card_number || null}
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

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="font-medium">
                {CANADA_BETA_CONFIG.label} beta ({CANADA_BETA_CONFIG.currency})
              </p>
              <p className="mt-1 text-muted-foreground">
                New beta listings publish to eBay.ca in CAD. US/international
                support will unlock after the Canada workflow is proven.
              </p>
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
              <div className="space-y-2">
                <Label>eBay Description Preview</Label>
                <div
                  className="max-h-96 overflow-auto rounded-md border bg-white p-3 text-sm text-slate-900"
                  dangerouslySetInnerHTML={{ __html: descriptionPreviewHtml }}
                />
                <p className="text-xs text-muted-foreground">
                  {listingPreferences?.description_template_html?.trim()
                    ? "This preview uses your saved Account HTML template filled with this card's details."
                    : "No full HTML template is saved yet, so SnapCard will use its default generated description."}
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
                  <p className="text-xs text-muted-foreground">Price ({CANADA_BETA_CURRENCY_CODE})</p>
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

function buildCreateDescriptionPreview(
  title: string,
  card: CardDetails,
  price: string,
  preferences?: ListingPreference,
): string {
  const previewInput = {
    title,
    card_name: card.card_name || "Pokemon Card",
    set_name: card.set_name || null,
    card_number: card.card_number || null,
    rarity: card.rarity || null,
    language: card.language || "English",
    condition: card.card_type === "raw" ? card.condition || "NM" : null,
    card_type: card.card_type,
    grading_company:
      card.card_type === "graded" ? card.grading_company || null : null,
    grade: card.card_type === "graded" ? card.grade || null : null,
    price_cad: price ? Number(price) : null,
    seller_logo_url: preferences?.seller_logo_url || null,
    seller_location: "Your saved eBay location",
    shipping_summary: "Ships from Canada using your saved SnapCard/eBay defaults.",
    returns_summary: "Uses your saved SnapCard/eBay return defaults.",
  };

  return preferences?.description_template_html?.trim()
    ? renderDescriptionTemplatePreview(
        preferences.description_template_html,
        previewInput,
      )
    : fallbackDescriptionPreview(previewInput);
}
