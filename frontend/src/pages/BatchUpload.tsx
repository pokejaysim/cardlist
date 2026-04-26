import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeftRight, CheckCircle2, Loader2, Rocket, Save, Upload, Wand2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, apiUpload } from "@/lib/api";
import type {
  BulkPublishResponse,
  EbayPublishReadiness,
  Listing,
  ListingBatchDetail,
  ListingBatchItem,
} from "../../../shared/types";

const MAX_BATCH_PAIRS = 20;
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
const GRADERS = ["PSA", "BGS", "CGC", "SGC", "other"] as const;

interface UploadedPhoto {
  url: string;
  preview_url: string;
}

interface PhotoPairDraft {
  id: string;
  front: UploadedPhoto;
  back: UploadedPhoto | null;
}

export default function BatchUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pairs, setPairs] = useState<PhotoPairDraft[]>([]);
  const [batch, setBatch] = useState<ListingBatchDetail | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [error, setError] = useState("");
  const [publishMessage, setPublishMessage] = useState("");

  async function uploadOneFile(file: File): Promise<UploadedPhoto> {
    const formData = new FormData();
    formData.append("photo", file);
    const response = await apiUpload<{ url?: string; file_url?: string }>("/photos/upload", formData);
    const url = response.url ?? response.file_url;
    if (!url) {
      throw new Error("Upload completed but no photo URL was returned.");
    }
    return {
      url,
      preview_url: URL.createObjectURL(file),
    };
  }

  async function uploadFiles(fileList: File[]) {
    const imageFiles = fileList
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, MAX_BATCH_PAIRS * 2 - pairs.length * 2));

    if (imageFiles.length === 0) {
      if (fileList.length > 0) setError("Only image files are supported.");
      return;
    }

    setError("");
    setUploading(true);

    try {
      const uploaded = await Promise.all(imageFiles.map(uploadOneFile));
      const newPairs: PhotoPairDraft[] = [];
      for (let index = 0; index < uploaded.length; index += 2) {
        const front = uploaded[index];
        if (!front) continue;
        newPairs.push({
          id: `pair-${Date.now()}-${String(index)}`,
          front,
          back: uploaded[index + 1] ?? null,
        });
      }
      setPairs((current) => [...current, ...newPairs].slice(0, MAX_BATCH_PAIRS));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;
    void uploadFiles(Array.from(event.target.files));
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (!uploading) void uploadFiles(Array.from(event.dataTransfer.files));
  }

  function swapPair(pairId: string) {
    setPairs((current) =>
      current.map((pair) =>
        pair.id === pairId && pair.back
          ? { ...pair, front: pair.back, back: pair.front }
          : pair,
      ),
    );
  }

  async function addBackPhoto(pairId: string, file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const uploaded = await uploadOneFile(file);
      setPairs((current) =>
        current.map((pair) =>
          pair.id === pairId ? { ...pair, back: uploaded } : pair,
        ),
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function removePair(pairId: string) {
    setPairs((current) => current.filter((pair) => pair.id !== pairId));
  }

  async function runAutopilot() {
    const items = pairs.map((pair) => ({
      front_url: pair.front.url,
      back_url: pair.back?.url ?? null,
    }));
    if (items.length === 0) return;

    setError("");
    setPublishMessage("");
    setProcessing(true);

    try {
      const createdBatch = await apiFetch<ListingBatchDetail>("/listing-batches", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      setBatch(createdBatch);
      setSelected(new Set(readyListingIds(createdBatch)));
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Autopilot failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function refreshBatch(batchId: string) {
    const refreshed = await apiFetch<ListingBatchDetail>(`/listing-batches/${batchId}`);
    setBatch(refreshed);
    setSelected((current) => new Set([...current].filter((id) => readyListingIds(refreshed).includes(id))));
  }

  function updateListingInBatch(listingId: string, updates: Partial<Listing>) {
    setBatch((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) =>
          item.listing && item.listing.id === listingId
            ? { ...item, listing: { ...item.listing, ...updates } }
            : item,
        ),
      };
    });
  }

  async function saveListing(item: ListingBatchItem) {
    const listing = item.listing;
    if (!listing || !batch) return;

    setSavingListingId(listing.id);
    setError("");

    try {
      const saved = await apiFetch<Listing>(`/listings/${listing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          card_name: listing.card_name,
          set_name: listing.set_name,
          card_number: listing.card_number,
          rarity: listing.rarity,
          language: listing.language,
          condition: listing.card_type === "graded" ? null : listing.condition,
          card_type: listing.card_type,
          grading_company: listing.card_type === "graded" ? listing.grading_company : null,
          grade: listing.card_type === "graded" ? listing.grade : null,
          cert_number: listing.card_type === "graded" ? listing.cert_number : null,
          title: listing.title,
          description: listing.description,
          price_cad: listing.price_cad,
          listing_type: listing.listing_type,
          duration: listing.listing_type === "fixed_price" ? 30 : listing.duration,
          ebay_aspects: listing.ebay_aspects,
        }),
      });
      updateListingInBatch(listing.id, saved);

      const readiness = await apiFetch<EbayPublishReadiness>(`/listings/${listing.id}/publish-readiness`);
      setBatch((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((batchItem) =>
            batchItem.id === item.id
              ? {
                  ...batchItem,
                  status: readiness.ready ? "ready" : "needs_review",
                  needs_review_reasons: readiness.missing.map((entry) => entry.message),
                  listing: saved,
                }
              : batchItem,
          ),
        };
      });
      if (readiness.ready) {
        setSelected((current) => new Set(current).add(listing.id));
      } else {
        setSelected((current) => {
          const next = new Set(current);
          next.delete(listing.id);
          return next;
        });
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save draft.");
    } finally {
      setSavingListingId(null);
    }
  }

  function toggleSelected(listingId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  }

  async function publishSelected() {
    const listingIds = [...selected];
    if (listingIds.length === 0 || !batch) return;

    setPublishing(true);
    setError("");
    setPublishMessage("");

    try {
      const response = await apiFetch<BulkPublishResponse>("/listings/bulk-publish", {
        method: "POST",
        body: JSON.stringify({ listing_ids: listingIds, mode: "now" }),
      });
      const published = response.results.filter((result) => result.status === "published" || result.status === "publishing").length;
      const blocked = response.results.filter((result) => result.status === "blocked" || result.status === "error").length;
      setPublishMessage(`${String(published)} listing${published === 1 ? "" : "s"} started publishing. ${String(blocked)} blocked or failed.`);
      setSelected(new Set());
      await refreshBatch(batch.id);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Bulk publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  const readyIds = batch ? readyListingIds(batch) : [];
  const selectedReadyCount = [...selected].filter((id) => readyIds.includes(id)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Autopilot Draft Queue</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Upload cards as front/back pairs. SnapCard identifies each card, prices it in CAD, creates eBay.ca drafts, and leaves you with a review queue of only the exceptions.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {publishMessage && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          {publishMessage}
        </div>
      )}

      {!batch && (
        <>
          <Card className="mb-5">
            <CardContent className="py-8">
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={handleDrop}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 transition ${
                  isDraggingOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                }`}
              >
                {uploading ? (
                  <Loader2 className="size-10 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className={`size-10 ${isDraggingOver ? "text-primary" : "text-muted-foreground"}`} />
                )}
                <div className="text-center">
                  <p className="font-medium">{uploading ? "Uploading..." : "Drop photos here or click to select"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    File 1 = front, file 2 = back, file 3 = next front, file 4 = next back.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFilesSelected}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </CardContent>
          </Card>

          {pairs.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
              <div className="text-sm">
                <span className="font-medium">{String(pairs.length)} card pair{pairs.length === 1 ? "" : "s"}</span>
                <span className="ml-2 text-muted-foreground">
                  {String(pairs.filter((pair) => !pair.back).length)} missing back photo
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="mr-1.5 size-4" />
                  Add Photos
                </Button>
                <Button size="sm" onClick={runAutopilot} disabled={processing || uploading}>
                  {processing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Wand2 className="mr-1.5 size-4" />}
                  {processing ? "Creating drafts..." : "Run Autopilot"}
                </Button>
              </div>
            </div>
          )}

          {pairs.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pairs.map((pair, index) => (
                <PhotoPairCard
                  key={pair.id}
                  pair={pair}
                  position={index + 1}
                  onSwap={() => swapPair(pair.id)}
                  onRemove={() => removePair(pair.id)}
                  onAddBack={(file) => void addBackPhoto(pair.id, file)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {batch && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
            <div>
              <p className="font-medium">Batch review queue</p>
              <p className="text-sm text-muted-foreground">
                {String(batch.summary_counts.ready)} ready, {String(batch.summary_counts.needs_review)} need review, {String(batch.summary_counts.error)} failed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshBatch(batch.id)}>
                Refresh
              </Button>
              <Button onClick={publishSelected} disabled={publishing || selectedReadyCount === 0}>
                {publishing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Rocket className="mr-1.5 size-4" />}
                Publish {String(selectedReadyCount)} Selected
              </Button>
            </div>
          </div>

          {batch.items.map((item) => (
            <ReviewQueueItem
              key={item.id}
              item={item}
              selected={Boolean(item.listing?.id && selected.has(item.listing.id))}
              saving={savingListingId === item.listing?.id}
              onToggleSelected={() => item.listing?.id && toggleSelected(item.listing.id)}
              onUpdateListing={updateListingInBatch}
              onSave={() => void saveListing(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoPairCard({
  pair,
  position,
  onSwap,
  onRemove,
  onAddBack,
}: {
  pair: PhotoPairDraft;
  position: number;
  onSwap: () => void;
  onRemove: () => void;
  onAddBack: (file: File | undefined) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b p-3">
        <p className="text-sm font-medium">Card {String(position)}</p>
        <button type="button" onClick={onRemove} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        <PhotoPreview label="Front" url={pair.front.preview_url} />
        {pair.back ? (
          <PhotoPreview label="Back" url={pair.back.preview_url} />
        ) : (
          <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center text-xs text-muted-foreground hover:bg-muted/50">
            <Upload className="mb-2 size-5" />
            Add back photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => onAddBack(event.target.files?.[0])}
            />
          </label>
        )}
      </div>
      <div className="flex gap-2 border-t p-3">
        <Button variant="outline" size="sm" className="flex-1" disabled={!pair.back} onClick={onSwap}>
          <ArrowLeftRight className="mr-1.5 size-4" />
          Swap
        </Button>
        {!pair.back && (
          <Badge variant="outline" className="self-center border-amber-300 text-amber-700">
            front only
          </Badge>
        )}
      </div>
    </div>
  );
}

function PhotoPreview({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <div className="aspect-[3/4] overflow-hidden rounded-lg bg-muted">
        <img src={url} alt={`${label} card`} className="size-full object-cover" />
      </div>
      <p className="mt-1 text-center text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function ReviewQueueItem({
  item,
  selected,
  saving,
  onToggleSelected,
  onUpdateListing,
  onSave,
}: {
  item: ListingBatchItem;
  selected: boolean;
  saving: boolean;
  onToggleSelected: () => void;
  onUpdateListing: (listingId: string, updates: Partial<Listing>) => void;
  onSave: () => void;
}) {
  const listing = item.listing;
  const statusTone =
    item.status === "ready"
      ? "border-primary/30 bg-primary/5"
      : item.status === "needs_review"
        ? "border-amber-300 bg-amber-50"
        : item.status === "error"
          ? "border-destructive/40 bg-destructive/5"
          : "border-muted bg-muted/20";

  return (
    <div className={`rounded-xl border p-4 ${statusTone}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {listing && item.status === "ready" && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              className="size-4 accent-primary"
              aria-label="Select listing to publish"
            />
          )}
          <StatusBadge item={item} />
          {item.confidence_score != null && (
            <span className="text-xs text-muted-foreground">
              {String(Math.round(item.confidence_score * 100))}% confidence
            </span>
          )}
        </div>
        {listing && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/listings/${listing.id}`}>Open detail</Link>
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
              Save
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <PhotoPreview label="Front" url={item.front_photo_url} />
          {item.back_photo_url ? (
            <PhotoPreview label="Back" url={item.back_photo_url} />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed bg-background text-center text-xs text-muted-foreground">
              Missing back
            </div>
          )}
        </div>

        {listing ? (
          <EditableListingFields listing={listing} onUpdate={onUpdateListing} />
        ) : (
          <div className="rounded-lg bg-background p-4 text-sm">
            <p className="font-medium text-destructive">Autopilot could not create this draft</p>
            <p className="mt-1 text-muted-foreground">{item.error ?? "Unknown error"}</p>
          </div>
        )}
      </div>

      {item.needs_review_reasons.length > 0 && (
        <div className="mt-4 rounded-lg border bg-background p-3 text-sm">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <AlertCircle className="size-4 text-amber-600" />
            Needs review before publish
          </div>
          <ul className="space-y-1 text-muted-foreground">
            {item.needs_review_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EditableListingFields({
  listing,
  onUpdate,
}: {
  listing: Listing;
  onUpdate: (listingId: string, updates: Partial<Listing>) => void;
}) {
  const gameAspect = valueAsString(listing.ebay_aspects?.Game) || "Pokemon TCG";

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Card Name">
        <Input value={listing.card_name} onChange={(event) => onUpdate(listing.id, { card_name: event.target.value })} />
      </Field>
      <Field label="Set">
        <Input value={listing.set_name ?? ""} onChange={(event) => onUpdate(listing.id, { set_name: event.target.value || null })} />
      </Field>
      <Field label="Number">
        <Input value={listing.card_number ?? ""} onChange={(event) => onUpdate(listing.id, { card_number: event.target.value || null })} />
      </Field>
      <Field label="Rarity">
        <Input value={listing.rarity ?? ""} onChange={(event) => onUpdate(listing.id, { rarity: event.target.value || null })} />
      </Field>
      <Field label="Type">
        <select
          value={listing.card_type}
          onChange={(event) =>
            onUpdate(listing.id, {
              card_type: event.target.value === "graded" ? "graded" : "raw",
              condition: event.target.value === "graded" ? null : listing.condition ?? "NM",
              grading_company: event.target.value === "graded" ? listing.grading_company : null,
              grade: event.target.value === "graded" ? listing.grade : null,
              cert_number: event.target.value === "graded" ? listing.cert_number : null,
            })
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="raw">Raw</option>
          <option value="graded">Graded</option>
        </select>
      </Field>
      {listing.card_type === "graded" ? (
        <>
          <Field label="Grader">
            <select
              value={listing.grading_company ?? ""}
              onChange={(event) =>
                onUpdate(listing.id, {
                  grading_company: event.target.value
                    ? (event.target.value as Listing["grading_company"])
                    : null,
                })
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose grader</option>
              {GRADERS.map((grader) => (
                <option key={grader} value={grader}>{grader}</option>
              ))}
            </select>
          </Field>
          <Field label="Grade">
            <Input value={listing.grade ?? ""} onChange={(event) => onUpdate(listing.id, { grade: event.target.value || null })} />
          </Field>
          <Field label="Cert #">
            <Input value={listing.cert_number ?? ""} onChange={(event) => onUpdate(listing.id, { cert_number: event.target.value || null })} />
          </Field>
        </>
      ) : (
        <Field label="Condition">
          <select
            value={listing.condition ?? "NM"}
            onChange={(event) => onUpdate(listing.id, { condition: event.target.value as Listing["condition"] })}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>{condition}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Title">
        <Input value={listing.title ?? ""} onChange={(event) => onUpdate(listing.id, { title: event.target.value || null })} />
      </Field>
      <Field label="Price CAD">
        <Input
          inputMode="decimal"
          value={listing.price_cad ?? ""}
          onChange={(event) => {
            const nextPrice = Number(event.target.value);
            onUpdate(listing.id, {
              price_cad: event.target.value && Number.isFinite(nextPrice) ? nextPrice : null,
            });
          }}
        />
      </Field>
      <Field label="Listing Type">
        <select
          value={listing.listing_type}
          onChange={(event) => onUpdate(listing.id, { listing_type: event.target.value === "auction" ? "auction" : "fixed_price" })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="fixed_price">Fixed price</option>
          <option value="auction">Auction</option>
        </select>
      </Field>
      <Field label="eBay Game">
        <Input
          value={gameAspect}
          onChange={(event) =>
            onUpdate(listing.id, {
              ebay_aspects: {
                ...(listing.ebay_aspects ?? {}),
                Game: event.target.value,
              },
            })
          }
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function StatusBadge({ item }: { item: ListingBatchItem }) {
  if (item.status === "ready") {
    return (
      <Badge className="gap-1">
        <CheckCircle2 className="size-3" />
        Ready
      </Badge>
    );
  }

  if (item.status === "needs_review") {
    return <Badge variant="outline" className="border-amber-300 text-amber-700">Needs review</Badge>;
  }

  if (item.status === "error") {
    return <Badge variant="destructive">Error</Badge>;
  }

  return <Badge variant="secondary">Processing</Badge>;
}

function readyListingIds(batch: ListingBatchDetail): string[] {
  return batch.items
    .filter((item) => item.status === "ready" && item.listing?.id)
    .map((item) => item.listing?.id)
    .filter((id): id is string => Boolean(id));
}

function valueAsString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
