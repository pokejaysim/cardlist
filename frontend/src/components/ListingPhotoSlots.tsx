import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Image, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ListingPhotoSlotKey = "front" | "back" | "extra";

export interface ListingPhotoSlotFile {
  file: File;
  preview: string;
  position: number;
  slot: ListingPhotoSlotKey;
}

export type ListingPhotoSlots = Record<ListingPhotoSlotKey, ListingPhotoSlotFile | null>;

const SLOT_DEFINITIONS: Array<{
  key: ListingPhotoSlotKey;
  label: string;
  shortLabel: string;
  helper: string;
  position: number;
  required?: boolean;
}> = [
  {
    key: "front",
    label: "Front",
    shortLabel: "Front",
    helper: "Required. Used for AI identification and the main eBay photo.",
    position: 1,
    required: true,
  },
  {
    key: "back",
    label: "Back",
    shortLabel: "Back",
    helper: "Recommended. Buyers like seeing the actual card back.",
    position: 2,
  },
  {
    key: "extra",
    label: "Extra / Shipping Graphic",
    shortLabel: "Extra",
    helper: "Optional extra image. Use carefully: eBay prefers gallery photos to show the actual item.",
    position: 3,
  },
];

export const EMPTY_LISTING_PHOTO_SLOTS: ListingPhotoSlots = {
  front: null,
  back: null,
  extra: null,
};

export function listingPhotoSlotsToArray(slots: ListingPhotoSlots): ListingPhotoSlotFile[] {
  return SLOT_DEFINITIONS.map((slot) => slots[slot.key]).filter(
    (photo): photo is ListingPhotoSlotFile => Boolean(photo),
  );
}

interface ListingPhotoSlotsUploaderProps {
  slots: ListingPhotoSlots;
  onChange: (slots: ListingPhotoSlots) => void;
}

export function ListingPhotoSlotsUploader({
  slots,
  onChange,
}: ListingPhotoSlotsUploaderProps) {
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function createSlotPhoto(
    file: File,
    slot: (typeof SLOT_DEFINITIONS)[number],
  ): ListingPhotoSlotFile {
    return {
      file,
      preview: URL.createObjectURL(file),
      position: slot.position,
      slot: slot.key,
    };
  }

  function assignFilesByOrder(files: FileList | File[]) {
    const imageFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, SLOT_DEFINITIONS.length);

    if (imageFiles.length === 0) return;

    const nextSlots: ListingPhotoSlots = { ...slots };
    imageFiles.forEach((file, index) => {
      const slot = SLOT_DEFINITIONS[index];
      if (!slot) return;
      nextSlots[slot.key] = createSlotPhoto(file, slot);
    });
    onChange(nextSlots);
  }

  function replaceSlot(slotKey: ListingPhotoSlotKey, file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const slot = SLOT_DEFINITIONS.find((item) => item.key === slotKey);
    if (!slot) return;
    onChange({
      ...slots,
      [slotKey]: createSlotPhoto(file, slot),
    });
  }

  function removeSlot(slotKey: ListingPhotoSlotKey) {
    onChange({
      ...slots,
      [slotKey]: null,
    });
  }

  function swapFrontBack() {
    if (!slots.front || !slots.back) return;
    onChange({
      ...slots,
      front: { ...slots.back, slot: "front", position: 1 },
      back: { ...slots.front, slot: "back", position: 2 },
    });
  }

  function handleBulkInput(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files) assignFilesByOrder(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    assignFilesByOrder(event.dataTransfer.files);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-4 transition ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25"
        }`}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Front, back, then optional extra</p>
            <p className="text-xs text-muted-foreground">
              Drop up to 3 images here. File 1 = front, file 2 = back, file 3 = extra.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => bulkInputRef.current?.click()}
          >
            <Upload className="mr-1.5 size-4" />
            Add Photos
          </Button>
          <input
            ref={bulkInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleBulkInput}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {SLOT_DEFINITIONS.map((slot) => (
            <PhotoSlotCard
              key={slot.key}
              slot={slot}
              photo={slots[slot.key]}
              onReplace={(file) => replaceSlot(slot.key, file)}
              onRemove={() => removeSlot(slot.key)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!slots.front || !slots.back}
          onClick={swapFrontBack}
        >
          <ArrowLeftRight className="mr-1.5 size-4" />
          Swap front/back
        </Button>
      </div>

      {!slots.back && (
        <p className="text-xs text-muted-foreground">
          Back photo missing. Recommended for buyer trust.
        </p>
      )}

      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Optional extra images publish to eBay as listing photos. eBay prefers
          gallery photos to show the actual item, so use graphics sparingly.
        </p>
      </div>
    </div>
  );
}

function PhotoSlotCard({
  slot,
  photo,
  onReplace,
  onRemove,
}: {
  slot: (typeof SLOT_DEFINITIONS)[number];
  photo: ListingPhotoSlotFile | null;
  onReplace: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  const inputId = `listing-photo-slot-${slot.key}`;

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {slot.label}
            {slot.required ? " *" : ""}
          </p>
          <p className="text-xs text-muted-foreground">Photo #{String(slot.position)}</p>
        </div>
        {photo && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${slot.label} photo`}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <label
        htmlFor={inputId}
        className={`flex aspect-[3/4] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border text-center transition ${
          photo
            ? "border-border bg-muted"
            : "border-dashed border-muted-foreground/40 hover:bg-muted/50"
        }`}
      >
        {photo ? (
          <img
            src={photo.preview}
            alt={`${slot.shortLabel} preview`}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-3 text-xs text-muted-foreground">
            <Image className="size-8" />
            <span>{slot.shortLabel}</span>
            <span>Click to upload</span>
          </div>
        )}
      </label>

      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          onReplace(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <p className="mt-2 text-xs text-muted-foreground">{slot.helper}</p>
    </div>
  );
}
