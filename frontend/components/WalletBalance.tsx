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
  const [amount, setAmount] = useState("");
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBalance();
  }, [loadBalance]);

  async function handleWithdraw() {
    setMessage(null);
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      setMessage("Enter a valid amount.");
      return;
    }

    setWithdrawing(true);
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/wallet/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: numericAmount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Withdrawal failed");
      } else {
        setMessage("Withdrawal initiated - check your phone.");
        setAmount("");
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

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Min KES ${wallet.minWithdrawal}`}
          min={wallet.minWithdrawal}
          max={wallet.availableBalance}
          style={{
            flex: 1,
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 14,
          }}
        />
        <button
          onClick={handleWithdraw}
          disabled={!wallet.canWithdraw || withdrawing}
          style={{ whiteSpace: "nowrap", padding: "0 16px" }}
        >
          {withdrawing ? "Processing..." : "Withdraw"}
        </button>
      </div>

      {!wallet.canWithdraw && (
        <p style={{ fontSize: 12, color: "#6B7280" }}>
          Minimum withdrawal is KES {wallet.minWithdrawal}.
        </p>
      )}
      {message && <p style={{ fontSize: 13, marginTop: 4 }}>{message}</p>}
    </div>
  );
}
