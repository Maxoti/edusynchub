"use client";

// app/login/page.tsx
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  // useSearchParams must be inside a Suspense boundary in the App Router
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const justRegistered = searchParams.get("registered") === "1";


  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const teacher = await login({ identifier: email, password });
      router.replace(teacher.onboardingPaid ? "/dashboard/upload" : "/activate");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Wrong email or password."
          : "Couldn't log you in. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 py-12">
      <Image
        src="/images/Kenyan.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[50%_35%]"
      />
      <div className="absolute inset-0 bg-[#1A56DB]/75" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs tracking-[0.2em] uppercase text-white/70 font-medium mb-2">
            EdusyncHub for educators
          </p>
          <h1 className="font-display text-3xl text-white">Welcome back</h1>
          {justRegistered && (
            <p className="text-sm text-[#0F6E5C] mt-2 bg-white rounded-lg px-3 py-2">
              Account created — log in to activate your dashboard.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-black/5 p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium mb-1 block">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9972D]/40 focus:border-[#C9972D]"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium mb-1 block">Password</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-black/10 pl-3 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9972D]/40 focus:border-[#C9972D]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[#6B7280] hover:text-[#16233D]"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#1A56DB] text-white rounded-xl py-3 font-medium hover:bg-[#1543ad] transition-colors disabled:opacity-60"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>

          <p className="text-center text-sm text-[#6B7280]">
            New here?{" "}
            <Link href="/signup" className="text-[#1A56DB] font-medium underline underline-offset-2">
              Create a free account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}