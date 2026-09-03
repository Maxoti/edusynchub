"use client";

// components/RouteGuard.tsx
//
// Client-side gate only — a UX convenience, not a security boundary.
// The NestJS API must independently reject any request from a teacher
// whose onboardingPaid claim is false. See note in lib/api.ts about
// switching to httpOnly cookies if you want real middleware-level
// enforcement later.
//
// router.replace() here is called inside an effect reacting to state
// that useSyncExternalStore already resolved correctly on first render —
// this is the "update an external system" half of the effect rule,
// not the "setState in an effect" half, so it doesn't trigger the warning.

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

export function RequirePaid({ children }: { children: ReactNode }) {
  const { teacher, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
    else if (!teacher?.onboardingPaid) router.replace("/activate");
  }, [isAuthenticated, teacher, router]);

  if (!isAuthenticated || !teacher?.onboardingPaid) return null;
  return <>{children}</>;
}