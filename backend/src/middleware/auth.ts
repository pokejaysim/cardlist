import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token", code: "UNAUTHORIZED" });
    return;
  }

  const token = header.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token", code: "UNAUTHORIZED" });
    return;
  }

  (req as AuthenticatedRequest).userId = data.user.id;
  (req as AuthenticatedRequest).userEmail = data.user.email ?? "";
  next();
}
