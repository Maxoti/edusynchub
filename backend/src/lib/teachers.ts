import { pool } from "./db";

export interface TeacherProfile {
  id: number;
  name: string;
  email: string;
  phone_number: string;
  business_name: string | null;
  whatsapp_number: string | null;
  slug: string | null;
  onboardingPaid: boolean;
  subscriptionTier: string | null;
  subscriptionExpiresAt: string | null;
}

function isOwnerEmail(email: string): boolean {
  const ownerEmails = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return ownerEmails.includes(email.toLowerCase());
}

export async function getTeacherProfile(
  teacherId: number
): Promise<TeacherProfile | null> {
  const { rows } = await pool.query(
    `SELECT
       t.id,
       t.name,
       t.email,
       t.phone_number,
       t.business_name,
       t.whatsapp_number,
       t.slug,
       EXISTS (
         SELECT 1 FROM subscriptions s
         WHERE s.teacher_id = t.id
           AND s.status = 'active'
           AND s.expires_at > now()
       ) AS "onboardingPaid",
       (SELECT tier FROM subscriptions s
          WHERE s.teacher_id = t.id AND s.status = 'active' AND s.expires_at > now()
          ORDER BY s.expires_at DESC LIMIT 1) AS "subscriptionTier",
       (SELECT expires_at FROM subscriptions s
          WHERE s.teacher_id = t.id AND s.status = 'active' AND s.expires_at > now()
          ORDER BY s.expires_at DESC LIMIT 1) AS "subscriptionExpiresAt"
     FROM teachers t
     WHERE t.id = $1`,
    [teacherId]
  );

  const profile = rows[0] ?? null;

  if (profile && isOwnerEmail(profile.email)) {
    profile.onboardingPaid = true;
  }

  return profile;
}

const KENYAN_MOBILE_RE = /^(?:254|0)?7\d{8}$|^(?:254|0)?1\d{8}$/;

// Normalizes to 07XXXXXXXX / 01XXXXXXXX for storage (matches phone_number's
// existing convention in this codebase). Returns null if invalid.
export function normalizeKenyanMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const withoutCountryCode = digits.startsWith("254") ? `0${digits.slice(3)}` : digits;
  const candidate = withoutCountryCode.startsWith("0")
    ? withoutCountryCode
    : `0${withoutCountryCode}`;
  return KENYAN_MOBILE_RE.test(candidate) ? candidate : null;
}

export async function updateTeacherWhatsapp(
  teacherId: number,
  whatsappNumber: string | null
): Promise<void> {
  await pool.query(`UPDATE teachers SET whatsapp_number = $1 WHERE id = $2`, [
    whatsappNumber,
    teacherId,
  ]);
}