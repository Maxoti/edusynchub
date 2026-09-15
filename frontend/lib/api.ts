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
  if (typeof window === "undefined") return null;
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
    throw new ApiError(body.message ?? body.error ?? "Request failed", res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Types ----

export interface Teacher {
  id: string;
  name: string;
  email: string;
  slug: string;
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
  active: boolean;
  createdAt: string;
}

export interface PresignResponse {
  uploadUrl: string;
  fileKey: string;
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

export type UpdateExamPayload = Partial<Omit<CreateExamPayload, "fileKey">> & {
  active?: boolean;
};

export const getPresignedUploadUrl = (fileName: string, fileType: string) =>
  request<PresignResponse>("/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ fileName, fileType }),
  });

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

export const createExam = (payload: CreateExamPayload) =>
  request<Exam>("/exams", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listMyExams = () => request<Exam[]>("/exams/mine");

export const updateExam = (id: string, payload: UpdateExamPayload) =>
  request<Exam>(`/exams/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const getFileUrl = (id: string) =>
  request<{ url: string }>(`/exams/${id}/file-url`);

// ---- Wallet endpoints ----

export interface WalletData {
  availableBalance: number;
  canWithdraw:      boolean;
}

export interface WithdrawResponse {
  message:    string;
  payoutId:   number;
  trackingId: string | null;
}

export const getWalletBalance = () =>
  request<WalletData>("/wallet/balance");

/**
 * Request a withdrawal of a specific amount.
 * Sends X-Idempotency-Key to prevent duplicate payouts from
 * double-taps or network retries.
 */
export const requestWithdrawal = (amount: number) =>
  request<WithdrawResponse>("/wallet/withdraw", {
    method: "POST",
    body:   JSON.stringify({ amount }),
    headers: {
      "X-Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });