import { Router } from "express";
import multer from "multer";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { uploadPhoto } from "../services/storage.js";
import { supabase } from "../lib/supabase.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Upload photo for a listing
router.post(
  "/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const file = req.file;
    const { listing_id, position } = req.body as {
      listing_id?: string;
      position?: string;
    };

    if (!file) {
      res.status(400).json({ error: "No photo uploaded" });
      return;
    }

    if (!listing_id) {
      res.status(400).json({ error: "listing_id is required" });
      return;
    }

    // Verify the listing belongs to this user
    const { data: listing } = await supabase
      .from("listings")
      .select("id")
      .eq("id", listing_id)
      .eq("user_id", authReq.userId)
      .single();

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    try {
      const { url } = await uploadPhoto(file.buffer, `listings/${listing_id}`);

      const { data: photo, error } = await supabase
        .from("photos")
        .insert({
          listing_id,
          file_url: url,
          position: Number(position ?? 1),
        })
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: "Failed to save photo record", code: "DB_ERROR" });
        return;
      }

      res.status(201).json(photo);
    } catch (err) {
      console.error("Photo upload failed:", err);
      res.status(500).json({ error: "Photo upload failed", code: "UPLOAD_ERROR" });
    }
  }
);

// Get photos for a listing
router.get("/photos/:listing_id", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  // Verify ownership
  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("id", req.params.listing_id)
    .eq("user_id", authReq.userId)
    .single();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("listing_id", req.params.listing_id)
    .order("position");

  res.json(photos ?? []);
});

// Delete a photo
router.delete("/photos/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  // Verify ownership via listing join
  const { data: photo } = await supabase
    .from("photos")
    .select("*, listings!inner(user_id)")
    .eq("id", req.params.id)
    .single();

  if (
    !photo ||
    (photo as Record<string, unknown> & { listings: { user_id: string } }).listings.user_id !== authReq.userId
  ) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  await supabase.from("photos").delete().eq("id", req.params.id);
  res.json({ message: "Photo deleted" });
});

export default router;
