import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import BatchPhotoGrid, { type BatchCard } from "@/components/BatchPhotoGrid";
import { Upload, Loader2, CheckCircle2, AlertCircle, Wand2 } from "lucide-react";
import {
  CANADA_BETA_CURRENCY_CODE,
  CANADA_BETA_MARKETPLACE_ID,
} from "../../../shared/types";

const MAX_BATCH_SIZE = 20;

interface IdentifyResult {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  condition: string;
  card_game: string;
  confidence: number;
}

interface BatchIdentifyResponse {
  results: Array<{
    index: number;
    image_url: string;
    status: "ok" | "error";
    result?: IdentifyResult;
    error?: string;
  }>;
}

export default function BatchUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState<BatchCard[]>([]);
  const [uploading, setUploading] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [createdCount, setCreatedCount] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  async function uploadFiles(fileList: File[]) {
    // Only accept images — browsers will happily hand us folders or other files
    // on drop, so filter here rather than relying on the input's accept attr.
    const imageFiles = fileList.filter((f) => f.type.startsWith("image/"));
    const files = imageFiles.slice(0, MAX_BATCH_SIZE - cards.length);
    if (files.length === 0) {
      if (fileList.length > 0 && imageFiles.length === 0) {
        setError("Only image files are supported.");
      }
      return;
    }

    setError("");
    setUploading(true);

    const token = localStorage.getItem("access_token");
    const apiBase = import.meta.env.VITE_API_URL || "/api";

    // Create placeholder cards immediately with local preview URLs
    const placeholders: BatchCard[] = files.map((file, i) => ({
      id: `temp-${Date.now()}-${String(i)}`,
      preview_url: URL.createObjectURL(file),
      file_url: null,
      status: "uploading",
      result: null,
      price_cad: "",
      error: null,
    }));

    setCards((prev) => [...prev, ...placeholders]);

    // Upload each file to Cloudinary
    const uploaded = await Promise.all(
      files.map(async (file, i) => {
        const placeholder = placeholders[i];
        if (!placeholder) return null;
        try {
          const formData = new FormData();
          formData.append("photo", file);
          const res = await fetch(`${apiBase}/photos/upload`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });
          if (!res.ok) throw new Error(`Upload failed: ${String(res.status)}`);
          const { url } = (await res.json()) as { url: string };
          return { id: placeholder.id, url };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          return { id: placeholder.id, error: message };
        }
      }),
    );

    // Update cards with uploaded URLs or errors
    setCards((prev) =>
      prev.map((card) => {
        const result = uploaded.find((u) => u?.id === card.id);
        if (!result) return card;
        if ("error" in result) {
          return { ...card, status: "error", error: result.error ?? "Upload failed" };
        }
        return { ...card, file_url: result.url, status: "ready" };
      }),
    );

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    void uploadFiles(Array.from(e.target.files));
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    // preventDefault is required — without it the browser ignores the drop
    // and falls back to "open the file in a new tab" on drop.
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (uploading) return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) void uploadFiles(dropped);
  }

  async function handleIdentifyAll() {
    const readyCards = cards.filter((c) => c.status === "ready" && c.file_url);
    if (readyCards.length === 0) return;

    setError("");
    setIdentifying(true);

    // Mark all ready cards as identifying
    setCards((prev) =>
      prev.map((c) => (c.status === "ready" ? { ...c, status: "identifying" } : c)),
    );

    try {
      const imageUrls = readyCards.map((c) => c.file_url as string);
      const response = await apiFetch<BatchIdentifyResponse>("/cards/identify/batch", {
        method: "POST",
        body: JSON.stringify({ image_urls: imageUrls }),
      });

      // Map results back to cards by file_url
      setCards((prev) =>
        prev.map((card) => {
          if (card.status !== "identifying") return card;
          const match = response.results.find((r) => r.image_url === card.file_url);
          if (!match) return card;
          if (match.status === "ok" && match.result) {
            return {
              ...card,
              status: "identified",
              result: match.result,
              price_cad: card.price_cad ?? "",
            };
          }
          return {
            ...card,
            status: "error",
            error: match.error ?? "Identification failed",
          };
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Identification failed";
      setError(message);
      setCards((prev) =>
        prev.map((c) => (c.status === "identifying" ? { ...c, status: "ready" } : c)),
      );
    } finally {
      setIdentifying(false);
    }
  }

  async function handleCreateListings() {
    const identifiedCards = cards.filter((c) => c.status === "identified" && c.result);
    if (identifiedCards.length === 0) return;

    setError("");
    setCreating(true);
    setCreatedCount(0);

    for (const card of identifiedCards) {
      if (!card.result) continue;
      try {
        const parsedPrice = card.price_cad ? Number(card.price_cad) : undefined;
        // Create the listing
        const listing = await apiFetch<{ id: string }>("/listings", {
          method: "POST",
          body: JSON.stringify({
            card_name: card.result.card_name,
            set_name: card.result.set_name,
            card_number: card.result.card_number,
            rarity: card.result.rarity,
            language: card.result.language,
            condition: card.result.condition,
            card_game: card.result.card_game,
            card_type: "raw",
            identified_by: "ai",
            listing_type: "fixed_price",
            duration: 7,
            price_cad:
              parsedPrice != null && Number.isFinite(parsedPrice)
                ? parsedPrice
                : undefined,
            marketplace_id: CANADA_BETA_MARKETPLACE_ID,
            currency_code: CANADA_BETA_CURRENCY_CODE,
          }),
        });

        // Attach the photo to the listing
        if (card.file_url) {
          const token = localStorage.getItem("access_token");
          const apiBase = import.meta.env.VITE_API_URL || "/api";
          // Re-fetch the image and upload it as a listing photo
          try {
            const imgRes = await fetch(card.file_url);
            const blob = await imgRes.blob();
            const formData = new FormData();
            formData.append("photo", blob, "card.jpg");
            formData.append("position", "1");
            await fetch(`${apiBase}/listings/${listing.id}/photos`, {
              method: "POST",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            });
          } catch (photoErr) {
            console.warn("Photo attachment failed:", photoErr);
          }
        }

        setCreatedCount((n) => n + 1);
      } catch (err) {
        console.error("Failed to create listing:", err);
      }
    }

    setCreating(false);
    // Navigate to dashboard after short delay
    setTimeout(() => navigate("/dashboard"), 1000);
  }

  function handleUpdateCard(id: string, updates: Partial<BatchCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }

  function handleRemoveCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  const readyCount = cards.filter((c) => c.status === "ready").length;
  const identifiedCount = cards.filter((c) => c.status === "identified").length;
  const errorCount = cards.filter((c) => c.status === "error").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Batch Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload up to {String(MAX_BATCH_SIZE)} card photos at once — we'll identify each card with AI.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Drop zone */}
      {cards.length === 0 && (
        <Card className="mb-6">
          <CardContent className="py-10">
            <label
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 transition ${
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
                <p className="font-medium">
                  {uploading
                    ? "Uploading..."
                    : isDraggingOver
                      ? "Drop to upload"
                      : "Drop photos here or click to select"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  JPG or PNG, up to {String(MAX_BATCH_SIZE)} photos
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
      )}

      {/* Status bar + actions */}
      {cards.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium">
              {String(cards.length)} / {String(MAX_BATCH_SIZE)} photos
            </span>
            {identifiedCount > 0 && (
              <span className="flex items-center gap-1.5 text-primary">
                <CheckCircle2 className="size-4" />
                {String(identifiedCount)} identified
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="size-4" />
                {String(errorCount)} failed
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {cards.length < MAX_BATCH_SIZE && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-1.5 size-4" />
                Add More
              </Button>
            )}
            {readyCount > 0 && (
              <Button size="sm" onClick={handleIdentifyAll} disabled={identifying}>
                {identifying ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-1.5 size-4" />
                )}
                {identifying ? "Identifying..." : `Identify ${String(readyCount)} card${readyCount === 1 ? "" : "s"}`}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
              disabled={uploading}
            />
          </div>
        </div>
      )}

      {/* Grid of cards */}
      {cards.length > 0 && (
        <BatchPhotoGrid
          cards={cards}
          onUpdateCard={handleUpdateCard}
          onRemoveCard={handleRemoveCard}
        />
      )}

      {/* Create listings CTA */}
      {identifiedCount > 0 && (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="font-medium">
              Ready to create {String(identifiedCount)} draft listing{identifiedCount === 1 ? "" : "s"}
            </p>
            <p className="text-sm text-muted-foreground">
              These will be eBay.ca/CAD drafts with photos attached. Add prices
              now to pass readiness faster, or finish pricing on each listing.
            </p>
          </div>
          <Button onClick={handleCreateListings} disabled={creating} size="lg">
            {creating ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Creating {String(createdCount)} / {String(identifiedCount)}...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1.5 size-4" />
                Create {String(identifiedCount)} Listings
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
