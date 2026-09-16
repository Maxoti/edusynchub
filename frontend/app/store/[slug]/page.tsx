"use client";

// app/store/[slug]/page.tsx
import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import type { Paper, StoreData, CompletedPurchase } from "@/types/store";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_GRADES = [
  "Playgroup", "PP1", "PP2",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
  "Form 1", "Form 2", "Form 3", "Form 4",
];

const ALL_CURRICULA = [ "CBE", "8-4-4"];

const ALL_TYPES = [
  "Revision Materials",
  "Topical Exams",
  "Mid-Term Exams",
  "End-Term Exams",
  "Opener Exams",
  "Mock Exams",
  "Weekly Exams",
  "Schemes of Work",
  "Lesson Plans",
  "Lesson Notes",
  "Mnemonic Songs",
  "Math Formulae",
];
// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}



// ── Sub-components ────────────────────────────────────────────────────────────

function ShopAvatar({ name }: { name: string }) {
  return (
    <div className="w-16 h-16 rounded-full bg-[#C9972D] text-white flex items-center justify-center font-display text-xl border-2 border-white/30">
      {getInitials(name)}
    </div>
  );
}

function StyledShopName({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0];
  const rest = parts.slice(1).join(" ");
  return (
    <span className="inline-flex items-center gap-2 flex-wrap justify-center">
      <span>{firstName}</span>
      {rest && (
        <span className="inline-block bg-[#C9972D] text-[#16233D] rounded-full px-4 py-1 text-2xl">
          {rest}
        </span>
      )}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [data,       setData]       = useState<StoreData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);
  const [orderPaper, setOrderPaper] = useState<Paper | null>(null);
  const [completedPurchases, setCompletedPurchases] = useState<
    Record<string, CompletedPurchase>
  >({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    curriculum: "",
    grade:      "",
    examType:   "",
    term:       "",
    year:       "",
  });

  // Owner check — computed once, no stat
  // ── Data fetching ───────────────────────────────────────────────────────────
const { teacher } = useAuth();
const isOwner = !!teacher && teacher.slug === slug;
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/store/${slug}`);
      if (res.status === 404) { setNotFound(true); return; }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handlePaid = (
    paperId: string,
    purchaseId: string,
    downloadToken: string
  ) => {
    setCompletedPurchases((prev) => ({
      ...prev,
      [paperId]: { purchaseId, downloadToken },
    }));
  };

  const handleDownload = async (paperId: string) => {
    const completed = completedPurchases[paperId];
    if (!completed) return;
    setDownloadingId(paperId);
    try {
      const res  = await fetch(
        `${API_URL}/papers/purchases/${completed.purchaseId}/download?token=${completed.downloadToken}`
      );
      const json = await res.json();
      if (res.ok) window.open(json.url, "_blank");
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Render guards ───────────────────────────────────────────────────────────

  if (loading)
    return <p className="text-center py-20 text-[#6B7280]">Loading shop...</p>;
  if (notFound || !data)
    return <p className="text-center py-20 text-[#6B7280]">Shop not found.</p>;

  const shopName = data.teacher.businessName || data.teacher.name;

  // ── Filtering ───────────────────────────────────────────────────────────────

  const filtered = data.papers.filter((p) => {
    if (filters.curriculum && p.curriculum !== filters.curriculum) return false;
    if (filters.grade      && p.grade      !== filters.grade)      return false;
    if (filters.examType   && p.examType   !== filters.examType)   return false;
    if (filters.term       && p.term       !== filters.term)       return false;
    if (filters.year       && String(p.year) !== filters.year)     return false;
    return true;
  });

  const set = (field: keyof typeof filters) => (v: string) =>
    setFilters((f) => ({ ...f, [field]: v }));

  // Derive which grades/terms actually exist in this store's papers
  const existingGrades = Array.from(
    new Set(data.papers.map((p) => p.grade).filter(Boolean))
  ) as string[];
  const existingTerms = Array.from(
    new Set(data.papers.map((p) => p.term).filter(Boolean))
  ) as string[];

  // Keep canonical order for grades
  const gradeOptions = ALL_GRADES.filter((g) => existingGrades.includes(g));
  const termOptions  = existingTerms.sort();
  console.log("papers from API:", data.papers);
console.log("existingGrades:", existingGrades);
console.log("gradeOptions:", gradeOptions);

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F9FAFB]">

      {/* Hero */}
      <header className="bg-[#1A56DB] text-white text-center py-10 px-4 relative">
        {isOwner && (
          <Link
            href="/dashboard/upload"
            className="block text-center sm:absolute sm:top-4 sm:left-4 sm:text-left
               text-sm text-white/80 hover:text-white mb-4 sm:mb-0"
          >
            ← Back to dashboard
          </Link>
        )}
        <div className="flex flex-col items-center gap-3">
          <ShopAvatar name={shopName} />
          <h1 className="font-display text-3xl">
            <StyledShopName name={shopName} />
          </h1>
        </div>
        <p className="text-white/70 text-sm mt-2">
          Exam papers and revision materials
        </p>
      </header>

      {/* Filters */}
      <div className="max-w-5xl mx-auto px-4 py-5 flex flex-wrap gap-2">

        {/* Curriculum */}
        <FilterSelect
          value={filters.curriculum}
          onChange={set("curriculum")}
          options={ALL_CURRICULA}
          placeholder="All Curricula"
        />

        {/* Grade */}
        <FilterSelect
          value={filters.grade}
          onChange={set("grade")}
          options={gradeOptions}
          placeholder="All Grades"
        />

        {/* Type */}
        <FilterSelect
          value={filters.examType}
          onChange={set("examType")}
          options={ALL_TYPES}
          placeholder="All Types"
        />

        {/* Term */}
        <FilterSelect
          value={filters.term}
          onChange={set("term")}
          options={termOptions}
          placeholder="All Terms"
        />

        {/* Year — text input so teachers type the year directly */}
        <input
          type="number"
          value={filters.year}
          onChange={(e) => set("year")(e.target.value)}
          placeholder="Year e.g. 2026"
          className="rounded-lg border border-black/10 px-3 py-2 text-sm text-[#16233D] w-32
                     placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2
                     focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
        />

        {/* Clear filters */}
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() =>
              setFilters({ curriculum: "", grade: "", examType: "", term: "", year: "" })
            }
            className="text-xs text-[#6B7280] underline px-2 hover:text-[#16233D]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Paper count */}
      <div className="max-w-5xl mx-auto px-4 mb-3">
        <p className="text-xs text-[#6B7280]">
          {filtered.length} paper{filtered.length !== 1 ? "s" : ""}
          {Object.values(filters).some(Boolean) ? " match your filters" : " available"}
        </p>
      </div>

      {/* Paper grid */}
      <div className="max-w-5xl mx-auto px-4 pb-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <p className="text-[#6B7280] col-span-full text-center py-12">
            No papers match those filters.
          </p>
        ) : (
          filtered.map((paper) => {
            const completed = completedPurchases[paper.id];
            return (
              <PaperCard
                key={paper.id}
                paper={paper}
                completed={!!completed}
                downloading={downloadingId === paper.id}
                onBuy={() => setOrderPaper(paper)}
                onDownload={() => handleDownload(paper.id)}
              />
            );
          })
        )}
      </div>

      {/* Order modal */}
      {orderPaper && (
        <OrderModal
          paper={orderPaper}
          onClose={() => setOrderPaper(null)}
          onPaid={handlePaid}
          teacherName={shopName}
          whatsappNumber={data.teacher.whatsappNumber}
        />
      )}
    </div>
  );
}

// ── PaperCard ─────────────────────────────────────────────────────────────────

function PaperCard({
  paper,
  completed,
  downloading,
  onBuy,
  onDownload,
}: {
  paper:       Paper;
  completed:   boolean;
  downloading: boolean;
  onBuy:       () => void;
  onDownload:  () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-black/5 p-4 flex flex-col">
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-[#6B7280]">
          {paper.curriculum} · {paper.year}
        </span>
        <span className="text-xs font-medium bg-[#0F6E5C]/10 text-[#0F6E5C] rounded-full px-2.5 py-1">
          KES {paper.price}
        </span>
      </div>
      <h3 className="font-medium text-[#16233D] mb-1 leading-snug">{paper.title}</h3>
      <p className="text-xs text-[#6B7280] mb-4">
        {[paper.examType, paper.term, paper.subject].filter(Boolean).join(" · ")}
      </p>

      {completed ? (
        <button
          onClick={onDownload}
          disabled={downloading}
          className="mt-auto w-full bg-[#0F6E5C] text-white rounded-lg py-2.5 text-sm
                     font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {downloading ? "Preparing…" : "⬇ Download"}
        </button>
      ) : (
        <button
          onClick={onBuy}
          className="mt-auto w-full bg-[#1A56DB] text-white rounded-lg py-2.5 text-sm
                     font-medium hover:bg-[#1543ad] transition-colors"
        >
          {paper.isBundle ? "Buy Full Set" : "Buy & Download"}
        </button>
      )}
    </div>
  );
}

// ── FilterSelect ──────────────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value:       string;
  onChange:    (v: string) => void;
  options:     string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-black/10 px-3 py-2 text-sm text-[#16233D]
                 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

// ── OrderModal ────────────────────────────────────────────────────────────────

type OrderStage = "form" | "sending" | "awaiting_payment" | "failed";

const POLL_INTERVAL_MS  = 2000; // poll every 2s for faster confirmation
const MAX_POLL_ATTEMPTS = 60;   // 2 minutes

function OrderModal({
  paper,
  onClose,
  onPaid,
  teacherName,
  whatsappNumber,
}: {
  paper:           Paper;
  onClose:         () => void;
  onPaid:          (paperId: string, purchaseId: string, downloadToken: string) => void;
  teacherName:     string;
  whatsappNumber:  string | null;
}) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<OrderStage>("form");
  const [error, setError] = useState<string | null>(null);

  const pollTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  useEffect(() => {
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, []);

  /**
   * Polls the purchase status endpoint until:
   *  - paid      → fire onPaid immediately, close modal, enable download
   *  - failed    → show error
   *  - timeout   → show "check your phone" message
   *
   * Poll interval is 2 s (down from 3 s) for faster feedback after payment.
   * We also do an immediate first check with no delay so the modal closes
   * as soon as the STK callback hits the server.
   */
  const startPolling = useCallback((purchaseId: string) => {
    pollAttempts.current = 0;

    const checkStatus = async () => {
      pollAttempts.current += 1;
      try {
        const res  = await fetch(
          `${API_URL}/papers/purchases/${purchaseId}/status`
        );
        const json = await res.json();

        if (json.status === "paid") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          onPaid(paper.id, purchaseId, json.download_token);
          onClose(); // close immediately — download button appears on the card
          return;
        }
        if (json.status === "failed") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setStage("failed");
          setError("Payment was not completed. Please try again.");
          return;
        }
      } catch {
        // transient error — keep polling
      }

      if (pollAttempts.current >= MAX_POLL_ATTEMPTS) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setStage("failed");
        setError(
          "We haven't heard from M-Pesa yet. Check your phone — if you paid, your download will appear shortly."
        );
      }
    };

    // Immediate first check then interval
    checkStatus();
    pollTimer.current = setInterval(checkStatus, POLL_INTERVAL_MS);
  }, [onClose, onPaid, paper.id]);

  const handlePay = async () => {
    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }
    setError(null);
    setStage("sending");

    try {
      const res  = await fetch(`${API_URL}/papers/${paper.id}/purchase`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          phoneNumber: phone,
          email: email || "no-reply@example.com",
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setStage("form");
        setError(json.error ?? "Could not start payment.");
        return;
      }

      setStage("awaiting_payment");
      startPolling(json.purchaseId);

    } catch {
      setStage("form");
      setError("Network error. Try again.");
    }
  };

  const whatsappMessage = encodeURIComponent(
    `Hi ${teacherName}, I would like to order "${paper.title}" (KES ${paper.price}).`
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 relative">

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#6B7280] hover:text-[#16233D] text-sm"
          aria-label="Close"
        >
          ✕
        </button>

        <p className="text-xs tracking-wide uppercase text-[#6B7280] mb-1">Order</p>
        <h3 className="font-display text-lg text-[#16233D] mb-1 pr-6 leading-snug">
          {paper.title}
        </h3>
        <p className="text-[#0F6E5C] font-semibold mb-4">KES {paper.price}</p>

        {/* Awaiting payment state */}
        {stage === "awaiting_payment" && (
          <div className="text-center py-4">
            <div className="text-3xl mb-3 animate-bounce">📱</div>
            <p className="text-sm font-medium text-[#16233D] mb-1">
              Check your phone
            </p>
            <p className="text-xs text-[#6B7280]">
              Enter your M-Pesa PIN to complete payment.
              This window closes automatically once confirmed.
            </p>
          </div>
        )}

        {/* Form / error state */}
        {(stage === "form" || stage === "sending" || stage === "failed") && (
          <>
            <label className="block mb-3">
              <span className="text-sm font-medium text-[#16233D] mb-1 block">
                M-Pesa number <span className="text-red-500">*</span>
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                inputMode="tel"
                className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
              />
            </label>

            <label className="block mb-4">
              <span className="text-sm font-medium text-[#16233D] mb-1 block">
                Email <span className="text-[#9CA3AF] font-normal">(optional — for receipt)</span>
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                inputMode="email"
                className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
              />
            </label>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            <button
              onClick={handlePay}
              disabled={stage === "sending"}
              className="w-full bg-[#1A56DB] text-white rounded-xl py-3 font-medium
                         hover:bg-[#1543ad] disabled:opacity-60 mb-3 transition-colors"
            >
              {stage === "sending" ? "Sending STK push…" : `Pay KES ${paper.price} via M-Pesa`}
            </button>

            {whatsappNumber && (
              <>
                <p className="text-center text-xs text-[#6B7280] mb-3">or</p>
                <a
                  href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center w-full bg-[#0F6E5C] text-white rounded-xl
                             py-3 font-medium hover:opacity-90 transition-opacity"
                >
                  Order via WhatsApp
                </a>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}