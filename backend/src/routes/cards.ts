import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requirePlan } from "../middleware/requirePlan.js";
import { identifyCard } from "../services/claude/vision.js";
import { identifyCardsBatch } from "../services/claude/visionBatch.js";

const router = Router();

// Identify a card from a photo URL (Pro feature)
router.post("/cards/identify", requireAuth, requirePlan("ai_identify"), async (req, res) => {
  const { image_url } = req.body as { image_url?: string };

  if (!image_url) {
    res.status(400).json({ error: "image_url is required" });
    return;
  }

  try {
    const result = await identifyCard(image_url);
    res.json(result);
  } catch (err) {
    console.error("Card identification failed:", err);
    res.status(500).json({ error: "Card identification failed", code: "VISION_ERROR" });
  }
});

// Batch identify cards from multiple photo URLs
const MAX_BATCH_SIZE = 50;

router.post(
  "/cards/identify/batch",
  requireAuth,
  requirePlan("ai_identify"),
  async (req, res) => {
    const { image_urls } = req.body as { image_urls?: string[] };

    if (!Array.isArray(image_urls) || image_urls.length === 0) {
      res.status(400).json({ error: "image_urls must be a non-empty array" });
      return;
    }

    if (image_urls.length > MAX_BATCH_SIZE) {
      res.status(400).json({
        error: `Batch size ${String(image_urls.length)} exceeds maximum of ${String(MAX_BATCH_SIZE)}`,
      });
      return;
    }

    try {
      const results = await identifyCardsBatch(image_urls);
      res.json({ results });
    } catch (err) {
      console.error("Batch card identification failed:", err);
      res.status(500).json({ error: "Batch identification failed", code: "VISION_ERROR" });
    }
  },
);

export default router;
