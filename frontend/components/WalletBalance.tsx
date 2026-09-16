"use client";

import { useCallback, useEffect, useState } from "react";

const TOKEN_STORAGE_KEY = "edusync_token";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface WalletData {
  availableBalance: number;
  canWithdraw: boolean;
}

export function WalletBalance() {
  const [wallet,      setWallet]      = useState<WalletData | null>(null);
  const [amount,      setAmount]      = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [message,     setMessage]     = useState<{ text: string; ok: boolean } | null>(null);

  const loadBalance = useCallback(async () => {
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const res   = await fetch(`${API_URL}/wallet/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data  = await res.json();
      setWallet(data);
    } catch {
      // non-fatal — balance just won't show
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBalance();
  }, [loadBalance]);

  async function handleWithdraw() {
    setMessage(null);
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      setMessage({ text: "Enter a valid amount.", ok: false });
      return;
    }
    if (wallet && numericAmount > wallet.availableBalance) {
      setMessage({
        text: `You only have KES ${wallet.availableBalance} available.`,
        ok: false,
      });
      return;
    }

    setWithdrawing(true);
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const res   = await fetch(`${API_URL}/wallet/withdraw`, {
        method:  "POST",
        headers: {
          "Content-Type":    "application/json",
          "Authorization":   `Bearer ${token}`,
          "X-Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({ amount: numericAmount }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: data.error ?? "Withdrawal failed.", ok: false });
      } else {
        setMessage({ text: "Withdrawal initiated — check your phone.", ok: true });
        setAmount("");
        await loadBalance();
      }
    } catch {
      setMessage({ text: "Network error. Please try again.", ok: false });
    } finally {
      setWithdrawing(false);
    }
  }

  if (!wallet) {
    return (
      <div className="rounded-2xl border border-black/5 bg-white p-5">
        <p className="text-sm text-[#6B7280]">Loading balance...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5">
      {/* Balance display */}
      <p className="text-xs font-medium tracking-wide uppercase text-[#6B7280]">
        Available balance
      </p>
      <p className="mt-1 mb-5 text-3xl font-semibold text-[#16233D]">
        KES {wallet.availableBalance.toLocaleString()}
      </p>

      {/* Amount input + button — stacked on mobile, side-by-side on sm+ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
          min={1}
          max={wallet.availableBalance}
          disabled={withdrawing || !wallet.canWithdraw}
          className="
            w-full rounded-lg border border-black/10
            px-3 py-2.5 text-[#16233D] text-sm
            placeholder:text-[#9CA3AF]
            focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]
            disabled:bg-black/5 disabled:text-[#9CA3AF]
            sm:flex-1
          "
        />
        <button
          onClick={handleWithdraw}
          disabled={!wallet.canWithdraw || withdrawing}
          className="
            w-full sm:w-auto
            rounded-lg bg-[#1A56DB] px-6 py-2.5
            text-sm font-medium text-white
            hover:bg-[#1543ad] transition-colors
            disabled:opacity-60 disabled:cursor-not-allowed
            whitespace-nowrap
          "
        >
          {withdrawing ? "Processing..." : "Withdraw"}
        </button>
      </div>

      {/* Status messages */}
      {!wallet.canWithdraw && !message && (
        <p className="mt-3 text-xs text-[#6B7280]">
          No balance available to withdraw.
        </p>
      )}

      {message && (
        <p
          className={`mt-3 text-sm rounded-lg px-3 py-2 ${
            message.ok
              ? "bg-[#0F6E5C]/10 text-[#0F6E5C]"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}