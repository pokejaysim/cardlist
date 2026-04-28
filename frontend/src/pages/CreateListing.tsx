/**
 * Create Listing — slab/scanner edition.
 *
 * 5-step wizard: Photos → Find Card → Details → Pricing → Preview. Every
 * piece of business logic from the previous shadcn version is preserved
 * verbatim — only the visual layer is rebuilt around the slab system.
 *
 * Subcomponents that have their own internal styling (PricingSuggestion,
 * ListingPhotoSlotsUploader, CardSearch) are wrapped in slabs but not
 * themselves rebuilt yet — they can be migrated later without touching
 * the wizard's flow.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EMPTY_LISTING_PHOTO_SLOTS,
  ListingPhotoSlotsUploader,
  listingPhotoSlotsToArray,
  type ListingPhotoSlots,
  type ListingPhotoSlotKey,
} from "@/components/ListingPhotoSlots";
import { PricingSuggestion } from "@/components/PricingSuggestion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { CardSearch } from "@/components/CardSearch";
import { apiFetch, apiUpload } from "@/lib/api";
import {
  fallbackDescriptionPreview,
  renderDescriptionTemplatePreview,
} from "@/lib/descriptionTemplatePreview";
import {
  ChipMono,
  Slab,
  SlabButton,
  SlabField,
  SlabFieldGroup,
  ToggleButton,
} from "@/components/slab";
import {
  ArrowLeft,
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
  cert_number: string;
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

// 5-step ticket bar across the top. "search" and "identify" both share the
// same ticket cell (#02 · IDENTIFY) so the bar always shows 5 cells.
const STEPS: { key: Step; label: string }[] = [
  { key: "photos",  label: "SCAN" },
  { key: "search",  label: "IDENTIFY" },
  { key: "details", label: "GRADE" },
  { key: "pricing", label: "PRICE" },
  { key: "preview", label: "PUBLISH" },
];

const CANADA_BETA_CONFIG = EBAY_MARKETPLACE_CONFIG[CANADA_BETA_MARKETPLACE_ID];

export default function CreateListing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("photos");
  const [photoSlots, setPhotoSlots] = useState<ListingPhotoSlots>({
    ...EMPTY_LISTING_PHOTO_SLOTS,
  });
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
    cert_number: "",
  });

  const [generatedTitle, setGeneratedTitle] = useState("");
  const [listingType, setListingType] = useState<"auction" | "fixed_price">(
    "auction",
  );
  const [price, setPrice] = useState("");

  const photos = listingPhotoSlotsToArray(photoSlots);
  // For ticket coloring, "identify" rolls up to the IDENTIFY cell (search/identify).
  const ticketStep: Step = step === "identify" ? "search" : step;
  const currentStepIndex = STEPS.findIndex((s) => s.key === ticketStep);

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
      const frontPhoto = photoSlots.front;
      if (!frontPhoto) {
        setError("Add a front photo before using AI identification.");
        return;
      }

      const formData = new FormData();
      formData.append("photo", frontPhoto.file);
      const uploaded = await apiUpload<{ url?: string; file_url?: string }>(
        "/photos/upload",
        formData,
      );
      const imageUrl = uploaded.url ?? uploaded.file_url;
      if (!imageUrl) {
        throw new Error("Photo upload succeeded but no image URL was returned.");
      }

      const result = await apiFetch<CardDetails>("/cards/identify", {
        method: "POST",
        body: JSON.stringify({ image_url: imageUrl }),
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
        cert_number: result.cert_number ?? "",
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
      cert_number: "",
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

  // ── Save ─────────────────────────────────────────────

  async function handleSave() {
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
    if (!photoSlots.front) {
      setError("Add a front photo before saving this draft.");
      return;
    }

    setError("");
    setSaving(true);

    try {
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
          grading_company:
            card.card_type === "graded" ? card.grading_company || undefined : undefined,
          grade: card.card_type === "graded" ? card.grade || undefined : undefined,
          cert_number:
            card.card_type === "graded" ? card.cert_number || undefined : undefined,
          identified_by: identifiedBy,
          listing_type: listingType,
          price_cad: price ? parseFloat(price) : undefined,
          marketplace_id: CANADA_BETA_MARKETPLACE_ID,
          currency_code: CANADA_BETA_CURRENCY_CODE,
        }),
      });

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
    <div style={{ padding: "20px 16px 60px", maxWidth: 1100, margin: "0 auto" }}>
      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}

      {/* ── Header ── */}
      <div className="cl-header">
        <div>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 2,
              color: "var(--ink-soft)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textTransform: "uppercase",
            }}
          >
            <ArrowLeft className="size-3" />
            BACK · MODULE 02 · NEW LISTING
          </button>
          <div
            className="hand"
            style={{
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 4,
            }}
          >
            Grade a card.
          </div>
        </div>
      </div>

      {/* ── Step ticket bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          marginTop: 20,
          border: "2px solid var(--ink)",
          overflowX: "auto",
        }}
      >
        {STEPS.map((s, i) => {
          const done = currentStepIndex !== -1 && i < currentStepIndex;
          const active = i === currentStepIndex;
          return (
            <div
              key={s.key}
              style={{
                flex: 1,
                minWidth: 110,
                padding: "10px 14px",
                background: active
                  ? "var(--accent)"
                  : done
                    ? "var(--ink)"
                    : "var(--paper)",
                color: active
                  ? "var(--ink)"
                  : done
                    ? "var(--paper)"
                    : "var(--ink-soft)",
                borderRight: i < STEPS.length - 1 ? "1.5px solid var(--ink)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: active || done ? 700 : 500,
              }}
            >
              <span
                style={{
                  background: active
                    ? "var(--ink)"
                    : done
                      ? "var(--accent)"
                      : "transparent",
                  color: active
                    ? "var(--accent)"
                    : done
                      ? "var(--ink)"
                      : "var(--ink-soft)",
                  padding: "2px 6px",
                  fontWeight: 700,
                  border: !active && !done ? "1.5px solid var(--ink-soft)" : "none",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{s.label}</span>
              {done && <span style={{ marginLeft: "auto" }}>✓</span>}
            </div>
          );
        })}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div
          style={{
            marginTop: 14,
            background: "#c44536",
            color: "var(--paper)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 1,
            border: "2px solid var(--ink)",
          }}
        >
          ! {error}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {/* ── Step 1: Photos ── */}
        {step === "photos" && (
          <Slab
            label="PHOTOGRAPHIC EVIDENCE"
            grade="01"
            cert={`${String(photos.length)}/8 PHOTOS`}
            foot={
              <>
                <span>FRONT REQUIRED</span>
                <span>BACK + ANGLES OPTIONAL</span>
              </>
            }
          >
            <div
              style={{
                fontFamily: "var(--font-marker)",
                fontSize: 14,
                color: "var(--ink-soft)",
                marginBottom: 14,
                lineHeight: 1.5,
              }}
            >
              Add the actual card front and back. Optional extras publish to
              eBay as listing photos. Multiple cards?{" "}
              <button
                type="button"
                onClick={() => navigate("/listings/batch")}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 1,
                  color: "var(--ink)",
                  fontWeight: 700,
                  textDecoration: "underline",
                  textDecorationColor: "var(--accent)",
                  textDecorationThickness: 2,
                  cursor: "pointer",
                }}
              >
                USE BATCH UPLOAD →
              </button>
            </div>

            <ListingPhotoSlotsUploader
              slots={photoSlots}
              onChange={setPhotoSlots}
            />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginTop: 18,
                paddingTop: 14,
                borderTop: "1.5px dashed var(--ink)",
              }}
            >
              <SlabButton
                primary
                size="lg"
                onClick={() => setStep("search")}
                style={{ width: "100%" }}
              >
                <Search className="size-4" />
                SEARCH BY CARD NAME
              </SlabButton>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <SlabButton
                  onClick={() => {
                    setStep("identify");
                    void handleIdentify();
                  }}
                  disabled={!photoSlots.front}
                >
                  <Sparkles className="size-4" />
                  AUTO-IDENTIFY
                </SlabButton>
                <SlabButton onClick={handleManualEntry}>
                  <PenLine className="size-4" />
                  ENTER MANUALLY
                </SlabButton>
              </div>
            </div>
          </Slab>
        )}

        {/* ── Step 2a: Card search ── */}
        {step === "search" && (
          <Slab
            label="FIND YOUR CARD"
            grade="02"
            cert="POKÉMON TCG DATABASE"
            foot={
              <>
                <span>FREE LOOKUP</span>
                <span>35,000+ SKUs</span>
              </>
            }
          >
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
                  cert_number: "",
                });
                setIdentifiedBy("pokemon_tcg");
                setReferenceImageUrl(detail.image_large);
                setStep("details");
              }}
            />

            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "var(--paper-2)",
                border: "1.5px dashed var(--ink)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 1,
                color: "var(--ink-soft)",
                lineHeight: 1.5,
              }}
            >
              SEARCH POKÉMON TCG TO AUTO-FILL CARD DETAILS. YOU'LL STILL SET
              CONDITION + PRICING YOURSELF.
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 18,
                paddingTop: 14,
                borderTop: "1.5px dashed var(--ink)",
              }}
            >
              <SlabButton onClick={() => setStep("photos")}>
                <ArrowLeft className="size-4" />
                BACK
              </SlabButton>
              <SlabButton onClick={handleManualEntry}>
                SKIP — ENTER MANUALLY
                <PenLine className="size-4" />
              </SlabButton>
            </div>
          </Slab>
        )}

        {/* ── Step 2b: Identifying (loading) ── */}
        {step === "identify" && (
          <Slab
            label="SCANNING ARTWORK"
            grade="02"
            cert="OPUS VISION ENGINE"
            foot={
              <>
                <span>~3-5 SECONDS</span>
                <span>● LIVE</span>
              </>
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                padding: "32px 12px",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 140,
                  aspectRatio: "5/7",
                  border: "2px solid var(--ink)",
                  background: "var(--paper-2)",
                  overflow: "hidden",
                }}
              >
                <div className="scan-overlay">
                  <div className="scan-corner tl" />
                  <div className="scan-corner tr" />
                  <div className="scan-corner bl" />
                  <div className="scan-corner br" />
                  <div
                    className="scan-line"
                    style={{ animationIterationCount: "infinite" }}
                  />
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  className="hand"
                  style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}
                >
                  Identifying your card…
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: "var(--ink-soft)",
                    marginTop: 6,
                  }}
                >
                  ◉ CLAUDE OPUS · MATCHING SET, NUMBER, RARITY
                </div>
              </div>
              <Loader2
                className="size-5 animate-spin"
                style={{ color: "var(--ink-soft)" }}
              />
            </div>
          </Slab>
        )}

        {/* ── Step 3: Details ── */}
        {step === "details" && (
          <Slab
            label="CARD DETAILS"
            grade="03"
            cert={
              identifiedBy === "ai"
                ? "AI VERIFIED"
                : identifiedBy === "pokemon_tcg"
                  ? "TCG MATCHED"
                  : "MANUAL ENTRY"
            }
            foot={
              <>
                <span>VERIFY EVERY FIELD</span>
                <span>RAW · GRADED</span>
              </>
            }
          >
            {/* AI confidence banner (if identified by AI) */}
            {card.confidence !== undefined && (
              <div
                style={{
                  background: "var(--ink)",
                  color: "var(--paper)",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  className="halftone"
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0.06,
                  }}
                />
                <div
                  style={{
                    background: "var(--accent)",
                    color: "var(--ink)",
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    fontSize: 13,
                    border: "2px solid var(--paper)",
                    flexShrink: 0,
                    position: "relative",
                  }}
                >
                  ★
                </div>
                <div style={{ position: "relative", flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: 1.5,
                      color: "var(--accent)",
                    }}
                  >
                    SNAPCARD VERIFIED
                  </div>
                  <div
                    className="hand"
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--paper)",
                    }}
                  >
                    Card identified — {Math.round(card.confidence * 100)}% match.
                    Verify the fields below.
                  </div>
                </div>
              </div>
            )}

            {/* Pokemon TCG reference image */}
            {referenceImageUrl && identifiedBy === "pokemon_tcg" && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  background: "var(--paper-2)",
                  border: "1.5px solid var(--ink)",
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <img
                  src={referenceImageUrl}
                  alt="Reference"
                  style={{
                    height: 110,
                    width: "auto",
                    border: "1.5px solid var(--ink)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: 1.5,
                      color: "var(--ink-soft)",
                      fontWeight: 700,
                    }}
                  >
                    REFERENCE · POKÉMON TCG DATABASE
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-marker)",
                      fontSize: 13,
                      color: "var(--ink-soft)",
                      marginTop: 4,
                      lineHeight: 1.5,
                    }}
                  >
                    Stock image — for variant verification only. Use your own
                    photos in the listing.
                  </div>
                </div>
              </div>
            )}

            {/* Card game pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 18,
              }}
            >
              <ChipMono solid>★ POKÉMON</ChipMono>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: 1,
                  color: "var(--ink-soft)",
                }}
              >
                MORE GAMES COMING SOON
              </span>
            </div>

            {/* Raw vs Graded toggle */}
            <SlabFieldGroup label="CARD TYPE">
              <div style={{ display: "flex", gap: 8 }}>
                <ToggleButton
                  active={card.card_type === "raw"}
                  onClick={() => {
                    setCard((prev) => ({
                      ...prev,
                      card_type: "raw",
                      condition: prev.condition || "NM",
                      grading_company: "",
                      grade: "",
                      cert_number: "",
                    }));
                  }}
                >
                  RAW CARD
                </ToggleButton>
                <ToggleButton
                  active={card.card_type === "graded"}
                  onClick={() => {
                    setCard((prev) => ({
                      ...prev,
                      card_type: "graded",
                      condition: "",
                    }));
                  }}
                >
                  GRADED CARD
                </ToggleButton>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: 0.5,
                  color: "var(--ink-soft)",
                  marginTop: 6,
                }}
              >
                {card.card_type === "raw"
                  ? "Ungraded card · NM/LP/MP/HP/DMG"
                  : "PSA · BGS · CGC · SGC slabs"}
              </div>
            </SlabFieldGroup>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 14,
              }}
              className="cl-details-grid"
            >
              <SlabField
                id="card_name"
                label="CARD NAME *"
                value={card.card_name}
                onChange={(v) => updateCard("card_name", v)}
                placeholder="e.g. Charizard"
                required
              />
              <SlabField
                id="set_name"
                label="SET / EXPANSION"
                value={card.set_name}
                onChange={(v) => updateCard("set_name", v)}
                placeholder="e.g. Base Set"
              />
              <SlabField
                id="card_number"
                label="CARD NUMBER"
                value={card.card_number}
                onChange={(v) => updateCard("card_number", v)}
                placeholder="e.g. 4/102"
              />
              <SlabField
                id="rarity"
                label="RARITY"
                value={card.rarity}
                onChange={(v) => updateCard("rarity", v)}
                placeholder="e.g. Holo Rare"
              />
              <SlabField
                id="language"
                label="LANGUAGE"
                value={card.language}
                onChange={(v) => updateCard("language", v)}
              />

              {/* Condition (raw) or Grading (graded) */}
              {card.card_type === "raw" ? (
                <SlabFieldGroup label="CONDITION">
                  <div style={{ display: "flex", gap: 6 }}>
                    {CONDITIONS.map((c) => (
                      <ToggleButton
                        key={c}
                        active={card.condition === c}
                        onClick={() => updateCard("condition", c)}
                        size="sm"
                      >
                        {c}
                      </ToggleButton>
                    ))}
                  </div>
                </SlabFieldGroup>
              ) : (
                <>
                  <SlabFieldGroup label="GRADING COMPANY *">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {GRADING_COMPANIES.map((g) => (
                        <ToggleButton
                          key={g.key}
                          active={card.grading_company === g.key}
                          onClick={() => updateCard("grading_company", g.key)}
                          size="sm"
                        >
                          {g.label}
                        </ToggleButton>
                      ))}
                    </div>
                  </SlabFieldGroup>
                  <SlabField
                    id="grade"
                    label="GRADE *"
                    value={card.grade}
                    onChange={(v) => updateCard("grade", v)}
                    placeholder="e.g. 10, 9.5"
                  />
                  <div style={{ gridColumn: "1 / -1" }}>
                    <SlabField
                      id="cert_number"
                      label="CERT NUMBER"
                      value={card.cert_number}
                      onChange={(v) => updateCard("cert_number", v)}
                      placeholder="Optional · PSA cert number"
                    />
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: 0.5,
                        color: "var(--ink-soft)",
                        marginTop: 4,
                      }}
                    >
                      SnapCard tries to read this off the slab — fix manually if needed.
                    </div>
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 20,
                paddingTop: 14,
                borderTop: "1.5px dashed var(--ink)",
              }}
            >
              <SlabButton onClick={() => setStep("photos")}>
                <ArrowLeft className="size-4" />
                BACK
              </SlabButton>
              <SlabButton primary onClick={goToPricing} disabled={!card.card_name}>
                NEXT · PRICING →
              </SlabButton>
            </div>
          </Slab>
        )}

        {/* ── Step 4: Pricing ── */}
        {step === "pricing" && (
          <Slab
            label="SET YOUR PRICE"
            grade="04"
            cert="REAL SOLD COMPS"
            foot={
              <>
                <span>PRICECHARTING + eBay</span>
                <span>{CANADA_BETA_CONFIG.currency} ONLY</span>
              </>
            }
          >
            <PricingSuggestion
              cardName={card.card_name}
              setName={card.set_name || null}
              cardNumber={card.card_number || null}
              condition={card.condition || null}
              price={price}
              onPriceChange={setPrice}
            />

            <div style={{ marginTop: 18 }}>
              <SlabFieldGroup label="LISTING TYPE">
                <div style={{ display: "flex", gap: 8 }}>
                  <ToggleButton
                    active={listingType === "auction"}
                    onClick={() => setListingType("auction")}
                  >
                    AUCTION
                  </ToggleButton>
                  <ToggleButton
                    active={listingType === "fixed_price"}
                    onClick={() => setListingType("fixed_price")}
                  >
                    BUY IT NOW
                  </ToggleButton>
                </div>
              </SlabFieldGroup>
            </div>

            <div
              style={{
                marginTop: 16,
                background: "var(--paper-2)",
                border: "1.5px solid var(--ink)",
                padding: 12,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: "var(--accent-2)",
                  fontWeight: 700,
                }}
              >
                ★ {CANADA_BETA_CONFIG.label.toUpperCase()} BETA · {CANADA_BETA_CONFIG.currency}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-marker)",
                  fontSize: 13,
                  color: "var(--ink-soft)",
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                New beta listings publish to eBay.ca in CAD. US/international support
                unlocks after the Canada workflow is proven.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 20,
                paddingTop: 14,
                borderTop: "1.5px dashed var(--ink)",
              }}
            >
              <SlabButton onClick={() => setStep("details")}>
                <ArrowLeft className="size-4" />
                BACK
              </SlabButton>
              <SlabButton primary onClick={goToPreview}>
                NEXT · PREVIEW →
              </SlabButton>
            </div>
          </Slab>
        )}

        {/* ── Step 5: Preview & Save ── */}
        {step === "preview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Slab
              yellow
              label="LISTING PREVIEW"
              grade="05"
              cert="DRAFT · NOT PUBLISHED YET"
              foot={
                <>
                  <span>SAVES AS DRAFT</span>
                  <span>PUBLISH FROM DASHBOARD</span>
                </>
              }
            >
              {photos.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    overflowX: "auto",
                    marginBottom: 16,
                    paddingBottom: 4,
                  }}
                >
                  {photos.map((p) => (
                    <div key={p.preview} style={{ flexShrink: 0 }}>
                      <img
                        src={p.preview}
                        alt={`${formatPhotoSlotLabel(p.slot)} photo`}
                        style={{
                          height: 96,
                          width: 96,
                          objectFit: "cover",
                          border: "2px solid var(--ink)",
                          display: "block",
                        }}
                      />
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          letterSpacing: 1.5,
                          color: "var(--ink-soft)",
                          textAlign: "center",
                          marginTop: 4,
                          textTransform: "uppercase",
                        }}
                      >
                        {formatPhotoSlotLabel(p.slot)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <SlabField
                id="ebay_title"
                label={`EBAY TITLE · ${String(generatedTitle.length)}/80`}
                value={generatedTitle}
                onChange={(v) => setGeneratedTitle(v.slice(0, 80))}
              />

              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: "var(--ink-soft)",
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  EBAY DESCRIPTION PREVIEW
                </div>
                <div
                  style={{
                    maxHeight: 384,
                    overflow: "auto",
                    border: "1.5px solid var(--ink)",
                    background: "#fff",
                    color: "#0e0e10",
                    padding: 12,
                    fontSize: 13,
                    fontFamily: "system-ui, sans-serif",
                  }}
                  dangerouslySetInnerHTML={{ __html: descriptionPreviewHtml }}
                />
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: 0.5,
                    color: "var(--ink-soft)",
                    marginTop: 6,
                  }}
                >
                  {listingPreferences?.description_template_html?.trim()
                    ? "Filled from your saved Account HTML template."
                    : "No saved template — using SnapCard's default description."}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 16,
                }}
              >
                <SummaryTile
                  label="TYPE"
                  value={listingType === "auction" ? "AUCTION" : "BUY IT NOW"}
                />
                <SummaryTile
                  label={`PRICE · ${CANADA_BETA_CURRENCY_CODE}`}
                  value={price ? `$${price}` : "NOT SET"}
                  accent
                />
              </div>
            </Slab>

            {usage?.listings_limit !== null && usage?.listings_limit !== undefined && (
              <div
                style={{
                  textAlign: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: 1,
                  color: "var(--ink-soft)",
                }}
              >
                {usage.listings_this_month} / {usage.listings_limit} LISTINGS USED THIS MONTH
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: 4,
              }}
            >
              <SlabButton onClick={() => setStep("pricing")}>
                <ArrowLeft className="size-4" />
                BACK
              </SlabButton>
              <SlabButton primary size="lg" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {saving ? "SAVING…" : "▸ SAVE DRAFT"}
              </SlabButton>
            </div>
          </div>
        )}
      </div>

      {/* Page-local responsive */}
      <style>{`
        .cl-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        @media (max-width: 600px) {
          .cl-details-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

function formatPhotoSlotLabel(slot: ListingPhotoSlotKey): string {
  if (slot === "front") return "Front";
  if (slot === "back") return "Back";
  return "Extra";
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
    cert_number: card.card_type === "graded" ? card.cert_number || null : null,
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

/** Pricing/preview summary tile. */
function SummaryTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? "var(--accent)" : "var(--paper-2)",
        border: "1.5px solid var(--ink)",
        padding: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: 1.5,
          color: "var(--ink-soft)",
        }}
      >
        {label}
      </div>
      <div
        className="hand"
        style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.1,
          marginTop: 4,
          color: "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
