import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { DEV_MODE, DEV_PHOTOS } from "@/lib/devMode";
import { sanitizeDescriptionPreviewHtml } from "@/lib/descriptionTemplatePreview";
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
  Link,
  Settings2,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  publishing: "secondary",
  scheduled: "secondary",
  published: "default",
  error: "destructive",
};

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
const SELECT_CLASS_NAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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
  const [aspectFields, setAspectFields] = useState<
    Record<string, string | string[]>
  >({});

  // Edit form state
  const [editFields, setEditFields] = useState<Record<string, string | number | null>>({});

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => apiFetch<Listing>(`/listings/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id || listing?.status !== "publishing") {
      return;
    }

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
    queryFn: () => apiFetch<{ linked: boolean; ebay_user_id?: string; mock?: boolean }>("/account/ebay-status"),
  });

  const { data: readiness, error: readinessError, isLoading: readinessLoading } = useQuery({
    queryKey: ["publish-readiness", id],
    queryFn: () => apiFetch<EbayPublishReadiness>(`/listings/${id}/publish-readiness`),
    enabled: !!id && !!ebayStatus?.linked && (listing?.status === "draft" || listing?.status === "error"),
  });

  useEffect(() => {
    if (!readiness) {
      return;
    }

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
      if (result.mock) {
        setMockPublished(true);
      }
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
      setError(err instanceof Error ? err.message : "Failed to get eBay authorization URL");
    }
  }

  function updateAspectField(name: string, value: string | string[]) {
    setAspectFields((current) => ({
      ...current,
      [name]: value,
    }));
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
        body: JSON.stringify({
          ebay_aspects: mergedAspects,
        }),
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
          // In dev mode, create a local preview URL instead of uploading
          const photoList = DEV_PHOTOS[id] ?? [];
          photoList.push({
            id: `photo-dev-${Date.now()}-${i}`,
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Listing not found</p>
      </div>
    );
  }

  const isDraft = listing.status === "draft";
  const isError = listing.status === "error";
  const isPublishing = listing.status === "publishing";
  const isMockListing = mockPublished || (listing.ebay_item_id != null && String(listing.ebay_item_id).startsWith("MOCK-"));
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
    ((isDraft || isError) && ebayStatus?.linked && readiness?.ready === false);
  const publishLabel = publishing
    ? "Validating..."
    : readinessLoading
      ? "Checking readiness..."
      : readiness && !readiness.ready
        ? "Complete setup to publish"
        : publishMode === "scheduled"
          ? "Schedule Listing"
          : isError
            ? "Retry Publish Now"
            : "Publish Now";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{listing.card_name}</h1>
          <p className="text-sm text-muted-foreground">
            {listing.set_name ?? "Unknown set"} &middot; {listing.condition ?? "\u2014"}
          </p>
        </div>
        <Badge variant={statusColors[listing.status] ?? "outline"}>
          {listing.status}
        </Badge>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {listing.ebay_error && (
        <div className="mb-4 flex gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">eBay Error</p>
            <p>{listing.ebay_error}</p>
          </div>
        </div>
      )}

      {(isDraft || isError) && ebayStatus?.linked && (
        <Card className="mb-4 border-primary/15">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Publish Readiness</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  SnapCard is checking your listing against the current eBay rules before you publish.
                </p>
              </div>
              {readiness?.ready ? (
                <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  Ready
                </div>
              ) : (
                <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                  Action needed
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {readinessLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Checking eBay requirements...
              </div>
            )}

            {readinessError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {readinessError instanceof Error
                  ? readinessError.message
                  : "Failed to load eBay publish readiness."}
              </div>
            )}

            {publishValidationError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-medium">eBay validation blocked publish</p>
                <p className="mt-1">{publishValidationError}</p>
              </div>
            )}

            {readiness && !readiness.ready && (
              <div className="space-y-4">
                {sellerMissing.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <p className="font-medium">Seller defaults to finish</p>
                    <ul className="mt-2 space-y-1 pl-5 text-amber-900">
                      {sellerMissing.map((item) => (
                        <li key={item.code} className="list-disc">
                          {item.message}
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => navigate("/account")}
                    >
                      <Settings2 className="mr-1.5 size-4" />
                      Open eBay setup
                    </Button>
                  </div>
                )}

                {listingMissing.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                    <p className="font-medium">Listing details still needed</p>
                    <ul className="mt-2 space-y-1 pl-5 text-muted-foreground">
                      {listingMissing.map((item) => (
                        <li key={item.code} className="list-disc">
                          {item.message}
                        </li>
                      ))}
                    </ul>
                    {missingRawCondition && (
                      <div className="mt-4 rounded-lg border bg-background p-3">
                        <p className="text-sm font-medium">Choose card condition</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Pick the closest raw card condition. You can change it later from Card Details.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {CONDITIONS.map((condition) => (
                            <Button
                              key={condition}
                              type="button"
                              variant={
                                listing.condition === condition
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() => void handleQuickConditionSave(condition)}
                              disabled={savingQuickCondition}
                            >
                              {savingQuickCondition &&
                              listing.condition === condition ? (
                                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                              ) : null}
                              {condition}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {readiness.unresolved_required_aspects.length > 0 && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Missing eBay fields</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        These are the only extra fields eBay still needs for this card.
                      </p>
                    </div>

                    <div className="grid gap-4">
                      {readiness.unresolved_required_aspects.map((field) => (
                        <div key={field.name} className="space-y-2">
                          <label className="text-sm font-medium">{field.name}</label>
                          {field.mode === "select" ? (
                            field.multiple ? (
                              <select
                                multiple
                                className={`${SELECT_CLASS_NAME} min-h-28`}
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
                              >
                                {field.values.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                className={SELECT_CLASS_NAME}
                                value={
                                  typeof aspectFields[field.name] === "string"
                                    ? (aspectFields[field.name] as string)
                                    : ""
                                }
                                onChange={(event) =>
                                  updateAspectField(field.name, event.target.value)
                                }
                              >
                                <option value="">Select {field.name}</option>
                                {field.values.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            )
                          ) : (
                            <Input
                              value={
                                Array.isArray(aspectFields[field.name])
                                  ? (aspectFields[field.name] as string[]).join(", ")
                                  : ((aspectFields[field.name] as string) ?? "")
                              }
                              onChange={(event) =>
                                updateAspectField(
                                  field.name,
                                  field.multiple
                                    ? event.target.value
                                        .split(",")
                                        .map((entry) => entry.trim())
                                        .filter(Boolean)
                                    : event.target.value,
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
                            <p className="text-xs text-muted-foreground">
                              {field.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    <Button
                      type="button"
                      onClick={handleSaveEbayDetails}
                      disabled={savingAspects}
                    >
                      {savingAspects ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 size-4" />
                      )}
                      Save eBay details
                    </Button>
                  </div>
                )}
              </div>
            )}

            {readiness?.warnings.length ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Warnings</p>
                <ul className="mt-2 space-y-1 pl-5 text-muted-foreground">
                  {readiness.warnings.map((warning) => (
                    <li key={warning} className="list-disc">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {readiness && Object.keys(readiness.resolved_item_specifics).length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Auto-filled for eBay</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {Object.entries(readiness.resolved_item_specifics).map(
                    ([name, values]) => (
                      <div key={name}>
                        <p className="text-muted-foreground">{name}</p>
                        <p className="font-medium">{values.join(", ")}</p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isMockListing && listing.status === "published" && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
          Published in mock mode. Connect a real eBay account to publish listings for real.
        </div>
      )}

      {/* Photos */}
      {photos && photos.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                >
                  <img
                    src={photo.ebay_url ?? photo.file_url}
                    alt={`Card photo ${photo.position + 1}`}
                    className="size-full object-cover"
                  />
                </div>
              ))}
              {(isDraft || isError) && photos.length < 4 && (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/25 transition hover:border-muted-foreground/50">
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="size-5 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">Add</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {photos && photos.length === 0 && (
        <Card className="mb-4">
          <CardContent className="py-6">
            {isDraft || isError ? (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 transition hover:border-muted-foreground/50">
                {uploading ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="size-8 text-muted-foreground" />
                )}
                <p className="text-sm font-medium">
                  {uploading ? "Uploading..." : "Upload card photos"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Front and back of the card (up to 4)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="size-4" />
                No photos uploaded.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Card Details */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Card Details</CardTitle>
            {(isDraft || isError) && !editing && (
              <Button variant="ghost" size="sm" onClick={startEditing}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Button>
            )}
            {editing && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 size-3.5" />
                  )}
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  <X className="mr-1.5 size-3.5" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Card Name</Label>
                <Input
                  value={(editFields.card_name as string) ?? ""}
                  onChange={(e) => updateField("card_name", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Set</Label>
                <Input
                  value={(editFields.set_name as string) ?? ""}
                  onChange={(e) => updateField("set_name", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Number</Label>
                <Input
                  value={(editFields.card_number as string) ?? ""}
                  onChange={(e) => updateField("card_number", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rarity</Label>
                <Input
                  value={(editFields.rarity as string) ?? ""}
                  onChange={(e) => updateField("rarity", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Language</Label>
                <Input
                  value={(editFields.language as string) ?? ""}
                  onChange={(e) => updateField("language", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Card Type</Label>
                <select
                  value={(editFields.card_type as string) ?? "raw"}
                  onChange={(event) => {
                    const cardType = event.target.value === "graded" ? "graded" : "raw";
                    updateField("card_type", cardType);
                    if (cardType === "raw") {
                      updateField("condition", (editFields.condition as string) || "NM");
                      updateField("grading_company", null);
                      updateField("grade", null);
                      updateField("cert_number", null);
                    } else {
                      updateField("condition", null);
                    }
                  }}
                  className={SELECT_CLASS_NAME}
                >
                  <option value="raw">Raw</option>
                  <option value="graded">Graded</option>
                </select>
              </div>
              {editFields.card_type === "graded" ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Grader</Label>
                    <select
                      value={(editFields.grading_company as string) ?? ""}
                      onChange={(event) =>
                        updateField("grading_company", event.target.value || null)
                      }
                      className={SELECT_CLASS_NAME}
                    >
                      <option value="">Choose grader</option>
                      {["PSA", "BGS", "CGC", "SGC", "other"].map((grader) => (
                        <option key={grader} value={grader}>
                          {grader}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Grade</Label>
                    <Input
                      value={(editFields.grade as string) ?? ""}
                      onChange={(e) => updateField("grade", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cert #</Label>
                    <Input
                      value={(editFields.cert_number as string) ?? ""}
                      onChange={(e) =>
                        updateField("cert_number", e.target.value || null)
                      }
                      placeholder="Optional"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Condition</Label>
                  <div className="flex gap-1">
                    {CONDITIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateField("condition", c)}
                        className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                          editFields.condition === c
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input hover:bg-accent"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ["Card Name", listing.card_name],
                ["Set", listing.set_name],
                ["Number", listing.card_number],
                ["Rarity", listing.rarity],
                ["Language", listing.language],
                ...(listing.card_type === "graded"
                  ? [
                      ["Grading", listing.grading_company],
                      ["Grade", listing.grade],
                      ["Cert #", listing.cert_number],
                    ]
                  : [["Condition", listing.condition]]),
              ].map(
                ([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd
                      className={
                        value
                          ? "font-medium"
                          : "font-medium text-amber-700"
                      }
                    >
                      {value || "Not set"}
                    </dd>
                  </div>
                )
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Listing Details */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Listing Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {editing ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">eBay Title</Label>
                <Input
                  value={(editFields.title as string) ?? ""}
                  onChange={(e) =>
                    updateField("title", e.target.value.slice(0, 80))
                  }
                  maxLength={80}
                />
                <p className="text-xs text-muted-foreground">
                  {((editFields.title as string) ?? "").length}/80
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price ({listing.currency_code || "CAD"})</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editFields.price_cad ?? ""}
                  onChange={(e) =>
                    updateField(
                      "price_cad",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  placeholder="0.00"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-muted-foreground">eBay Title</p>
                <p className="font-medium">{listing.title ?? "Not generated"}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground">Price</p>
                  <p className="font-heading text-xl font-bold">
                    {listing.price_cad ? `$${listing.price_cad} ${listing.currency_code || "CAD"}` : "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">
                    {listing.listing_type === "auction" ? "Auction" : "Buy It Now"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">
                    {readiness?.display_duration ??
                      (listing.listing_type === "fixed_price"
                        ? "Good 'Til Cancelled"
                        : `${listing.duration} days`)}
                  </p>
                </div>
              </div>
            </>
          )}
          {listing.ebay_item_id && (
            <div>
              <p className="text-muted-foreground">eBay Item ID</p>
              <a
                href={`https://www.ebay.ca/itm/${listing.ebay_item_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-4"
              >
                {listing.ebay_item_id}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">eBay Description</CardTitle>
            {(isDraft || isError) && !editing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRegenerateDescription}
                disabled={regeneratingDescription}
              >
                {regeneratingDescription ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 size-3.5" />
                )}
                Regenerate from template
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {listing.description ? (
            <div
              className="max-h-[28rem] overflow-auto rounded-lg border bg-white p-3 text-sm text-slate-900"
              dangerouslySetInnerHTML={{
                __html: sanitizeDescriptionPreviewHtml(listing.description),
              }}
            />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No eBay description yet. Regenerate after saving card details, or add an HTML template in Account.
            </div>
          )}
        </CardContent>
      </Card>

      {/* eBay Connection Prompt */}
      {(isDraft || isError) && !editing && ebayStatus && !ebayStatus.linked && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Link className="mt-0.5 size-5 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">Connect your eBay account to publish</p>
              <p className="mt-1 text-sm text-amber-700">
                SnapCard needs access to your eBay seller account to create listings on your behalf.
              </p>
              <Button size="sm" className="mt-3" onClick={handleConnectEbay}>
                Connect eBay Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {canAttemptPublish && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Publish to eBay.ca</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPublishMode("now")}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  publishMode === "now"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-accent"
                }`}
              >
                Publish now
              </button>
              <button
                type="button"
                onClick={() => setPublishMode("scheduled")}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  publishMode === "scheduled"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-accent"
                }`}
              >
                Schedule for later
              </button>
            </div>

            {publishMode === "scheduled" && (
              <div className="space-y-2">
                <Label htmlFor="scheduled-at">Publish date/time</Label>
                <Input
                  id="scheduled-at"
                  type="datetime-local"
                  value={scheduledAtLocal}
                  onChange={(event) => setScheduledAtLocal(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  SnapCard will verify the listing now, then queue it for this
                  local time.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handlePublish}
                disabled={publishBlocked}
                className="flex-1"
              >
                {publishing || readinessLoading ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : publishMode === "scheduled" ? (
                  <CalendarClock className="mr-1.5 size-4" />
                ) : (
                  <Send className="mr-1.5 size-4" />
                )}
                {publishLabel}
              </Button>
              {isError && (
                <Button variant="outline" onClick={startEditing}>
                  <Pencil className="mr-1.5 size-4" />
                  Edit & Fix
                </Button>
              )}
              <Button
                variant="destructive"
                size="icon"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isPublishing && (
        <div className="rounded-lg border bg-muted/50 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Loader2 className="size-4 animate-spin text-primary" />
            Publishing to eBay.ca
          </div>
          <p className="mt-1 text-muted-foreground">
            SnapCard is creating the eBay listing now. This page will refresh
            until it becomes published or shows an error.
          </p>
        </div>
      )}

      {listing.status === "scheduled" && (
        <div className="rounded-lg border bg-muted/50 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CalendarClock className="size-4 text-primary" />
            Scheduled for publishing
          </div>
          <p className="mt-1 text-muted-foreground">
            Scheduled for {formatDateTime(listing.scheduled_at) ?? "the selected time"}.
          </p>
        </div>
      )}
    </div>
  );
}
