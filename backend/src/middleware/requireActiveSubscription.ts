import { Response, NextFunction } from "express";
import { pool } from "../lib/db";
import { AuthedRequest } from "./auth";

function isOwnerEmail(email: string): boolean {
  const ownerEmails = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return ownerEmails.includes(email.toLowerCase());
}

export async function requireActiveSubscription(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const { rows } = await pool.query(
    `SELECT
       t.email,
       EXISTS (
         SELECT 1 FROM subscriptions s
         WHERE s.teacher_id = t.id AND s.status = 'active' AND s.expires_at > now()
       ) AS has_active
     FROM teachers t
     WHERE t.id = $1`,
    [req.teacherId]
  );

  const teacher = rows[0];

  if (!teacher) {
    return res.status(404).json({ error: "Teacher not found" });
  }

  if (!teacher.has_active && !isOwnerEmail(teacher.email)) {
    return res.status(403).json({
      error: "Your trial or subscription has expired. Pay KES 499 to continue.",
    });
  }

  next();
}
