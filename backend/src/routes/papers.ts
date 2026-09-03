import { Router } from "express";
import { pool } from "../lib/db";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, subject, price, active, created_at
     FROM papers
     WHERE teacher_id = $1
     ORDER BY created_at DESC`,
    [req.teacherId]
  );
  return res.json({ papers: rows });
});

export default router;
