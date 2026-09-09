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

export async function requireOwner(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const { rows } = await pool.query(
    `SELECT email FROM teachers WHERE id = $1`,
    [req.teacherId]
  );
  const email = rows[0]?.email;

  if (!email || !isOwnerEmail(email)) {
    return res.status(403).json({ error: "Not authorized" });
  }

  next();
}
