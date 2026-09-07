import { Router } from "express";
import { pool } from "../lib/db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { getPresignedDownloadUrl } from "../lib/r2";

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
    active: row.active,
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, true)
     RETURNING *`,
    [req.teacherId, title, subject, price, fileKey, curriculum, grade, examType, term, year, !!isBundle]
  );

  return res.status(201).json(toExamShape(inserted.rows[0]));
});

router.get("/:id/file-url", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT file_key FROM papers WHERE id = $1 AND teacher_id = $2`,
    [req.params.id, req.teacherId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: "Paper not found" });
  }

  try {
    const url = await getPresignedDownloadUrl(rows[0].file_key);
    return res.json({ url });
  } catch (err) {
    console.error("Failed to generate download URL:", err);
    return res.status(502).json({ error: "Could not generate file link" });
  }
});

// Metadata edit AND the active/inactive toggle both go through here -
// "delete" in the UI just means setting active = false, never a real
// row deletion, since purchases/ledger_entries hold a foreign key back
// to papers and a sale history should never be able to disappear.
router.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const {
    title, curriculum, grade, subject, term, year, examType, price, isBundle, active,
  } = req.body ?? {};

  const existing = await pool.query(
    `SELECT id FROM papers WHERE id = $1 AND teacher_id = $2`,
    [req.params.id, req.teacherId]
  );
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Paper not found" });
  }

  const updated = await pool.query(
    `UPDATE papers SET
       title = COALESCE($1, title),
       curriculum = COALESCE($2, curriculum),
       grade = COALESCE($3, grade),
       subject = COALESCE($4, subject),
       term = COALESCE($5, term),
       year = COALESCE($6, year),
       exam_type = COALESCE($7, exam_type),
       price = COALESCE($8, price),
       is_bundle = COALESCE($9, is_bundle),
       active = COALESCE($10, active)
     WHERE id = $11 AND teacher_id = $12
     RETURNING *`,
    [title, curriculum, grade, subject, term, year, examType, price, isBundle, active, req.params.id, req.teacherId]
  );

  return res.json(toExamShape(updated.rows[0]));
});

export default router;
