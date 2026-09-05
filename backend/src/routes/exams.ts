import { Router } from "express";
import { pool } from "../lib/db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";

const router = Router();

function toExamShape(row: any) {
  return {
    id: String(row.id),
    title: row.title,
    curriculum: row.curriculum,
    grade: row.grade,
    subject: row.subject,
    term: row.term,
    year: row.year,
    examType: row.exam_type,
    price: row.price,
    isApproved: row.is_approved,
    isBundle: row.is_bundle,
    createdAt: row.created_at,
  };
}

router.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM papers WHERE teacher_id = $1 ORDER BY created_at DESC`,
    [req.teacherId]
  );
  return res.json(rows.map(toExamShape));
});

router.post("/", requireAuth, requireActiveSubscription, async (req: AuthedRequest, res) => {
  const {
    title, curriculum, grade, subject, term, year,
    examType, price, fileKey, isBundle,
  } = req.body ?? {};

  if (!title || !curriculum || !grade || !subject || !term || !year || !price || !fileKey) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const inserted = await pool.query(
    `INSERT INTO papers
       (teacher_id, title, subject, price, file_key, curriculum, grade, exam_type, term, year, is_bundle, is_approved, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, true)
     RETURNING *`,
    [req.teacherId, title, subject, price, fileKey, curriculum, grade, examType, term, year, !!isBundle]
  );

  return res.status(201).json(toExamShape(inserted.rows[0]));
});

export default router;
