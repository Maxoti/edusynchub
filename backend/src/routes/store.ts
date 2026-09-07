import { Router } from "express";
import { pool } from "../lib/db";

const router = Router();

router.get("/:slug", async (req, res) => {
  const teacherRow = await pool.query(
    `SELECT id, name, business_name, slug FROM teachers WHERE slug = $1`,
    [req.params.slug]
  );
  const teacher = teacherRow.rows[0];

  if (!teacher) {
    return res.status(404).json({ error: "Shop not found" });
  }

  const papersRow = await pool.query(
    `SELECT id, title, subject, price, curriculum, grade, exam_type, term, year, is_bundle
     FROM papers
     WHERE teacher_id = $1 AND active = true AND is_approved = true
     ORDER BY created_at DESC`,
    [teacher.id]
  );

  return res.json({
    teacher: {
      name: teacher.name,
      businessName: teacher.business_name,
    },
    papers: papersRow.rows.map((p) => ({
      id: String(p.id),
      title: p.title,
      subject: p.subject,
      price: p.price,
      curriculum: p.curriculum,
      grade: p.grade,
      examType: p.exam_type,
      term: p.term,
      year: p.year,
      isBundle: p.is_bundle,
    })),
  });
});

export default router;
