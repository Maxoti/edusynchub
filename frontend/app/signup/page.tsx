"use client";

// app/signup/page.tsx
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { signUp, ApiError } from "@/lib/api";

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await signUp(form);
      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
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
          <h1 className="font-display text-3xl text-white">Create your storefront</h1>
          <p className="text-sm text-white/80 mt-2">
            Free to sign up. No card, no fee, right now.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-black/5 p-6 space-y-4">
          <Field label="Full name" type="text" value={form.name} onChange={update("name")} required />
          <Field label="Email" type="email" value={form.email} onChange={update("email")} required />
          <Field
            label="Phone (M-Pesa number)"
            type="tel"
            value={form.phone}
            onChange={update("phone")}
            placeholder="07XXXXXXXX"
            required
          />
          <PasswordField label="Password" value={form.password} onChange={update("password")} required />
          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />

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
            {submitting ? "Creating account…" : "Create account"}
          </button>

          <p className="text-center text-sm text-[#6B7280]">
            Already have an account?{" "}
            <Link href="/login" className="text-[#1A56DB] font-medium underline underline-offset-2">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium mb-1 block">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-black/10 px-3 py-2.5 placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#C9972D]/40 focus:border-[#C9972D]"
      />
    </label>
  );
}

function PasswordField({
  label,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="text-sm font-medium mb-1 block">{label}</span>
      <div className="relative">
        <input
          {...props}
          type={visible ? "text" : "password"}
          className="w-full rounded-lg border border-black/10 pl-3 pr-10 py-2.5 placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#C9972D]/40 focus:border-[#C9972D]"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-[#6B7280] hover:text-[#16233D]"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}