"use client";

// context/AuthContext.tsx
//
// Teacher auth state is synced from localStorage via useSyncExternalStore
// instead of useEffect + setState. Reading external storage in an effect
// and then calling setState causes an extra "cascading" render right after
// mount (React 19's react-hooks/set-state-in-effect warning) - this hook
// exists specifically to subscribe a component to state that lives outside
// React (localStorage here) without that extra render or a hydration flash.
//
// IMPORTANT: readTeacher() must return a STABLE reference when the
// underlying data hasn't changed. useSyncExternalStore compares snapshots
// with Object.is - if getSnapshot returns a new object every call (e.g.
// from JSON.parse on every read), React sees "state changed" on every
// render, re-renders, calls getSnapshot again, sees another new object,
// and loops forever (React error #185, Maximum update depth exceeded).
// The raw-string cache below is what prevents that.

import { createContext, useContext, useSyncExternalStore, useCallback, type ReactNode } from "react";
import { login as apiLogin, type LoginPayload, type Teacher } from "@/lib/api";

const STORAGE_KEY = "edusync_teacher";

type Listener = () => void;
let listeners: Listener[] = [];

// Cache so readTeacher() returns the same object reference across calls
// when the underlying localStorage value hasn't actually changed.
let cachedRaw: string | null = null;
let cachedTeacher: Teacher | null = null;

function readTeacher(): Teacher | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedTeacher;
  cachedRaw = raw;
  cachedTeacher = raw ? (JSON.parse(raw) as Teacher) : null;
  return cachedTeacher;
}

function subscribe(callback: Listener) {
  listeners.push(callback);
  window.addEventListener("storage", callback); // updates from other tabs
  return () => {
    listeners = listeners.filter((l) => l !== callback);
    window.removeEventListener("storage", callback);
  };
}

// Called after any local write to localStorage (login/logout/markActivated)
// so this tab's own subscribers re-render too - the native "storage" event
// only fires in *other* tabs, never the one that made the change.
function emitChange() {
  for (const listener of listeners) listener();
}

function getServerSnapshot(): Teacher | null {
  return null; // server never has a teacher - matches the logged-out UI, no mismatch
}

interface AuthContextValue {
  teacher: Teacher | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<Teacher>;
  logout: () => void;
  markActivated: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const teacher = useSyncExternalStore(subscribe, readTeacher, getServerSnapshot);

  const login = useCallback(async (payload: LoginPayload) => {
    const { token, teacher: t } = await apiLogin(payload);
    localStorage.setItem("edusync_token", token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    emitChange();
    return t;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("edusync_token");
    localStorage.removeItem(STORAGE_KEY);
    emitChange();
  }, []);

  const markActivated = useCallback(() => {
    const current = readTeacher();
    if (!current) return;
    const updated = { ...current, onboardingPaid: true };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    emitChange();
  }, []);

  return (
    <AuthContext.Provider
      value={{ teacher, isAuthenticated: !!teacher, login, logout, markActivated }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

