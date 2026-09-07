"use client";

// app/store/[slug]/page.tsx
import { useEffect, useState, useCallback, use } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface Paper {
  id: string;
  title: string;
  subject: string | null;
  price: number;
  curriculum: string | null;
  grade: string | null;
  examType: string | null;
  term: string | null;
  year: number | null;
  isBundle: boolean;
}

interface StoreData {
  teacher: { name: string; businessName: string | null };
  papers: Paper[];
}

export default function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [filters, setFilters] = useState({
    curriculum: "",
    grade: "",
    examType: "",
    term: "",
    year: "",
  });

  const [orderPaper, setOrderPaper] = useState<Paper | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/store/${slug}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-center py-20 text-[#6B7280]">Loading shop...</p>;
  if (notFound || !data) return <p className="text-center py-20 text-[#6B7280]">Shop not found.</p>;

  const filterOptions = (key: keyof Paper) =>
    Array.from(new Set(data.papers.map((p) => p[key]).filter(Boolean))) as string[];

  const filtered = data.papers.filter((p) => {
    if (filters.curriculum && p.curriculum !== filters.curriculum) return false;
    if (filters.grade && p.grade !== filters.grade) return false;
    if (filters.examType && p.examType !== filters.examType) return false;
    if (filters.term && p.term !== filters.term) return false;
    if (filters.year && String(p.year) !== filters.year) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <header className="bg-[#1A56DB] text-white text-center py-10 px-4">
        <h1 className="font-display text-3xl">
          {data.teacher.businessName || data.teacher.name}
        </h1>
        <p className="text-white/70 text-sm mt-2">Exam papers &amp; revision materials</p>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap gap-3">
        <FilterSelect
          value={filters.curriculum}
          onChange={(v) => setFilters((f) => ({ ...f, curriculum: v }))}
          options={filterOptions("curriculum")}
          placeholder="All Curricula"
        />
        <FilterSelect
          value={filters.grade}
          onChange={(v) => setFilters((f) => ({ ...f, grade: v }))}
          options={filterOptions("grade")}
          placeholder="All Grades"
        />
        <FilterSelect
          value={filters.examType}
          onChange={(v) => setFilters((f) => ({ ...f, examType: v }))}
          options={filterOptions("examType")}
          placeholder="All Types"
        />
        <FilterSelect
          value={filters.term}
          onChange={(v) => setFilters((f) => ({ ...f, term: v }))}
          options={filterOptions("term")}
          placeholder="All Terms"
        />
        <FilterSelect
          value={filters.year}
          onChange={(v) => setFilters((f) => ({ ...f, year: v }))}
          options={filterOptions("year").map(String)}
          placeholder="All Years"
        />
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <p className="text-[#6B7280] col-span-full text-center py-12">
            No papers match those filters yet.
          </p>
        ) : (
          filtered.map((paper) => (
            <div key={paper.id} className="bg-white rounded-xl border border-black/5 p-4 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-[#6B7280]">
                  {paper.curriculum} · {paper.year}
                </span>
                <span className="text-xs font-medium bg-[#0F6E5C]/10 text-[#0F6E5C] rounded-full px-2.5 py-1">
                  KES {paper.price}
                </span>
              </div>
              <h3 className="font-medium text-[#16233D] mb-1">{paper.title}</h3>
              <p className="text-xs text-[#6B7280] mb-4">
                {[paper.examType, paper.term, paper.subject].filter(Boolean).join(" · ")}
              </p>
              <button
                onClick={() => setOrderPaper(paper)}
                className="mt-auto w-full bg-[#1A56DB] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#1543ad]"
              >
                {paper.isBundle ? "Buy Full Set" : "Buy & Download"}
              </button>
            </div>
          ))
        )}
      </div>

      {orderPaper && (
        <OrderModal
          paper={orderPaper}
          onClose={() => setOrderPaper(null)}
          teacherName={data.teacher.businessName || data.teacher.name}
        />
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-black/10 px-3 py-2 text-sm text-[#16233D]"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function OrderModal({
  paper,
  onClose,
  teacherName,
}: {
  paper: Paper;
  onClose: () => void;
  teacherName: string;
}) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch(`${API_URL}/papers/${paper.id}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, email: email || "no-reply@example.com" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(data.error ?? "Could not start payment.");
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setError("Network error. Try again.");
    }
  };

  const whatsappMessage = encodeURIComponent(
    `Hi ${teacherName}, I'd like to order "${paper.title}" (KES ${paper.price}).`
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#6B7280] hover:text-[#16233D]"
          aria-label="Close"
        >
          Close
        </button>
        <p className="text-xs tracking-wide uppercase text-[#6B7280] mb-1">Order</p>
        <h3 className="font-display text-lg text-[#16233D] mb-1">{paper.title}</h3>
        <p className="text-[#0F6E5C] font-medium mb-4">KES {paper.price}</p>

        {status === "sent" ? (
          <p className="text-sm text-[#0F6E5C] bg-[#0F6E5C]/10 rounded-lg px-3 py-2">
            Check your phone to complete the M-Pesa payment.
          </p>
        ) : (
          <>
            <label className="block mb-3">
              <span className="text-sm font-medium text-[#16233D] mb-1 block">
                M-Pesa phone number <span className="text-red-500">*</span>
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                className="w-full rounded-lg border border-black/10 px-3 py-2.5"
              />
            </label>
            <label className="block mb-4">
              <span className="text-sm font-medium text-[#16233D] mb-1 block">Email (optional)</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-black/10 px-3 py-2.5"
              />
            </label>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}

            <button
              onClick={handlePay}
              disabled={status === "sending"}
              className="w-full bg-[#1A56DB] text-white rounded-xl py-3 font-medium hover:bg-[#1543ad] disabled:opacity-60 mb-3"
            >
              {status === "sending" ? "Sending..." : "Pay with M-Pesa"}
            </button>

            <p className="text-center text-xs text-[#6B7280] mb-3">or</p>

            <a
              href={`https://wa.me/254700000000?text=${whatsappMessage}`}
              target="_blank"
              rel="noreferrer"
              className="block text-center w-full bg-[#0F6E5C] text-white rounded-xl py-3 font-medium hover:opacity-90"
            >
              Order via WhatsApp
            </a>
          </>
        )}
      </div>
    </div>
  );
}