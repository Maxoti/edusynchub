"use client";

// app/activate/page.tsx
//
// Shown the moment a teacher logs in with onboardingPaid = false.
// Behind the frosted card sits a static, blurred mockup of the real
// upload dashboard — enough to make the destination tangible, not
// enough to be usable. That gap is the point.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { initiateActivationPayment, checkActivationStatus, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RouteGuard";

type Stage = "idle" | "awaiting_pin" | "success" | "failed";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

export default function ActivatePage() {
  return (
    <RequireAuth>
      <ActivationGate />
    </RequireAuth>
  );
}

function ActivationGate() {
  const { teacher, markActivated } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Already paid teachers shouldn't linger here if they land on this
  // URL directly (e.g. back button after activating).
  useEffect(() => {
    if (teacher?.onboardingPaid) router.replace("/dashboard/upload");
  }, [teacher, router]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const cleanupPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const startPolling = (checkoutRequestId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const { status } = await checkActivationStatus(checkoutRequestId);
        if (status === "PAID") {
          cleanupPolling();
          setStage("success");
          markActivated();
          setTimeout(() => router.replace("/dashboard/upload"), 1600);
        } else if (status === "FAILED") {
          cleanupPolling();
          setStage("failed");
          setError("Payment wasn't completed. You can try again.");
        }
      } catch {
        // transient network hiccup — let the loop retry
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      cleanupPolling();
      setStage((s) => (s === "awaiting_pin" ? "failed" : s));
      setError("We didn't hear back in time. Check your phone or try again.");
    }, POLL_TIMEOUT_MS);
  };

  const handlePay = async () => {
    setError(null);
    if (!/^0(7|1)\d{8}$/.test(phone)) {
      setError("Enter a valid Safaricom number, e.g. 0712345678.");
      return;
    }
    setStage("awaiting_pin");
    try {
      const { checkoutRequestId } = await initiateActivationPayment(phone);
      startPolling(checkoutRequestId);
    } catch (err) {
      setStage("failed");
      setError(err instanceof ApiError ? err.message : "Couldn't start the payment. Try again.");
    }
  };

  return (
    <div className="relative min-h-screen bg-[#16233D] overflow-hidden">
      <DashboardMockup />
      <div className="absolute inset-0 bg-[#16233D]/60 backdrop-blur-md" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white/95 rounded-2xl shadow-2xl border border-white/20 p-8">
          {stage !== "success" ? (
            <>
              <p className="text-xs tracking-[0.2em] uppercase text-[#C9972D] font-semibold mb-2">
                One step from your workspace
              </p>
              <h1 className="font-display text-2xl text-[#16233D] mb-2">
                {teacher ? `Almost there, ${teacher.name.split(" ")[0]}` : "Almost there"}
              </h1>
              <p className="text-sm text-[#6B7280] mb-6 leading-relaxed">
                A one-time KES 299 activation fee unlocks unlimited uploads and your
                secure cloud hosting — paid once, yours for good.
              </p>

              {stage === "idle" && (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-[#16233D] mb-1 block">
                      M-Pesa number
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0712345678"
                      className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-[#16233D] focus:outline-none focus:ring-2 focus:ring-[#C9972D]/40 focus:border-[#C9972D]"
                    />
                  </label>
                  <button
                    onClick={handlePay}
                    className="w-full bg-[#C9972D] text-[#16233D] rounded-xl py-3 font-semibold hover:bg-[#dba63a] transition-colors"
                  >
                    Pay KES 299 &amp; activate
                  </button>
                </div>
              )}

              {stage === "awaiting_pin" && (
                <div className="text-center py-4">
                  <Spinner />
                  <p className="text-[#16233D] font-medium mt-4">Check your phone</p>
                  <p className="text-sm text-[#6B7280] mt-1">
                    Enter your M-Pesa PIN on the prompt sent to {phone}.
                  </p>
                </div>
              )}

              {stage === "failed" && (
                <div className="space-y-4">
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {error}
                  </p>
                  <button
                    onClick={() => setStage("idle")}
                    className="w-full bg-[#16233D] text-white rounded-xl py-3 font-medium hover:bg-[#1e2f52] transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}

              {error && stage === "idle" && (
                <p className="text-sm text-red-600 mt-3">{error}</p>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-[#0F6E5C]/10 text-[#0F6E5C] flex items-center justify-center mx-auto mb-4 text-2xl">
                ✓
              </div>
              <h2 className="font-display text-2xl text-[#16233D]">You&apos;re activated</h2>
              <p className="text-sm text-[#6B7280] mt-2">Opening your dashboard…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="absolute inset-0 flex select-none pointer-events-none" aria-hidden="true">
      <div className="hidden md:block w-56 bg-[#101a30] p-5 space-y-6">
        <div className="h-4 w-24 rounded bg-white/10" />
        <div className="space-y-3">
          {["Upload", "My papers", "Earnings", "Payouts"].map((label) => (
            <div key={label} className="h-3 w-32 rounded bg-white/10" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-8">
        <div className="h-6 w-64 rounded bg-white/10 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-white/[0.06] border border-white/10" />
          ))}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="w-8 h-8 mx-auto rounded-full border-2 border-[#C9972D]/30 border-t-[#C9972D] animate-spin"
      role="status"
      aria-label="Waiting for payment"
    />
  );
}