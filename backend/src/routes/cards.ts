import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requirePlan } from "../middleware/requirePlan.js";
import { identifyCard } from "../services/claude/vision.js";

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

export default router;
