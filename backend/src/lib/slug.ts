import { pool } from "./db";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generates a unique, URL-safe slug from a teacher's name, appending
 * -2, -3, etc. if the base slug is already taken.
 */
export async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "teacher";
  let candidate = base;
  let suffix = 2;

  while (true) {
    const { rows } = await pool.query(
      `SELECT 1 FROM teachers WHERE slug = $1`,
      [candidate]
    );
    if (rows.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

