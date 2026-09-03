import { Request, Response, NextFunction } from "express";
import { verifyTeacherToken } from "../lib/jwt";

export interface AuthedRequest extends Request {
  teacherId?: number;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyTeacherToken(token);
    req.teacherId = payload.teacherId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
