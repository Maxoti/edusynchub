"use client";

import { useEffect, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Purchase = {
  id: string;
  amount: number;
  status: string;
  phone_number: string;
  mpesa_receipt: string | null;
  created_at: string;
  paper_title: string;
  teacher_name: string;
  teacher_id: string;
};

type Payout = {
  id: string;
  amount: number;
  status: string;
  failure_reason: string | null;
  requested_at: string;
  completed_at: string | null;
  teacher_name: string;
  pochi_number: string;
  teacher_id: string;
};

type Balance = {
  teacher_id: string;
  name: string;
  available_balance: number;
};

type Tab = "purchases" | "payouts" | "balances";

function money(n: number) {
  return `KES ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function statusColor(status: string) {
  switch (status) {
    case "completed":
    case "success":
      return "#15803d";
    case "pending":
    case "requested":
      return "#b45309";
    case "failed":
      return "#b91c1c";
    default:
      return "#374151";
  }
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("purchases");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const authedFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }),
    [token]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, poRes, bRes] = await Promise.all([
        authedFetch("/admin/purchases"),
        authedFetch("/admin/payouts"),
        authedFetch("/admin/balances"),
      ]);

      if (pRes.status === 403 || poRes.status === 403 || bRes.status === 403) {
        throw new Error("Not authorized — this account isn't an owner email.");
      }
      if (!pRes.ok || !poRes.ok || !bRes.ok) {
        throw new Error("One or more admin endpoints failed to load.");
      }

      setPurchases(await pRes.json());
      setPayouts(await poRes.json());
      setBalances(await bRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function markComplete(id: string) {
    if (!confirm("Mark this payout as completed? This writes a ledger debit.")) {
      return;
    }
    setCompletingId(id);
    try {
      const res = await authedFetch(`/admin/payouts/${id}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to complete payout");
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to complete payout");
    } finally {
      setCompletingId(null);
    }
  }

  const totalOwed = balances.reduce((sum, b) => sum + Number(b.available_balance), 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>EdusyncHub Admin</h1>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "6px 12px",
            fontSize: 13,
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: "10px 14px",
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        {(["purchases", "payouts", "balances"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: tab === t ? 600 : 400,
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid #1A56DB" : "2px solid transparent",
              color: tab === t ? "#1A56DB" : "#374151",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "purchases" && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", color: "#6b7280" }}>
              <th style={{ padding: "6px 8px" }}>Date</th>
              <th style={{ padding: "6px 8px" }}>Teacher</th>
              <th style={{ padding: "6px 8px" }}>Paper</th>
              <th style={{ padding: "6px 8px" }}>Phone</th>
              <th style={{ padding: "6px 8px" }}>Receipt</th>
              <th style={{ padding: "6px 8px" }}>Amount</th>
              <th style={{ padding: "6px 8px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 8px" }}>{new Date(p.created_at).toLocaleString()}</td>
                <td style={{ padding: "6px 8px" }}>{p.teacher_name}</td>
                <td style={{ padding: "6px 8px" }}>{p.paper_title}</td>
                <td style={{ padding: "6px 8px" }}>{p.phone_number}</td>
                <td style={{ padding: "6px 8px" }}>{p.mpesa_receipt ?? "—"}</td>
                <td style={{ padding: "6px 8px" }}>{money(p.amount)}</td>
                <td style={{ padding: "6px 8px", color: statusColor(p.status), fontWeight: 500 }}>
                  {p.status}
                </td>
              </tr>
            ))}
            {purchases.length === 0 && !loading && (
              <tr>
                <td colSpan={7} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                  No purchases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {tab === "payouts" && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", color: "#6b7280" }}>
              <th style={{ padding: "6px 8px" }}>Requested</th>
              <th style={{ padding: "6px 8px" }}>Teacher</th>
              <th style={{ padding: "6px 8px" }}>Pochi</th>
              <th style={{ padding: "6px 8px" }}>Amount</th>
              <th style={{ padding: "6px 8px" }}>Status</th>
              <th style={{ padding: "6px 8px" }}>Completed</th>
              <th style={{ padding: "6px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((po) => (
              <tr key={po.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 8px" }}>{new Date(po.requested_at).toLocaleString()}</td>
                <td style={{ padding: "6px 8px" }}>{po.teacher_name}</td>
                <td style={{ padding: "6px 8px" }}>{po.pochi_number}</td>
                <td style={{ padding: "6px 8px" }}>{money(po.amount)}</td>
                <td style={{ padding: "6px 8px", color: statusColor(po.status), fontWeight: 500 }}>
                  {po.status}
                  {po.failure_reason && (
                    <div style={{ color: "#9ca3af", fontWeight: 400, fontSize: 11 }}>
                      {po.failure_reason}
                    </div>
                  )}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {po.completed_at ? new Date(po.completed_at).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {po.status !== "completed" && (
                    <button
                      onClick={() => markComplete(po.id)}
                      disabled={completingId === po.id}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        border: "1px solid #1A56DB",
                        borderRadius: 6,
                        background: "#fff",
                        color: "#1A56DB",
                        cursor: "pointer",
                      }}
                    >
                      {completingId === po.id ? "Completing…" : "Mark complete"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {payouts.length === 0 && !loading && (
              <tr>
                <td colSpan={7} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                  No payouts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {tab === "balances" && (
        <div>
          <div style={{ marginBottom: 12, fontSize: 14, color: "#374151" }}>
            Total owed to teachers: <strong>{money(totalOwed)}</strong>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", color: "#6b7280" }}>
                <th style={{ padding: "6px 8px" }}>Teacher</th>
                <th style={{ padding: "6px 8px" }}>Available balance</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.teacher_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "6px 8px" }}>{b.name}</td>
                  <td style={{ padding: "6px 8px" }}>{money(b.available_balance)}</td>
                </tr>
              ))}
              {balances.length === 0 && !loading && (
                <tr>
                  <td colSpan={2} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                    No outstanding balances.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
