import jwt, { type SignOptions } from "jsonwebtoken";

const JWT_SECRET: string = process.env.JWT_SECRET ?? "";
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in the environment");
}

export interface TeacherTokenPayload {
  teacherId: number;
}

export function signTeacherToken(teacherId: number): string {
  const payload: TeacherTokenPayload = { teacherId };
  const options: SignOptions = { expiresIn: "7d" };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyTeacherToken(token: string): TeacherTokenPayload {
  return jwt.verify(token, JWT_SECRET) as TeacherTokenPayload;
}
