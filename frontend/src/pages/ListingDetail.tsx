/**
 * Listing Detail — slab/scanner edition.
 *
 * Single-column slab layout with the same flow as before: header →
 * banners → publish readiness → photos → card details → listing details
 * → description → actions. All business logic is preserved 1:1 — every
 * state hook, mutation, polling effect, and validation. Only the visual
 * layer is rebuilt around the slab system.
 */
import { useNavigate, useParams, Link as RouterLink } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Send,
  Trash2,
  AlertTriangle,
  Pencil,
  Check,
  X,
  ImageIcon,
  Upload,
  Link as LinkIcon,
  Settings2,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import {
  Slab,
  SlabButton,
  SlabField,
  SlabFieldGroup,
  SlabSelect,
  StatusChip,
  ToggleButton,
} from "@/components/slab";
import { apiFetch } from "@/lib/api";
import { DEV_MODE, DEV_PHOTOS } from "@/lib/devMode";
import { sanitizeDescriptionPreviewHtml } from "@/lib/descriptionTemplatePreview";
import type { EbayPublishReadiness } from "../../../shared/types";

interface Listing {
  id: string;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  language: string;
  condition: string | null;
  card_type: "raw" | "graded" | null;
  grading_company: string | null;
  grade: string | null;
  cert_number: string | null;
  status: string;
  title: string | null;
  description: string | null;
  price_cad: number | null;
  marketplace_id: string;
  currency_code: string;
  listing_type: string;
  duration: number;
  ebay_item_id: number | string | null;
  ebay_error: string | null;
  created_at: string;
  published_at: string | null;
  scheduled_at: string | null;
  publish_started_at: string | null;
  publish_attempted_at: string | null;
  ebay_aspects: Record<string, string | string[]> | null;
}

interface Photo {
  id: string;
  file_url: string;
  ebay_url: string | null;
  position: number;
}

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
const GRADERS = ["PSA", "BGS", "CGC", "SGC", "other"] as const;

type PublishMode = "now" | "scheduled";

interface PublishResponse {
  mock?: boolean;
  status: "publishing" | "published" | "scheduled" | "error";
  scheduled_at?: string | null;
  ebay_item_id?: string | null;
  error?: string;
}

function defaultScheduledLocalValue(): string {
  const scheduled = new Date(Date.now() + 60 * 60 * 1000);
  scheduled.setSeconds(0, 0);
  const local = new Date(
    scheduled.getTime() - scheduled.getTimezoneOffset() * 60_000,
  );
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Map our internal listing.status values to the StatusChip's status keys
 * (which include "live" / "sold" / "publishing" / etc.).
 */
function displayStatus(s: string): string {
  return s === "published" ? "live" : s;
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAspects, setSavingAspects] = useState(false);
  const [savingQuickCondition, setSavingQuickCondition] = useState(false);
  const [regeneratingDescription, setRegeneratingDescription] = useState(false);
  const [error, setError] = useState("");
  const [publishMode, setPublishMode] = useState<PublishMode>("now");
  const [scheduledAtLocal, setScheduledAtLocal] = useState(
    defaultScheduledLocalValue,
  );
  const [publishValidationError, setPublishValidationError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [mockPublished, setMockPublished] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aspectFields, setAspectFields] = useState<Record<string, string | string[]>>({});

  // Edit form state — kept as Record for compatibility with the original
  const [editFields, setEditFields] = useState<
    Record<string, string | number | null>
  >({});

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => apiFetch<Listing>(`/listings/${id}`),
    enabled: !!id,
  });

  // Poll while publishing so the UI flips when the worker finishes.
  useEffect(() => {
    if (!id || listing?.status !== "publishing") return;
    const intervalId = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["listing", id] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [id, listing?.status, queryClient]);

  const { data: photos } = useQuery({
    queryKey: ["listing-photos", id],
    queryFn: () => apiFetch<Photo[]>(`/listings/${id}/photos`),
    enabled: !!id,
  });

  const { data: ebayStatus } = useQuery({
    queryKey: ["ebay-status"],
    queryFn: () =>
      apiFetch<{ linked: boolean; ebay_user_id?: string; mock?: boolean }>(
        "/account/ebay-status",
      ),
  });

  const {
    data: readiness,
    error: readinessError,
    isLoading: readinessLoading,
  } = useQuery({
    queryKey: ["publish-readiness", id],
    queryFn: () => apiFetch<EbayPublishReadiness>(`/listings/${id}/publish-readiness`),
    enabled:
      !!id &&
      !!ebayStatus?.linked &&
      (listing?.status === "draft" || listing?.status === "error"),
  });

  // Pull readiness's required-aspect defaults into local edit state.
  useEffect(() => {
    if (!readiness) return;
    const nextValues: Record<string, string | string[]> = {};
    for (const field of readiness.unresolved_required_aspects) {
      if (Array.isArray(field.value)) {
        nextValues[field.name] = field.value;
      } else if (typeof field.value === "string") {
        nextValues[field.name] = field.value;
      } else {
        nextValues[field.name] = field.multiple ? [] : "";
      }
    }
    setAspectFields(nextValues);
  }, [readiness]);

  function startEditing() {
    if (!listing) return;
    setEditFields({
      card_name: listing.card_name,
      set_name: listing.set_name,
      card_number: listing.card_number,
      rarity: listing.rarity,
      condition: listing.condition,
      card_type: listing.card_type ?? "raw",
      grading_company: listing.grading_company,
      grade: listing.grade,
      cert_number: listing.cert_number,
      language: listing.language,
      price_cad: listing.price_cad,
      title: listing.title,
    });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditFields({});
    setError("");
  }

  function updateField(key: string, value: string | number | null) {
    setEditFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveEdit() {
    if (!id) return;
    setError("");
    setSaving(true);

    try {
      await apiFetch(`/listings/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editFields,
          price_cad: editFields.price_cad ? Number(editFields.price_cad) : null,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["listing", id] });
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
      await queryClient.invalidateQueries({ queryKey: ["publish-readiness", id] });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickConditionSave(condition: string) {
    if (!id) return;
    setError("");
    setSavingQuickCondition(true);

    try {
      await apiFetch(`/listings/${id}`, {
        method: "PUT",
        body: JSON.stringify({ condition }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["listing", id] }),
        queryClient.invalidateQueries({ queryKey: ["listings"] }),
        queryClient.invalidateQueries({ queryKey: ["publish-readiness", id] }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save condition");
    } finally {
      setSavingQuickCondition(false);
    }
  }

  async function handlePublish() {
    if (!id) return;
    setError("");
    setPublishValidationError("");
    setPublishing(true);

    try {
      const payload =
        publishMode === "scheduled"
          ? {
              mode: "scheduled" as const,
              scheduled_at: scheduledAtLocal
                ? new Date(scheduledAtLocal).toISOString()
                : null,
            }
          : { mode: "now" as const };

      const result = await apiFetch<PublishResponse>(`/listings/${id}/publish`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (result.mock) setMockPublished(true);
      if (result.status === "error" && result.error) {
        setPublishValidationError(result.error);
      }
      await queryClient.invalidateQueries({ queryKey: ["listing", id] });
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
      await queryClient.invalidateQueries({ queryKey: ["publish-readiness", id] });
    } catch (err) {
      setPublishValidationError(
        err instanceof Error ? err.message : "Failed to publish",
      );
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);

    try {
      await apiFetch(`/listings/${id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  async function handleConnectEbay() {
    try {
      const { url } = await apiFetch<{ url: string }>("/auth/ebay-oauth-url");
      localStorage.setItem("snapcard_ebay_return", "listing");
      localStorage.setItem("snapcard_ebay_listing_id", id ?? "");
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get eBay authorization URL",
      );
    }
  }

  function updateAspectField(name: string, value: string | string[]) {
    setAspectFields((current) => ({ ...current, [name]: value }));
  }

  async function handleSaveEbayDetails() {
    if (!id || !listing) return;

    setSavingAspects(true);
    setError("");

    try {
      const mergedAspects: Record<string, string | string[]> = {
        ...(listing.ebay_aspects ?? {}),
      };

      for (const [name, value] of Object.entries(aspectFields)) {
        if (Array.isArray(value)) {
          const cleaned = value.map((entry) => entry.trim()).filter(Boolean);
          if (cleaned.length > 0) {
            mergedAspects[name] = cleaned;
          } else {
            delete mergedAspects[name];
          }
          continue;
        }

        const cleaned = value.trim();
        if (cleaned) {
          mergedAspects[name] = cleaned;
        } else {
          delete mergedAspects[name];
        }
      }

      await apiFetch(`/listings/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ebay_aspects: mergedAspects }),
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["listing", id] }),
        queryClient.invalidateQueries({ queryKey: ["listings"] }),
        queryClient.invalidateQueries({ queryKey: ["publish-readiness", id] }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save eBay details");
    } finally {
      setSavingAspects(false);
    }
  }

  async function handleRegenerateDescription() {
    if (!id) return;
    setRegeneratingDescription(true);
    setError("");

    try {
      await apiFetch(`/listings/${id}/generate`, { method: "POST" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["listing", id] }),
        queryClient.invalidateQueries({ queryKey: ["listings"] }),
        queryClient.invalidateQueries({ queryKey: ["publish-readiness", id] }),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to regenerate description",
      );
    } finally {
      setRegeneratingDescription(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || !id) return;
    setUploading(true);
    setError("");

    try {
      const currentCount = photos?.length ?? 0;
      const files = Array.from(e.target.files).slice(0, 4 - currentCount);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file || !file.type.startsWith("image/")) continue;

        if (DEV_MODE) {
          const photoList = DEV_PHOTOS[id] ?? [];
          photoList.push({
            id: `photo-dev-${String(Date.now())}-${String(i)}`,
            file_url: URL.createObjectURL(file),
            ebay_url: null,
            position: currentCount + i,
          });
          DEV_PHOTOS[id] = photoList;
          continue;
        }

        const formData = new FormData();
        formData.append("photo", file);
        formData.append("position", String(currentCount + i + 1));

        const token = localStorage.getItem("access_token");
        const apiBase = import.meta.env.VITE_API_URL || "/api";
        await fetch(`${apiBase}/listings/${id}/photos`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }).then((res) => {
          if (!res.ok) throw new Error("Upload failed");
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["listing-photos", id] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photos");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Render guards ────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "60vh",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-soft)",
        }}
      >
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "60vh",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div className="hand" style={{ fontSize: 22, fontWeight: 700 }}>
          Listing not found.
        </div>
        <SlabButton onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="size-4" />
          BACK TO DASHBOARD
        </SlabButton>
      </div>
    );
  }

  const isDraft = listing.status === "draft";
  const isError = listing.status === "error";
  const isPublishing = listing.status === "publishing";
  const isPublished = listing.status === "published";
  const isMockListing =
    mockPublished ||
    (listing.ebay_item_id != null &&
      String(listing.ebay_item_id).startsWith("MOCK-"));
  const sellerMissing = readiness?.missing.filter((item) => item.scope === "seller") ?? [];
  const listingMissing = readiness?.missing.filter((item) => item.scope === "listing") ?? [];
  const missingRawCondition = listingMissing.some(
    (item) =>
      item.code === "missing_card_condition" ||
      item.message.toLowerCase().includes("ungraded card condition"),
  );
  const canAttemptPublish = (isDraft || isError) && !editing;
  const publishBlocked =
    publishing ||
    isPublishing ||
    !ebayStatus?.linked ||
    readinessLoading ||
    (publishMode === "scheduled" && !scheduledAtLocal) ||
    ((isDraft || isError) && ebayStatus.linked && readiness?.ready === false);
  const publishLabel = publishing
    ? "VALIDATING…"
    : readinessLoading
      ? "CHECKING READINESS…"
      : readiness && !readiness.ready
        ? "COMPLETE SETUP TO PUBLISH"
        : publishMode === "scheduled"
          ? "▸ SCHEDULE LISTING"
          : isError
            ? "▸ RETRY PUBLISH"
            : "▸ PUBLISH NOW";

  // Build a "BASE · 4/102" style subtitle.
  const setNumberSubtitle = [
    listing.set_name,
    listing.card_number,
  ]
    .filter(Boolean)
    .join(" · ");
  const conditionSubtitle =
    listing.card_type === "graded"
      ? `${listing.grading_company ?? ""} ${listing.grade ?? ""}`.trim() || "GRADED"
      : (listing.condition ?? "—");

  return (
    <div style={{ padding: "20px 16px 60px", maxWidth: 880, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div className="ld-header">
        <div style={{ minWidth: 0 }}>
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
            BACK · LISTING DETAIL
            {listing.cert_number ? ` · CERT #${listing.cert_number}` : ""}
          </button>
          <div
            className="hand"
            style={{
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 4,
              wordBreak: "break-word",
            }}
          >
            {listing.card_name}
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            <StatusChip status={displayStatus(listing.status)} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 1,
                color: "var(--ink-soft)",
                textTransform: "uppercase",
              }}
            >
              {setNumberSubtitle || "—"} · {conditionSubtitle}
            </span>
          </div>
        </div>
        {listing.ebay_item_id && (
          <a
            href={`https://www.ebay.ca/itm/${String(listing.ebay_item_id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ textDecoration: "none" }}
          >
            VIEW ON eBAY ↗
          </a>
        )}
      </div>

      {/* ── Banners ── */}
      {error && (
        <div style={{ marginTop: 14 }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      {listing.ebay_error && (
        <div style={{ marginTop: 14 }}>
          <ErrorBanner icon={<AlertTriangle className="size-4 shrink-0" />}>
            <span style={{ fontWeight: 700 }}>EBAY ERROR · </span>
            {listing.ebay_error}
          </ErrorBanner>
        </div>
      )}
      {isMockListing && isPublished && (
        <div
          style={{
            marginTop: 14,
            padding: "8px 12px",
            border: "1.5px solid var(--ink)",
            background: "var(--paper-2)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 1,
            color: "var(--ink-soft)",
          }}
        >
          ★ PUBLISHED IN MOCK MODE · CONNECT REAL eBAY TO PUBLISH FOR REAL
        </div>
      )}

      {/* ── Publish Readiness ── */}
      {(isDraft || isError) && ebayStatus?.linked && (
        <div style={{ marginTop: 16 }}>
          <Slab
            yellow={readiness?.ready === true}
            label="PUBLISH READINESS"
            grade={readiness?.ready ? "✓" : "?"}
            cert={readiness?.ready ? "READY" : "ACTION NEEDED"}
            foot={
              <>
                <span>EBAY VALIDATION</span>
                <span>RUNS BEFORE PUBLISH</span>
              </>
            }
          >
            {readinessLoading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 1,
                  color: "var(--ink-soft)",
                }}
              >
                <Loader2 className="size-4 animate-spin" />
                CHECKING EBAY REQUIREMENTS…
              </div>
            )}

            {readinessError && (
              <ErrorBanner>
                {readinessError instanceof Error
                  ? readinessError.message
                  : "Failed to load eBay publish readiness."}
              </ErrorBanner>
            )}

            {publishValidationError && (
              <div style={{ marginTop: 8 }}>
                <ErrorBanner>
                  <span style={{ fontWeight: 700 }}>
                    EBAY VALIDATION BLOCKED PUBLISH ·{" "}
                  </span>
                  {publishValidationError}
                </ErrorBanner>
              </div>
            )}

            {readiness && !readiness.ready && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sellerMissing.length > 0 && (
                  <WarnPanel
                    title="SELLER DEFAULTS TO FINISH"
                    items={sellerMissing.map((item) => ({
                      key: item.code,
                      label: item.message,
                    }))}
                    action={
                      <SlabButton size="sm" onClick={() => navigate("/account")}>
                        <Settings2 className="size-3" />
                        OPEN EBAY SETUP
                      </SlabButton>
                    }
                  />
                )}

                {listingMissing.length > 0 && (
                  <WarnPanel
                    title="LISTING DETAILS STILL NEEDED"
                    items={listingMissing.map((item) => ({
                      key: item.code,
                      label: item.message,
                    }))}
                    extra={
                      missingRawCondition ? (
                        <div style={{ marginTop: 12 }}>
                          <SlabFieldGroup label="QUICK FIX · CARD CONDITION">
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {CONDITIONS.map((condition) => (
                                <ToggleButton
                                  key={condition}
                                  active={listing.condition === condition}
                                  onClick={() =>
                                    void handleQuickConditionSave(condition)
                                  }
                                  size="sm"
                                  flex={false}
                                >
                                  {savingQuickCondition && listing.condition === condition ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : null}
                                  {condition}
                                </ToggleButton>
                              ))}
                            </div>
                          </SlabFieldGroup>
                          <div
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 9,
                              letterSpacing: 0.5,
                              color: "var(--ink-soft)",
                              marginTop: 6,
                            }}
                          >
                            Pick the closest condition — change it later from Card Details.
                          </div>
                        </div>
                      ) : null
                    }
                  />
                )}

                {readiness.unresolved_required_aspects.length > 0 && (
                  <div
                    style={{
                      border: "2px solid var(--ink)",
                      background: "var(--paper)",
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: 1.5,
                        fontWeight: 700,
                        color: "var(--ink)",
                      }}
                    >
                      MISSING EBAY FIELDS
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: 0.5,
                        color: "var(--ink-soft)",
                        marginTop: 4,
                      }}
                    >
                      The only extras eBay still needs for this card.
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 12,
                        marginTop: 14,
                      }}
                    >
                      {readiness.unresolved_required_aspects.map((field) => (
                        <SlabFieldGroup key={field.name} label={field.name.toUpperCase()}>
                          {field.mode === "select" ? (
                            field.multiple ? (
                              <select
                                multiple
                                value={
                                  Array.isArray(aspectFields[field.name])
                                    ? (aspectFields[field.name] as string[])
                                    : []
                                }
                                onChange={(event) =>
                                  updateAspectField(
                                    field.name,
                                    Array.from(event.target.selectedOptions).map(
                                      (option) => option.value,
                                    ),
                                  )
                                }
                                style={{
                                  display: "block",
                                  width: "100%",
                                  minHeight: 110,
                                  padding: "8px 12px",
                                  background: "var(--paper)",
                                  border: "1.5px solid var(--ink)",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 12,
                                  color: "var(--ink)",
                                  outline: "none",
                                  borderRadius: 0,
                                  boxSizing: "border-box",
                                }}
                              >
                                {field.values.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <SlabSelect
                                value={
                                  typeof aspectFields[field.name] === "string"
                                    ? (aspectFields[field.name] as string)
                                    : ""
                                }
                                onChange={(v) => updateAspectField(field.name, v)}
                                options={[
                                  { value: "", label: `Select ${field.name}` },
                                  ...field.values.map((v) => ({ value: v, label: v })),
                                ]}
                              />
                            )
                          ) : (
                            <SlabField
                              id={`aspect-${field.name}`}
                              label=""
                              value={
                                Array.isArray(aspectFields[field.name])
                                  ? (aspectFields[field.name] as string[]).join(", ")
                                  : ((aspectFields[field.name] as string) ?? "")
                              }
                              onChange={(v) =>
                                updateAspectField(
                                  field.name,
                                  field.multiple
                                    ? v
                                        .split(",")
                                        .map((entry) => entry.trim())
                                        .filter(Boolean)
                                    : v,
                                )
                              }
                              placeholder={
                                field.multiple
                                  ? "Enter comma-separated values"
                                  : `Enter ${field.name.toLowerCase()}`
                              }
                            />
                          )}
                          {field.description && (
                            <div
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 9,
                                letterSpacing: 0.5,
                                color: "var(--ink-soft)",
                                marginTop: 4,
                              }}
                            >
                              {field.description}
                            </div>
                          )}
                        </SlabFieldGroup>
                      ))}
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <SlabButton
                        primary
                        onClick={handleSaveEbayDetails}
                        disabled={savingAspects}
                      >
                        {savingAspects ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                        SAVE EBAY DETAILS
                      </SlabButton>
                    </div>
                  </div>
                )}
              </div>
            )}

            {readiness?.warnings.length ? (
              <div style={{ marginTop: 12 }}>
                <WarnPanel
                  title="WARNINGS"
                  items={readiness.warnings.map((w) => ({ key: w, label: w }))}
                />
              </div>
            ) : null}

            {readiness && Object.keys(readiness.resolved_item_specifics).length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  border: "1.5px dashed var(--ink)",
                  background: "var(--paper-2)",
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: 1.5,
                    fontWeight: 700,
                    color: "var(--ink)",
                  }}
                >
                  ✓ AUTO-FILLED FOR EBAY
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {Object.entries(readiness.resolved_item_specifics).map(
                    ([name, values]) => (
                      <div key={name}>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            letterSpacing: 1,
                            color: "var(--ink-soft)",
                            textTransform: "uppercase",
                          }}
                        >
                          {name}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            fontWeight: 700,
                            marginTop: 2,
                          }}
                        >
                          {values.join(", ")}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </Slab>
        </div>
      )}

      {/* ── Photos ── */}
      <div style={{ marginTop: 16 }}>
        {photos && photos.length > 0 ? (
          <Slab
            label="PHOTOS"
            grade={String(photos.length).padStart(2, "0")}
            cert={`${String(photos.length)}/4 SLOTS`}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                position: "relative",
              }}
            >
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  style={{
                    aspectRatio: "1/1",
                    border: "1.5px solid var(--ink)",
                    background: "var(--paper-2)",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={photo.ebay_url ?? photo.file_url}
                    alt={`Card photo ${String(photo.position + 1)}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              ))}
              {(isDraft || isError) && photos.length < 4 && (
                <UploadSlot
                  uploading={uploading}
                  onChange={handlePhotoUpload}
                  inputRef={fileInputRef}
                />
              )}
              {/* Verified stamp on published listings */}
              {isPublished && !isMockListing && (
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    pointerEvents: "none",
                  }}
                >
                  <span className="stamp">
                    VERIFIED
                    <br />
                    SNAPCARD
                  </span>
                </div>
              )}
            </div>
          </Slab>
        ) : (
          <Slab label="PHOTOS" grade="00" cert="NONE YET">
            {isDraft || isError ? (
              <UploadSlot
                uploading={uploading}
                onChange={handlePhotoUpload}
                inputRef={fileInputRef}
                large
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 1,
                  color: "var(--ink-soft)",
                }}
              >
                <ImageIcon className="size-4" />
                NO PHOTOS UPLOADED
              </div>
            )}
          </Slab>
        )}
      </div>

      {/* ── Card Details ── */}
      <div style={{ marginTop: 16 }}>
        <Slab
          label="CARD DETAILS"
          grade="01"
          cert={
            listing.card_type === "graded" ? "GRADED CARD" : "RAW CARD"
          }
        >
          {/* Edit/save toolbar inside the slab */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 6,
              marginBottom: 14,
              minHeight: 28,
            }}
          >
            {(isDraft || isError) && !editing && (
              <SlabButton size="sm" onClick={startEditing}>
                <Pencil className="size-3" />
                EDIT
              </SlabButton>
            )}
            {editing && (
              <>
                <SlabButton size="sm" onClick={cancelEditing}>
                  <X className="size-3" />
                  CANCEL
                </SlabButton>
                <SlabButton primary size="sm" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  SAVE
                </SlabButton>
              </>
            )}
          </div>

          {editing ? (
            <div className="ld-edit-grid">
              <SlabField
                id="edit-card-name"
                label="CARD NAME"
                value={(editFields.card_name as string) ?? ""}
                onChange={(v) => updateField("card_name", v)}
              />
              <SlabField
                id="edit-set"
                label="SET"
                value={(editFields.set_name as string) ?? ""}
                onChange={(v) => updateField("set_name", v)}
              />
              <SlabField
                id="edit-number"
                label="NUMBER"
                value={(editFields.card_number as string) ?? ""}
                onChange={(v) => updateField("card_number", v)}
              />
              <SlabField
                id="edit-rarity"
                label="RARITY"
                value={(editFields.rarity as string) ?? ""}
                onChange={(v) => updateField("rarity", v)}
              />
              <SlabField
                id="edit-language"
                label="LANGUAGE"
                value={(editFields.language as string) ?? ""}
                onChange={(v) => updateField("language", v)}
              />
              <SlabFieldGroup label="CARD TYPE">
                <div style={{ display: "flex", gap: 6 }}>
                  <ToggleButton
                    active={editFields.card_type === "raw"}
                    onClick={() => {
                      updateField("card_type", "raw");
                      updateField(
                        "condition",
                        (editFields.condition as string) || "NM",
                      );
                      updateField("grading_company", null);
                      updateField("grade", null);
                      updateField("cert_number", null);
                    }}
                    size="sm"
                  >
                    RAW
                  </ToggleButton>
                  <ToggleButton
                    active={editFields.card_type === "graded"}
                    onClick={() => {
                      updateField("card_type", "graded");
                      updateField("condition", null);
                    }}
                    size="sm"
                  >
                    GRADED
                  </ToggleButton>
                </div>
              </SlabFieldGroup>

              {editFields.card_type === "graded" ? (
                <>
                  <SlabFieldGroup label="GRADER">
                    <SlabSelect
                      value={(editFields.grading_company as string) ?? ""}
                      onChange={(v) => updateField("grading_company", v || null)}
                      options={[
                        { value: "", label: "Choose grader" },
                        ...GRADERS.map((g) => ({ value: g, label: g })),
                      ]}
                    />
                  </SlabFieldGroup>
                  <SlabField
                    id="edit-grade"
                    label="GRADE"
                    value={(editFields.grade as string) ?? ""}
                    onChange={(v) => updateField("grade", v || null)}
                  />
                  <SlabField
                    id="edit-cert"
                    label="CERT #"
                    value={(editFields.cert_number as string) ?? ""}
                    onChange={(v) => updateField("cert_number", v || null)}
                    placeholder="Optional"
                  />
                </>
              ) : (
                <SlabFieldGroup label="CONDITION">
                  <div style={{ display: "flex", gap: 4 }}>
                    {CONDITIONS.map((c) => (
                      <ToggleButton
                        key={c}
                        active={editFields.condition === c}
                        onClick={() => updateField("condition", c)}
                        size="sm"
                      >
                        {c}
                      </ToggleButton>
                    ))}
                  </div>
                </SlabFieldGroup>
              )}
            </div>
          ) : (
            <SpecsTable
              rows={[
                ["CARD NAME", listing.card_name],
                ["SET", listing.set_name],
                ["NUMBER", listing.card_number],
                ["RARITY", listing.rarity],
                ["LANGUAGE", listing.language],
                ...(listing.card_type === "graded"
                  ? ([
                      ["GRADING", listing.grading_company],
                      ["GRADE", listing.grade],
                      ["CERT #", listing.cert_number],
                    ] as [string, string | null | undefined][])
                  : ([["CONDITION", listing.condition]] as [string, string | null | undefined][])),
              ]}
            />
          )}
        </Slab>
      </div>

      {/* ── Listing Details ── */}
      <div style={{ marginTop: 16 }}>
        <Slab
          label="LISTING TERMS"
          grade="$"
          cert={listing.currency_code || "CAD"}
          yellow={isPublished}
        >
          {editing ? (
            <div className="ld-edit-grid">
              <SlabField
                id="edit-title"
                label={`EBAY TITLE · ${String(((editFields.title as string) ?? "").length)}/80`}
                value={(editFields.title as string) ?? ""}
                onChange={(v) => updateField("title", v.slice(0, 80))}
                style={{ gridColumn: "1 / -1" }}
              />
              <SlabField
                id="edit-price"
                label={`PRICE · ${listing.currency_code || "CAD"}`}
                type="number"
                inputMode="decimal"
                value={editFields.price_cad != null ? String(editFields.price_cad) : ""}
                onChange={(v) =>
                  updateField("price_cad", v ? parseFloat(v) : null)
                }
                placeholder="0.00"
              />
            </div>
          ) : (
            <>
              <SlabFieldGroup label="EBAY TITLE">
                <div
                  style={{
                    background: "var(--paper-2)",
                    border: "1.5px solid var(--ink)",
                    padding: "8px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1.4,
                    minHeight: 40,
                  }}
                >
                  {listing.title ?? (
                    <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>
                      Not generated yet
                    </span>
                  )}
                </div>
              </SlabFieldGroup>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                <SummaryTile
                  label="PRICE"
                  value={
                    listing.price_cad
                      ? `$${String(listing.price_cad)} ${listing.currency_code || "CAD"}`
                      : "NOT SET"
                  }
                  accent={isPublished}
                />
                <SummaryTile
                  label="TYPE"
                  value={listing.listing_type === "auction" ? "AUCTION" : "BUY IT NOW"}
                />
                <SummaryTile
                  label="DURATION"
                  value={
                    readiness?.display_duration ??
                    (listing.listing_type === "fixed_price"
                      ? "GTC"
                      : `${String(listing.duration)} DAYS`)
                  }
                />
              </div>

              {listing.ebay_item_id && (
                <div style={{ marginTop: 12 }}>
                  <SlabFieldGroup label="EBAY ITEM ID">
                    <a
                      href={`https://www.ebay.ca/itm/${String(listing.ebay_item_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        background: "var(--ink)",
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: 1,
                        fontWeight: 700,
                        textDecoration: "none",
                        border: "1.5px solid var(--ink)",
                      }}
                    >
                      {String(listing.ebay_item_id)} ↗
                    </a>
                  </SlabFieldGroup>
                </div>
              )}
            </>
          )}
        </Slab>
      </div>

      {/* ── Description ── */}
      <div style={{ marginTop: 16 }}>
        <Slab label="EBAY DESCRIPTION" grade="¶" cert="HTML PREVIEW">
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 10,
            }}
          >
            {(isDraft || isError) && !editing && (
              <SlabButton
                size="sm"
                onClick={handleRegenerateDescription}
                disabled={regeneratingDescription}
              >
                {regeneratingDescription ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                REGENERATE
              </SlabButton>
            )}
          </div>
          {listing.description ? (
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
              dangerouslySetInnerHTML={{
                __html: sanitizeDescriptionPreviewHtml(listing.description),
              }}
            />
          ) : (
            <div
              style={{
                border: "1.5px dashed #f5a623",
                background: "rgba(245,166,35,0.08)",
                padding: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: 0.5,
                color: "var(--ink)",
              }}
            >
              ? NO DESCRIPTION YET — REGENERATE AFTER SAVING DETAILS, OR ADD AN HTML TEMPLATE IN ACCOUNT.
            </div>
          )}
        </Slab>
      </div>

      {/* ── eBay Connection Prompt ── */}
      {(isDraft || isError) && !editing && ebayStatus && !ebayStatus.linked && (
        <div style={{ marginTop: 16 }}>
          <Slab
            yellow
            label="CONNECT EBAY"
            grade="!"
            cert="REQUIRED TO PUBLISH"
          >
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <LinkIcon
                className="size-5 shrink-0"
                style={{ color: "var(--ink)", marginTop: 2 }}
              />
              <div style={{ flex: 1 }}>
                <div
                  className="hand"
                  style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}
                >
                  Connect your eBay account to publish.
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-marker)",
                    fontSize: 13,
                    color: "var(--ink-soft)",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  SnapCard needs access to your eBay seller account to create listings on your behalf.
                </div>
                <div style={{ marginTop: 12 }}>
                  <SlabButton primary size="sm" onClick={handleConnectEbay}>
                    CONNECT EBAY ACCOUNT →
                  </SlabButton>
                </div>
              </div>
            </div>
          </Slab>
        </div>
      )}

      {/* ── Publish Actions ── */}
      {canAttemptPublish && (
        <div style={{ marginTop: 16 }}>
          <Slab
            label="PUBLISH TO EBAY.CA"
            grade="▸"
            cert={publishMode === "scheduled" ? "SCHEDULED" : "PUBLISH NOW"}
            foot={
              <>
                <span>EBAY · CANADA</span>
                <span>{listing.currency_code || "CAD"}</span>
              </>
            }
          >
            <SlabFieldGroup label="MODE">
              <div style={{ display: "flex", gap: 8 }}>
                <ToggleButton
                  active={publishMode === "now"}
                  onClick={() => setPublishMode("now")}
                >
                  PUBLISH NOW
                </ToggleButton>
                <ToggleButton
                  active={publishMode === "scheduled"}
                  onClick={() => setPublishMode("scheduled")}
                >
                  SCHEDULE
                </ToggleButton>
              </div>
            </SlabFieldGroup>

            {publishMode === "scheduled" && (
              <div style={{ marginTop: 12 }}>
                <SlabFieldGroup label="PUBLISH DATE/TIME">
                  <input
                    id="scheduled-at"
                    type="datetime-local"
                    value={scheduledAtLocal}
                    onChange={(event) => setScheduledAtLocal(event.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--paper)",
                      border: "1.5px solid var(--ink)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--ink)",
                      outline: "none",
                      borderRadius: 0,
                      boxSizing: "border-box",
                    }}
                  />
                </SlabFieldGroup>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: 0.5,
                    color: "var(--ink-soft)",
                    marginTop: 4,
                  }}
                >
                  SnapCard will verify the listing now, then queue it for this local time.
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1.5px dashed var(--ink)",
                flexWrap: "wrap",
              }}
            >
              <SlabButton
                primary
                onClick={handlePublish}
                disabled={publishBlocked}
                style={{ flex: 1, minWidth: 200 }}
              >
                {publishing || readinessLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : publishMode === "scheduled" ? (
                  <CalendarClock className="size-4" />
                ) : (
                  <Send className="size-4" />
                )}
                {publishLabel}
              </SlabButton>
              {isError && (
                <SlabButton onClick={startEditing}>
                  <Pencil className="size-3" />
                  EDIT
                </SlabButton>
              )}
              <SlabButton
                onClick={handleDelete}
                disabled={deleting}
                style={{ background: "#c44536", color: "var(--paper)", borderColor: "var(--ink)" }}
              >
                {deleting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                DELETE
              </SlabButton>
            </div>
          </Slab>
        </div>
      )}

      {/* ── Status banners ── */}
      {isPublishing && (
        <div style={{ marginTop: 16 }}>
          <ActivityCard
            label="● PUBLISHING TO EBAY.CA"
            title="Creating eBay listing now…"
            subtitle="This page refreshes automatically until it goes live or shows an error."
            spinning
          />
        </div>
      )}
      {listing.status === "scheduled" && (
        <div style={{ marginTop: 16 }}>
          <ActivityCard
            label="◐ SCHEDULED"
            title={`Scheduled for ${formatDateTime(listing.scheduled_at) ?? "the selected time"}`}
            subtitle="SnapCard will publish this listing automatically at the scheduled time."
            icon={<CalendarClock className="size-4" />}
          />
        </div>
      )}

      {/* ── Page-local layout ── */}
      <style>{`
        .ld-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .ld-edit-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        @media (max-width: 600px) {
          .ld-edit-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

/** Reusable error banner — red ink-bordered, monospace. */
function ErrorBanner({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#c44536",
        color: "var(--paper)",
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: 1,
        border: "2px solid var(--ink)",
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      {icon}
      <div style={{ flex: 1 }}>! {children}</div>
    </div>
  );
}

/** Amber-bordered warning panel — used for publish-readiness blockers. */
function WarnPanel({
  title,
  items,
  action,
  extra,
}: {
  title: string;
  items: { key: string; label: string }[];
  action?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1.5px solid #f5a623",
        background: "rgba(245,166,35,0.08)",
        padding: 12,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: 1.5,
          fontWeight: 700,
          color: "var(--ink)",
          marginBottom: 8,
        }}
      >
        ? {title}
      </div>
      <ul
        style={{
          margin: 0,
          padding: "0 0 0 18px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: 0.5,
          color: "var(--ink-soft)",
          lineHeight: 1.6,
        }}
      >
        {items.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
      {extra}
    </div>
  );
}

/** Card-specs table rendered as monospace key/value rows with dashed dividers. */
function SpecsTable({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <div>
      {rows.map(([k, v], i) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 0",
            borderBottom:
              i < rows.length - 1 ? "1.5px dashed var(--line-faint)" : "none",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            gap: 12,
          }}
        >
          <span
            style={{
              color: "var(--ink-soft)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {k}
          </span>
          <span
            style={{
              fontWeight: 700,
              color: v ? "var(--ink)" : "#a87a23",
              textAlign: "right",
            }}
          >
            {v || "Not set"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Summary tile — monospace label + handlettered value. */
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
        minWidth: 0,
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
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.1,
          marginTop: 4,
          color: "var(--ink)",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Photo upload slot — dashed, monospace label. */
function UploadSlot({
  uploading,
  onChange,
  inputRef,
  large = false,
}: {
  uploading: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  large?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        cursor: "pointer",
        border: "1.5px dashed var(--ink-soft)",
        background: "var(--paper-2)",
        aspectRatio: large ? undefined : "1/1",
        padding: large ? "32px 16px" : 6,
        textAlign: "center",
      }}
    >
      {uploading ? (
        <Loader2 className="size-5 animate-spin" style={{ color: "var(--ink-soft)" }} />
      ) : (
        <Upload className="size-5" style={{ color: "var(--ink-soft)" }} />
      )}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: 1.5,
          color: "var(--ink-soft)",
          fontWeight: 700,
        }}
      >
        {uploading ? "UPLOADING…" : large ? "DROP CARD PHOTOS" : "+ ADD"}
      </span>
      {large && (
        <span
          style={{
            fontFamily: "var(--font-marker)",
            fontSize: 12,
            color: "var(--ink-soft)",
          }}
        >
          Front and back · up to 4 total
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onChange}
        style={{ display: "none" }}
        disabled={uploading}
      />
    </label>
  );
}

/** Full-width activity card — dark ink with monospace title + subtitle. */
function ActivityCard({
  label,
  title,
  subtitle,
  spinning = false,
  icon,
}: {
  label: string;
  title: string;
  subtitle?: string;
  spinning?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--ink)",
        color: "var(--paper)",
        padding: 14,
        border: "2px solid var(--ink)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className="halftone"
        style={{ position: "absolute", inset: 0, opacity: 0.06 }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {spinning ? (
          <Loader2 className="size-5 animate-spin" style={{ color: "var(--accent)" }} />
        ) : (
          <span style={{ color: "var(--accent)" }}>{icon}</span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: 1.5,
              color: "var(--accent)",
            }}
          >
            {label}
          </div>
          <div className="hand" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontFamily: "var(--font-marker)",
                fontSize: 12,
                color: "rgba(254,253,246,0.7)",
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Suppress unused-import warning — keep RouterLink available for future
// in-page navigation if a related-listings strip gets added.
const _RouterLinkRef = RouterLink;
void _RouterLinkRef;
