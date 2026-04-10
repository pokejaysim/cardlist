import { useCallback, useState } from "react";
import { Upload, X, Image } from "lucide-react";

interface PhotoFile {
  file: File;
  preview: string;
  position: number;
}

interface PhotoUploaderProps {
  photos: PhotoFile[];
  onChange: (photos: PhotoFile[]) => void;
  maxPhotos?: number;
}

export function PhotoUploader({
  photos,
  onChange,
  maxPhotos = 4,
}: PhotoUploaderProps) {
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newPhotos: PhotoFile[] = [];
      const startPos = photos.length + 1;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file || !file.type.startsWith("image/")) continue;
        if (photos.length + newPhotos.length >= maxPhotos) break;

        newPhotos.push({
          file,
          preview: URL.createObjectURL(file),
          position: startPos + i,
        });
      }

      if (newPhotos.length > 0) {
        onChange([...photos, ...newPhotos]);
      }
    },
    [photos, onChange, maxPhotos]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  }

  function removePhoto(index: number) {
    const updated = photos.filter((_, i) => i !== index).map((p, i) => ({
      ...p,
      position: i + 1,
    }));
    onChange(updated);
  }

  const labels = ["Front", "Back", "Extra 1", "Extra 2"];

  return (
    <div className="space-y-4">
      {/* Thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <div key={photo.preview} className="group relative">
              <img
                src={photo.preview}
                alt={labels[index] ?? `Photo ${index + 1}`}
                className="h-32 w-full rounded-lg border object-cover"
              />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                {labels[index] ?? `#${index + 1}`}
              </span>
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white opacity-0 transition group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {photos.length < maxPhotos && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
        >
          {photos.length === 0 ? (
            <Image className="size-10 text-muted-foreground" />
          ) : (
            <Upload className="size-8 text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              {photos.length === 0
                ? "Upload card photos"
                : "Add more photos"}
            </p>
            <p className="text-xs text-muted-foreground">
              {photos.length === 0
                ? "Front and back of the card (drag & drop or click)"
                : `${maxPhotos - photos.length} remaining`}
            </p>
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      )}

      {photos.length > 0 && photos.length < 2 && (
        <p className="text-xs text-muted-foreground">
          Tip: Upload at least front and back for best identification results
        </p>
      )}
    </div>
  );
}

export type { PhotoFile };
