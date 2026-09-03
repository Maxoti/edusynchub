import { pool } from "./db";

export interface TeacherProfile {
  id: number;
  name: string;
  email: string;
  phone_number: string;
  business_name: string | null;
  onboardingPaid: boolean;
  subscriptionTier: string | null;
  subscriptionExpiresAt: string | null;
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

  return rows[0] ?? null;
}
