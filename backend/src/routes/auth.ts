import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../lib/db";
import { signTeacherToken } from "../lib/jwt";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getTeacherProfile } from "../lib/teachers";

const router = Router();

router.post("/signup", async (req, res) => {
  const { name, email, phone, password } = req.body ?? {};

  if (!name || !email || !phone || !password) {
    return res
      .status(400)
      .json({ error: "name, email, phone and password are all required" });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM teachers WHERE email = $1 OR phone_number = $2`,
      [email, phone]
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "An account with that email or phone already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const inserted = await client.query(
      `INSERT INTO teachers (name, email, phone_number, pochi_number, password_hash, status)
       VALUES ($1, $2, $3, $3, $4, 'active')
       RETURNING id`,
      [name, email, phone, passwordHash]
    );
    const teacherId = inserted.rows[0].id;

    await client.query(
      `INSERT INTO ledger_accounts (teacher_id, account_type) VALUES ($1, 'teacher_payable')`,
      [teacherId]
    );

    // 3-day free trial: expires_at drives the same onboardingPaid check
    // that will later be satisfied by a real KES 499 monthly payment,
    // so no separate "lock" logic is needed once this expires.
    await client.query(
      `INSERT INTO subscriptions (teacher_id, tier, status, expires_at)
       VALUES ($1, 'trial', 'active', now() + interval '3 days')`,
      [teacherId]
    );

    await client.query("COMMIT");

    const token = signTeacherToken(teacherId);
    const teacher = await getTeacherProfile(teacherId);

    return res.status(201).json({ token, teacher });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Signup failed:", err);
    return res.status(500).json({ error: "Could not create account" });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { identifier, password } = req.body ?? {};

  if (!identifier || !password) {
    return res
      .status(400)
      .json({ error: "identifier and password are required" });
  }

  const { rows } = await pool.query(
    `SELECT id, password_hash FROM teachers WHERE email = $1 OR phone_number = $1`,
    [identifier]
  );
  const teacherRow = rows[0];

  if (!teacherRow) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const passwordMatches = await bcrypt.compare(
    password,
    teacherRow.password_hash
  );
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signTeacherToken(teacherRow.id);
  const teacher = await getTeacherProfile(teacherRow.id);

  return res.json({ token, teacher });
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const teacher = await getTeacherProfile(req.teacherId!);
  if (!teacher) {
    return res.status(404).json({ error: "Teacher not found" });
  }
  return res.json({ teacher });
});

export default router;
