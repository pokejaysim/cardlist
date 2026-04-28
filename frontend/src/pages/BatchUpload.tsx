/**
 * Batch Upload — slab/scanner edition.
 *
 * Two phases:
 *   1. Photo collection. User drops a stack of card photos. We pair them
 *      front/back in upload order. Each pair becomes a slab tile.
 *   2. Review queue. After "Run Autopilot" creates a batch, each item
 *      shows as its own slab with status chip, photos, editable fields,
 *      needs-review reasons, save + select-for-publish controls.
 *
 * Business logic preserved 1:1 — every state hook, mutation, and API
 * call from the previous shadcn version is unchanged.
 */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeftRight,
  Loader2,
  Rocket,
  Save,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  ChipMono,
  Slab,
  SlabButton,
  SlabField,
  SlabFieldGroup,
  SlabSelect,
  ToggleButton,
} from "@/components/slab";
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

  // ── Upload helpers (preserved) ─────────────────────────────

  async function uploadOneFile(file: File): Promise<UploadedPhoto> {
    const formData = new FormData();
    formData.append("photo", file);
    const response = await apiUpload<{ url?: string; file_url?: string }>(
      "/photos/upload",
      formData,
    );
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
          id: `pair-${String(Date.now())}-${String(index)}`,
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

  // ── Autopilot + review queue (preserved) ───────────────────

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
      setError(
        processError instanceof Error ? processError.message : "Autopilot failed.",
      );
    } finally {
      setProcessing(false);
    }
  }

  async function refreshBatch(batchId: string) {
    const refreshed = await apiFetch<ListingBatchDetail>(`/listing-batches/${batchId}`);
    setBatch(refreshed);
    setSelected(
      (current) =>
        new Set([...current].filter((id) => readyListingIds(refreshed).includes(id))),
    );
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

      const readiness = await apiFetch<EbayPublishReadiness>(
        `/listings/${listing.id}/publish-readiness`,
      );
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
      const published = response.results.filter(
        (result) => result.status === "published" || result.status === "publishing",
      ).length;
      const blocked = response.results.filter(
        (result) => result.status === "blocked" || result.status === "error",
      ).length;
      setPublishMessage(
        `${String(published)} listing${published === 1 ? "" : "s"} started publishing. ${String(blocked)} blocked or failed.`,
      );
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
  const missingBackCount = pairs.filter((p) => !p.back).length;

  return (
    <div style={{ padding: "20px 16px 60px", maxWidth: 1280, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div className="bu-header">
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 2,
              color: "var(--ink-soft)",
            }}
          >
            MODULE 03 · PROCESSING QUEUE
          </div>
          <div
            className="hand"
            style={{
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 4,
            }}
          >
            Auction floor.
          </div>
          <div
            style={{
              fontFamily: "var(--font-marker)",
              fontSize: 14,
              color: "var(--ink-soft)",
              marginTop: 6,
            }}
          >
            Drop a stack — we'll pair fronts/backs and identify each.
          </div>
        </div>
        {!batch && pairs.length > 0 && (
          <SlabButton primary size="lg" onClick={runAutopilot} disabled={processing || uploading}>
            {processing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            {processing ? `PROCESSING ${String(pairs.length)}…` : `▸ PROCESS ALL ${String(pairs.length)}`}
          </SlabButton>
        )}
      </div>

      {/* ── Banners ── */}
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
      {publishMessage && (
        <div
          style={{
            marginTop: 14,
            background: "var(--accent)",
            color: "var(--ink)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 1,
            border: "2px solid var(--ink)",
            fontWeight: 700,
          }}
        >
          ★ {publishMessage}
        </div>
      )}

      {/* ── Phase 1: drop + pairs ── */}
      {!batch && (
        <div style={{ marginTop: 18 }}>
          <DropZone
            uploading={uploading}
            isDraggingOver={isDraggingOver}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            onChange={handleFilesSelected}
            inputRef={fileInputRef}
          />

          {pairs.length > 0 && (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                border: "1.5px solid var(--ink)",
                background: "var(--paper-2)",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                <ChipMono solid>{String(pairs.length)} CARD PAIRS</ChipMono>
                {missingBackCount > 0 && (
                  <span style={{ color: "var(--ink-soft)" }}>
                    · {String(missingBackCount)} MISSING BACK
                  </span>
                )}
              </div>
              <SlabButton
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="size-3" />
                ADD MORE
              </SlabButton>
            </div>
          )}

          {pairs.length > 0 && (
            <div className="bu-pair-grid" style={{ marginTop: 14 }}>
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
        </div>
      )}

      {/* ── Phase 2: review queue ── */}
      {batch && (
        <div style={{ marginTop: 18 }}>
          {/* Status header */}
          <div
            style={{
              background: "var(--ink)",
              color: "var(--paper)",
              padding: 16,
              border: "2px solid var(--ink)",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div
              className="halftone"
              style={{ position: "absolute", inset: 0, opacity: 0.06 }}
            />
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: "var(--accent)",
                }}
              >
                ● BATCH REVIEW QUEUE
              </div>
              <div
                className="hand"
                style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}
              >
                {String(batch.summary_counts.ready)} ready ·{" "}
                {String(batch.summary_counts.needs_review)} need review ·{" "}
                {String(batch.summary_counts.error)} failed
              </div>
            </div>
            <div
              style={{
                position: "relative",
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <SlabButton
                onClick={() => void refreshBatch(batch.id)}
                style={{ background: "var(--paper)" }}
              >
                REFRESH
              </SlabButton>
              <SlabButton
                primary
                onClick={publishSelected}
                disabled={publishing || selectedReadyCount === 0}
              >
                {publishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Rocket className="size-4" />
                )}
                ▸ PUBLISH {String(selectedReadyCount)}
              </SlabButton>
            </div>
          </div>

          {/* Review items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
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
        </div>
      )}

      <style>{`
        .bu-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .bu-pair-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }
        .bu-fields-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        @media (max-width: 600px) {
          .bu-fields-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// ── Drop zone (intake bay) ────────────────────────────────────

function DropZone({
  uploading,
  isDraggingOver,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onChange,
  inputRef,
}: {
  uploading: boolean;
  isDraggingOver: boolean;
  onDragOver: React.DragEventHandler<HTMLLabelElement>;
  onDragEnter: React.DragEventHandler<HTMLLabelElement>;
  onDragLeave: React.DragEventHandler<HTMLLabelElement>;
  onDrop: React.DragEventHandler<HTMLLabelElement>;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display: "block",
        cursor: "pointer",
        border: `2px dashed ${isDraggingOver ? "var(--accent)" : "var(--ink)"}`,
        background: isDraggingOver ? "var(--accent-soft)" : "var(--paper-2)",
        padding: 36,
        textAlign: "center",
        position: "relative",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div
        className="halftone"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.08,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 2,
            color: "var(--ink-soft)",
            fontWeight: 700,
          }}
        >
          ↓ INTAKE BAY
        </div>
        <div
          className="hand"
          style={{ fontSize: 28, fontWeight: 700, marginTop: 6, lineHeight: 1 }}
        >
          {uploading ? "Uploading…" : "Drop card photos here."}
        </div>
        <div
          style={{
            fontFamily: "var(--font-marker)",
            fontSize: 13,
            color: "var(--ink-soft)",
            marginTop: 6,
          }}
        >
          File 1 = front, file 2 = back, file 3 = next front… up to 20 pairs.
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            justifyContent: "center",
            marginTop: 14,
            flexWrap: "wrap",
          }}
        >
          <ChipMono>JPG</ChipMono>
          <ChipMono>PNG</ChipMono>
          <ChipMono>HEIC</ChipMono>
          <ChipMono solid>{`${String(MAX_BATCH_PAIRS)} PAIRS MAX`}</ChipMono>
        </div>
        {uploading && (
          <Loader2
            className="size-5 animate-spin"
            style={{
              color: "var(--ink-soft)",
              marginTop: 12,
              display: "inline-block",
            }}
          />
        )}
      </div>
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

// ── Photo pair tile (Phase 1) ────────────────────────────────

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
    <div
      style={{
        background: "var(--paper)",
        border: "2px solid var(--ink)",
        boxShadow: "3px 3px 0 var(--ink)",
        position: "relative",
      }}
    >
      <div
        style={{
          background: "var(--ink)",
          color: "var(--paper)",
          padding: "6px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              background: "var(--accent)",
              color: "var(--ink)",
              padding: "1px 6px",
              fontWeight: 700,
            }}
          >
            {String(position).padStart(2, "0")}
          </span>
          <span>CARD PAIR</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove pair"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--paper)",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <X className="size-4" />
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          padding: 8,
        }}
      >
        <PhotoTile label="FRONT" url={pair.front.preview_url} />
        {pair.back ? (
          <PhotoTile label="BACK" url={pair.back.preview_url} />
        ) : (
          <label
            style={{
              aspectRatio: "5/7",
              border: "1.5px dashed var(--ink-soft)",
              background: "var(--paper-2)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: 1.5,
              color: "var(--ink-soft)",
              padding: 8,
              textAlign: "center",
            }}
          >
            <Upload className="size-4" />
            ADD BACK
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(event) => onAddBack(event.target.files?.[0])}
            />
          </label>
        )}
      </div>
      <div
        style={{
          borderTop: "1.5px solid var(--ink)",
          padding: 8,
          background: "var(--paper-2)",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <SlabButton size="sm" onClick={onSwap}>
          <ArrowLeftRight className="size-3" />
          SWAP
        </SlabButton>
        {!pair.back && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: 1,
              padding: "3px 6px",
              background: "#f5a623",
              color: "var(--ink)",
              fontWeight: 700,
              border: "1.5px solid var(--ink)",
            }}
          >
            ? FRONT ONLY
          </span>
        )}
      </div>
    </div>
  );
}

function PhotoTile({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <div
        style={{
          aspectRatio: "5/7",
          background: "var(--paper-2)",
          border: "1.5px solid var(--ink)",
          overflow: "hidden",
        }}
      >
        <img
          src={url}
          alt={`${label} card`}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: 1.5,
          color: "var(--ink-soft)",
          textAlign: "center",
          marginTop: 4,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Review queue item (Phase 2) ──────────────────────────────

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
  const status = item.status;
  const statusInfo = batchItemStatusInfo(status);

  return (
    <Slab
      yellow={status === "ready"}
      grade={statusInfo.grade}
      label={statusInfo.label}
      cert={
        item.confidence_score != null
          ? `${String(Math.round(item.confidence_score * 100))}% MATCH`
          : statusInfo.cert
      }
      foot={
        listing
          ? (
              <>
                <span>{listing.card_type === "graded" ? "GRADED CARD" : "RAW CARD"}</span>
                <span>SAVE TO MARK READY</span>
              </>
            )
          : (
              <>
                <span>AUTOPILOT FAILED</span>
                <span>CHECK PHOTOS</span>
              </>
            )
      }
    >
      {/* Top action row — selection + buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {listing && status === "ready" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 1,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelected}
                style={{
                  width: 16,
                  height: 16,
                  accentColor: "var(--ink)",
                  cursor: "pointer",
                }}
                aria-label="Select listing to publish"
              />
              SELECT FOR PUBLISH
            </label>
          )}
        </div>
        {listing && (
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              to={`/listings/${listing.id}`}
              className="btn sm"
              style={{ textDecoration: "none" }}
            >
              OPEN DETAIL →
            </Link>
            <SlabButton primary size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              SAVE
            </SlabButton>
          </div>
        )}
      </div>

      {/* Body: photos + form */}
      <div className="bu-review-body" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <PhotoTile label="FRONT" url={item.front_photo_url} />
          {item.back_photo_url ? (
            <PhotoTile label="BACK" url={item.back_photo_url} />
          ) : (
            <div
              style={{
                aspectRatio: "5/7",
                border: "1.5px dashed var(--ink-soft)",
                background: "var(--paper-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: 1.5,
                color: "var(--ink-soft)",
                fontWeight: 700,
              }}
            >
              MISSING BACK
            </div>
          )}
        </div>

        {listing ? (
          <EditableListingFields listing={listing} onUpdate={onUpdateListing} />
        ) : (
          <div
            style={{
              padding: 14,
              border: "2px solid #c44536",
              background: "rgba(196,69,54,0.05)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: 1,
                color: "#c44536",
                fontWeight: 700,
              }}
            >
              ! AUTOPILOT COULD NOT CREATE THIS DRAFT
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
              {item.error ?? "Unknown error"}
            </div>
          </div>
        )}
      </div>

      {/* Needs review reasons */}
      {item.needs_review_reasons.length > 0 && (
        <div
          style={{
            marginTop: 14,
            border: "1.5px solid #f5a623",
            background: "rgba(245,166,35,0.08)",
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: 700,
              color: "var(--ink)",
              marginBottom: 6,
            }}
          >
            <AlertCircle className="size-3.5" />
            ? NEEDS REVIEW BEFORE PUBLISH
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
            {item.needs_review_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        @media (min-width: 900px) {
          .bu-review-body {
            grid-template-columns: 200px 1fr !important;
          }
        }
      `}</style>
    </Slab>
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
    <div className="bu-fields-grid">
      <SlabField
        id={`name-${listing.id}`}
        label="CARD NAME"
        value={listing.card_name}
        onChange={(v) => onUpdate(listing.id, { card_name: v })}
      />
      <SlabField
        id={`set-${listing.id}`}
        label="SET"
        value={listing.set_name ?? ""}
        onChange={(v) => onUpdate(listing.id, { set_name: v || null })}
      />
      <SlabField
        id={`number-${listing.id}`}
        label="NUMBER"
        value={listing.card_number ?? ""}
        onChange={(v) => onUpdate(listing.id, { card_number: v || null })}
      />
      <SlabField
        id={`rarity-${listing.id}`}
        label="RARITY"
        value={listing.rarity ?? ""}
        onChange={(v) => onUpdate(listing.id, { rarity: v || null })}
      />

      <SlabFieldGroup label="CARD TYPE">
        <div style={{ display: "flex", gap: 6 }}>
          <ToggleButton
            active={listing.card_type === "raw"}
            onClick={() =>
              onUpdate(listing.id, {
                card_type: "raw",
                condition: listing.condition ?? "NM",
                grading_company: null,
                grade: null,
                cert_number: null,
              })
            }
            size="sm"
          >
            RAW
          </ToggleButton>
          <ToggleButton
            active={listing.card_type === "graded"}
            onClick={() =>
              onUpdate(listing.id, {
                card_type: "graded",
                condition: null,
              })
            }
            size="sm"
          >
            GRADED
          </ToggleButton>
        </div>
      </SlabFieldGroup>

      {listing.card_type === "graded" ? (
        <>
          <SlabFieldGroup label="GRADER">
            <SlabSelect
              value={listing.grading_company ?? ""}
              onChange={(v) =>
                onUpdate(listing.id, {
                  grading_company: v ? (v as Listing["grading_company"]) : null,
                })
              }
              options={[
                { value: "", label: "Choose grader" },
                ...GRADERS.map((g) => ({ value: g, label: g })),
              ]}
            />
          </SlabFieldGroup>
          <SlabField
            id={`grade-${listing.id}`}
            label="GRADE"
            value={listing.grade ?? ""}
            onChange={(v) => onUpdate(listing.id, { grade: v || null })}
          />
          <SlabField
            id={`cert-${listing.id}`}
            label="CERT #"
            value={listing.cert_number ?? ""}
            onChange={(v) => onUpdate(listing.id, { cert_number: v || null })}
          />
        </>
      ) : (
        <SlabFieldGroup label="CONDITION">
          <div style={{ display: "flex", gap: 4 }}>
            {CONDITIONS.map((c) => (
              <ToggleButton
                key={c}
                active={listing.condition === c}
                onClick={() => onUpdate(listing.id, { condition: c })}
                size="sm"
              >
                {c}
              </ToggleButton>
            ))}
          </div>
        </SlabFieldGroup>
      )}

      <SlabField
        id={`title-${listing.id}`}
        label="EBAY TITLE"
        value={listing.title ?? ""}
        onChange={(v) => onUpdate(listing.id, { title: v || null })}
        style={{ gridColumn: "1 / -1" }}
      />
      <SlabField
        id={`price-${listing.id}`}
        label="PRICE CAD"
        inputMode="decimal"
        value={listing.price_cad != null ? String(listing.price_cad) : ""}
        onChange={(v) => {
          const nextPrice = Number(v);
          onUpdate(listing.id, {
            price_cad: v && Number.isFinite(nextPrice) ? nextPrice : null,
          });
        }}
      />
      <SlabFieldGroup label="LISTING TYPE">
        <SlabSelect
          value={listing.listing_type}
          onChange={(v) =>
            onUpdate(listing.id, {
              listing_type: v === "auction" ? "auction" : "fixed_price",
            })
          }
          options={[
            { value: "fixed_price", label: "Fixed price" },
            { value: "auction", label: "Auction" },
          ]}
        />
      </SlabFieldGroup>
      <SlabField
        id={`game-${listing.id}`}
        label="EBAY GAME ASPECT"
        value={gameAspect}
        onChange={(v) =>
          onUpdate(listing.id, {
            ebay_aspects: {
              ...(listing.ebay_aspects ?? {}),
              Game: v,
            },
          })
        }
        style={{ gridColumn: "1 / -1" }}
      />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function batchItemStatusInfo(
  status: ListingBatchItem["status"],
): { grade: string; label: string; cert: string } {
  switch (status) {
    case "ready":
      return { grade: "✓", label: "READY TO PUBLISH", cert: "VERIFIED" };
    case "needs_review":
      return { grade: "?", label: "NEEDS REVIEW", cert: "FIX BELOW" };
    case "error":
      return { grade: "!", label: "AUTOPILOT ERROR", cert: "RETRY" };
    default:
      return { grade: "⟳", label: "PROCESSING", cert: "PENDING" };
  }
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

