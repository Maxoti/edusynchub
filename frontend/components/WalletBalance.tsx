"use client";

import { useCallback, useEffect, useState } from "react";

const TOKEN_STORAGE_KEY = "edusync_token";

interface WalletData {
  availableBalance: number;
  minWithdrawal: number;
  canWithdraw: boolean;
}

export function WalletBalance() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/wallet/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setWallet(data);
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount pattern - setWallet happens after the await,
    // not synchronously during the effect's own execution, so this doesn't
    // cause the cascading-render issue the rule is meant to catch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBalance();
  }, [loadBalance]);

  async function handleWithdraw() {
    setWithdrawing(true);
    setMessage(null);
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/wallet/withdraw`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Withdrawal failed");
      } else {
        setMessage("Withdrawal initiated - check your phone.");
        await loadBalance();
      }
    } finally {
      setWithdrawing(false);
    }
  }

  if (!wallet) return <p>Loading balance...</p>;

  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: 16 }}>
      <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Available balance</p>
      <p style={{ fontSize: 28, fontWeight: 500, margin: "4px 0 12px" }}>
        KES {wallet.availableBalance}
      </p>

      <button
        onClick={handleWithdraw}
        disabled={!wallet.canWithdraw || withdrawing}
        style={{ width: "100%" }}
      >
        {withdrawing ? "Processing..." : "Withdraw"}
      </button>

      {!wallet.canWithdraw && (
        <p style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>
          Minimum withdrawal is KES {wallet.minWithdrawal}.
        </p>
      )}
      {message && <p style={{ fontSize: 13, marginTop: 8 }}>{message}</p>}
    </div>
  );
}
