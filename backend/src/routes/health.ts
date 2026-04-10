import { Router } from "express";
import { supabase } from "../lib/supabase.js";

const router = Router();

router.get("/health", async (_req, res) => {
  const { error } = await supabase.from("users").select("id").limit(1);

  if (error) {
    res.status(503).json({ error: "Database unavailable", code: "DB_ERROR" });
    return;
  }

  res.json({ status: "ok" });
});

export default router;
