import { Response, NextFunction } from "express";
import { pool } from "../lib/db";
import { AuthedRequest } from "./auth";

export async function requireActiveSubscription(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const { rows } = await pool.query(
    `SELECT 1 FROM subscriptions
     WHERE teacher_id = $1 AND status = ''active'' AND expires_at > now()
     LIMIT 1`,
    [req.teacherId]
  );

  if (rows.length === 0) {
    return res.status(403).json({
      error: "Your trial or subscription has expired. Pay KES 499 to continue.",
    });
  }

  next();
}
