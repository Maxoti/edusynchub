// lib/api.ts
// Thin fetch wrapper. Points at your NestJS backend.
// NEXT_PUBLIC_ prefix is required for any env var read in the browser.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.edusynchub.co.ke";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null; // SSR/server-component safety
  return localStorage.getItem("edusync_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? "Request failed", res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Types ----

export interface Teacher {
  id: string;
  name: string;
  email: string;
  slug: string; // used for /store/[slug]
  onboardingPaid: boolean;
}

export interface LoginResponse {
  token: string;
  teacher: Teacher;
}

export interface SignUpPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface StkPushResponse {
  checkoutRequestId: string;
}

export type ActivationStatus = "PENDING" | "PAID" | "FAILED";

// ---- Auth endpoints ----

export const signUp = (payload: SignUpPayload) =>
  request<{ message: string }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const login = (payload: LoginPayload) =>
  request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

// ---- Activation payment endpoints ----

export const initiateActivationPayment = (phone: string) =>
  request<StkPushResponse>("/payments/activation/initiate", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });

export const checkActivationStatus = (checkoutRequestId: string) =>
  request<{ status: ActivationStatus }>(
    `/payments/activation/status/${checkoutRequestId}`
  );

// ---- Upload / exam endpoints ----

export type ExamType =
  | "Revision Materials"
  | "Topical Exams"
  | "Mid-Term Exams"
  | "End-Term Exams"
  | "Mock Exams"
  |"Mock Exams"
  | "Schemes of Work"
  | "Lesson Notes";

export interface Exam {
  id: string;
  title: string;
  curriculum: string;
  grade: string;
  subject: string;
  term: string;
  year: number;
  examType: ExamType;
  price: number;
  isApproved: boolean;
  isBundle: boolean;
  createdAt: string;
}

export interface PresignResponse {
  uploadUrl: string; // PUT the file here directly
  fileKey: string; // pass this back when creating the exam record
}

export interface CreateExamPayload {
  title: string;
  curriculum: string;
  grade: string;
  subject: string;
  term: string;
  year: number;
  examType: ExamType;
  price: number;
  fileKey: string;
  isBundle: boolean;
}

// Step 1: ask the backend for a short-lived R2 presigned PUT URL.
export const getPresignedUploadUrl = (fileName: string, fileType: string) =>
  request<PresignResponse>("/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ fileName, fileType }),
  });

// Step 2: upload the raw file straight to R2 using that URL. This goes
// directly to Cloudflare, not through your NestJS server, so a big PDF
// doesn't tie up your API — but it also means we can't use the shared
// `request()` helper (no auth header needed, no JSON body/response, and
// we want upload progress, which fetch doesn't expose).
export function uploadFileToR2(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError("Upload to storage failed", xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Network error during upload", 0));

    xhr.send(file);
  });
}

// Step 3: save the metadata + file key. Backend should insert with
// is_approved = false pending your manual review.
export const createExam = (payload: CreateExamPayload) =>
  request<Exam>("/exams", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listMyExams = () => request<Exam[]>("/exams/mine");