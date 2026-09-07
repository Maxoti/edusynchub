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
        setMessage("Withdrawal initiated — check your phone.");
        await loadBalance();
      }
    } finally {
      setWithdrawing(false);
    }
  }

  if (!wallet) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-6">
        <p className="text-sm text-[#6B7280]">Loading balance...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6">
      <p className="text-xs tracking-wide uppercase text-[#6B7280] mb-1">
        Available balance
      </p>
      <p className="font-display text-3xl text-[#16233D] mb-4">
        KES {wallet.availableBalance}
      </p>

      <button
        onClick={handleWithdraw}
        disabled={!wallet.canWithdraw || withdrawing}
        className="w-full bg-[#1A56DB] text-white rounded-xl py-3 font-medium hover:bg-[#1543ad] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          width: "100%",
          backgroundColor: "#1A56DB",
          color: "#FFFFFF",
          borderRadius: "12px",
          padding: "12px 0",
          fontWeight: 500,
          border: "none",
          opacity: !wallet.canWithdraw || withdrawing ? 0.4 : 1,
          cursor: !wallet.canWithdraw || withdrawing ? "not-allowed" : "pointer",
        }}
      >
        {withdrawing ? "Processing..." : "Withdraw"}
      </button>

      {!wallet.canWithdraw && (
        <p className="text-xs text-[#6B7280] mt-3">
          Minimum withdrawal is KES {wallet.minWithdrawal}. Keep selling to unlock a payout.
        </p>
      )}
      {message && (
        <p className="text-sm text-[#16233D] bg-[#F9FAFB] rounded-lg px-3 py-2 mt-3">
          {message}
        </p>
      )}
    </div>
  );
}