"use client";

// app/dashboard/upload/page.tsx
import { useState, useEffect, useCallback, type FormEvent, type DragEvent } from "react";
import { RequirePaid } from "@/components/RouteGuard";
import { useAuth } from "@/context/AuthContext";
import { WalletBalance } from "@/components/WalletBalance";
import {
  getPresignedUploadUrl,
  uploadFileToR2,
  createExam,
  listMyExams,
  ApiError,
  type Exam,
  type ExamType,
} from "@/lib/api";

const EXAM_TYPES: ExamType[] = [
  "Revision Materials",
  "Topical Exams",
  "Mid-Term Exams",
  "End-Term Exams",
  "Mock Exams",
  "Schemes of Work",
  "Lesson Notes",
];

const GRADES_BY_CURRICULUM: Record<string, string[]> = {
  CBE: [
    "PP1", "PP2",
    "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
    "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10",
  ],
  "8-4-4": ["Form 1", "Form 2", "Form 3", "Form 4"],
};

const TERMS = ["Term 1", "Term 2", "Term 3"];
const CURRICULA = Object.keys(GRADES_BY_CURRICULUM); // ["CBE", "8-4-4"]
const MAX_PDF_MB = 25;
const MAX_ZIP_MB = 80;

export default function UploadDashboardPage() {
  return (
    <RequirePaid>
      <DashboardContent />
    </RequirePaid>
  );
}

function DashboardContent() {
  const { teacher, logout } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  const refreshExams = useCallback(async () => {
    try {
      const data = await listMyExams();
      setExams(data);
    } catch {
      // Non-fatal — the upload form still works even if this list fails to load.
    } finally {
      setLoadingExams(false);
    }
  }, []);

  useEffect(() => {
    // Known false positive in eslint-plugin-react-hooks v6.1.1: fetching
    // data on mount via a stable useCallback function is the standard,
    // React-docs-endorsed pattern — this isn't a real cascading-render bug.
    // https://github.com/facebook/react/issues/34743
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshExams();
  }, [refreshExams]);

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-[#6B7280] font-medium">
            Dashboard
          </p>
          <h1 className="font-display text-2xl text-[#16233D]">
            Welcome, {teacher?.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/store/${teacher?.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-[#16233D] border border-black/10 rounded-lg px-4 py-2 hover:bg-black/5"
          >
            👁️ View my public shop
          </a>
          <button onClick={logout} className="text-sm font-medium text-[#6B7280] hover:text-[#16233D]">
            Log out
          </button>
        </div>
      </header>

      <div className="mb-8">
        <WalletBalance />
      </div>

      <UploadForm onUploaded={refreshExams} />

      <section className="mt-12">
        <h2 className="font-display text-xl text-[#16233D] mb-4">Your papers</h2>
        {loadingExams ? (
          <p className="text-sm text-[#6B7280]">Loading…</p>
        ) : exams.length === 0 ? (
          <p className="text-sm text-[#6B7280]">
            Nothing uploaded yet — your first paper will show up here.
          </p>
        ) : (
          <div className="space-y-3">
            {exams.map((exam) => (
              <ExamRow key={exam.id} exam={exam} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---- Upload form ----

type UploadStage = "idle" | "uploading" | "saving" | "success" | "error";

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);

  const [form, setForm] = useState({
    title: "",
    curriculum: "", // empty until chosen — mirrors "-- Select --" on the reference form
    grade: "",
    subject: "",
    term: TERMS[0],
    year: new Date().getFullYear().toString(),
    examType: EXAM_TYPES[0] as ExamType,
    price: "50",
    isBundle: false,
  });

  const availableGrades = form.curriculum ? GRADES_BY_CURRICULUM[form.curriculum] : [];
  const maxFileMb = form.isBundle ? MAX_ZIP_MB : MAX_PDF_MB;

  // Derived value, computed directly during render — not stored in state
  // and synced via an effect. Storing a value that's fully derivable from
  // other state and re-syncing it with setState in an effect is exactly
  // the pattern react-hooks/set-state-in-effect (and React's own docs)
  // warn against: it just forces an extra render for no reason.
  const autoTitle = form.isBundle
    ? [form.grade, "Full Set", form.term, form.year].filter(Boolean).join(" ")
    : [form.grade, form.subject, form.examType, form.term, form.year].filter(Boolean).join(" ");
  const displayedTitle = titleTouched ? form.title : autoTitle;

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCurriculumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const curriculum = e.target.value;
    // Changing curriculum invalidates the previously selected grade —
    // Form 2 doesn't exist under CBE, PP1 doesn't exist under 8-4-4.
    setForm((f) => ({ ...f, curriculum, grade: "" }));
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleTouched(true);
    setForm((f) => ({ ...f, title: e.target.value }));
  };

  const handleBundleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isBundle = e.target.checked;
    setForm((f) => ({ ...f, isBundle, subject: isBundle ? "" : f.subject }));
    setFile(null); // a PDF chosen before toggling wouldn't be valid as a ZIP, and vice versa
  };

  const validateAndSetFile = (candidate: File | undefined) => {
    setError(null);
    if (!candidate) return;

    const isZip =
      candidate.type === "application/zip" ||
      candidate.type === "application/x-zip-compressed" ||
      candidate.name.toLowerCase().endsWith(".zip");

    if (form.isBundle && !isZip) {
      setError("Full Set bundles must be uploaded as a single .zip file.");
      return;
    }
    if (!form.isBundle && candidate.type !== "application/pdf") {
      setError("Only PDF files are accepted for a single paper.");
      return;
    }
    if (candidate.size > maxFileMb * 1024 * 1024) {
      setError(`File is too large — keep it under ${maxFileMb}MB.`);
      return;
    }
    setFile(candidate);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    validateAndSetFile(e.dataTransfer.files[0]);
  };

  const resetForm = () => {
    setFile(null);
    setProgress(0);
    setTitleTouched(false);
    setForm((f) => ({ ...f, title: "", subject: "" }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.curriculum || !form.grade) {
      setError("Choose a curriculum and grade.");
      return;
    }
    if (!file) {
      setError(`Attach a ${form.isBundle ? "ZIP" : "PDF"} before uploading.`);
      return;
    }
    if (!form.isBundle && !form.subject.trim()) {
      setError("Subject is required for a single paper.");
      return;
    }
    if (!displayedTitle.trim()) {
      setError("Title is required.");
      return;
    }

    try {
      setStage("uploading");
      setProgress(0);
      const { uploadUrl, fileKey } = await getPresignedUploadUrl(file.name, file.type);
      await uploadFileToR2(uploadUrl, file, setProgress);

      setStage("saving");
      await createExam({
        title: displayedTitle.trim(),
        curriculum: form.curriculum,
        grade: form.grade,
        subject: form.isBundle ? "All subjects" : form.subject.trim(),
        term: form.term,
        year: Number(form.year),
        examType: form.examType,
        price: Number(form.price),
        fileKey,
        isBundle: form.isBundle,
      });

      setStage("success");
      onUploaded();
      setTimeout(() => {
        resetForm();
        setStage("idle");
      }, 1800);
    } catch (err) {
      setStage("error");
      setError(err instanceof ApiError ? err.message : "Upload failed. Try again.");
    }
  };

  const busy = stage === "uploading" || stage === "saving";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl border border-black/5 p-6 space-y-5"
    >
      <h2 className="font-display text-xl text-[#16233D]">Upload a paper</h2>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragActive ? "border-[#1A56DB] bg-[#1A56DB]/5" : "border-black/15"
        }`}
      >
        {file ? (
          <div>
            <p className="text-sm font-medium text-[#16233D]">{file.name}</p>
            <p className="text-xs text-[#6B7280] mt-1">
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
            {!busy && stage !== "success" && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-red-600 mt-2 underline"
              >
                Remove
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-[#16233D] font-medium">
              Drag a {form.isBundle ? "ZIP" : "PDF"} here, or
            </p>
            <label className="inline-block mt-2 text-sm font-medium text-[#1A56DB] cursor-pointer underline">
              browse your files
              <input
                type="file"
                accept={form.isBundle ? ".zip,application/zip,application/x-zip-compressed" : "application/pdf"}
                className="hidden"
                onChange={(e) => validateAndSetFile(e.target.files?.[0])}
              />
            </label>
            <p className="text-xs text-[#6B7280] mt-2">
              {form.isBundle ? "ZIP" : "PDF"} only, up to {maxFileMb}MB
            </p>
          </>
        )}
      </div>

      {/* Full Set bundle toggle */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isBundle}
          onChange={handleBundleToggle}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-[#16233D]">This is a Full Set bundle (all subjects)</span>
          <span className="block text-xs text-[#6B7280] mt-0.5">
            Full Set bundles should be uploaded as a single .zip file containing all subject PDFs.
          </span>
        </span>
      </label>

      {/* Metadata fields */}
      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField
          label="Curriculum"
          value={form.curriculum}
          onChange={handleCurriculumChange}
          options={CURRICULA}
          placeholder="-- Select --"
        />
        <SelectField
          label="Grade / Class"
          value={form.grade}
          onChange={update("grade")}
          options={availableGrades}
          placeholder={form.curriculum ? "-- Select --" : "-- Select curriculum first --"}
          disabled={!form.curriculum}
        />

        {!form.isBundle && (
          <TextField label="Subject" value={form.subject} onChange={update("subject")} placeholder="Mathematics" required />
        )}
        <SelectField label="Term" value={form.term} onChange={update("term")} options={TERMS} />

        <TextField label="Year" type="number" value={form.year} onChange={update("year")} />
        {!form.isBundle && (
          <SelectField label="Type" value={form.examType} onChange={update("examType")} options={EXAM_TYPES} />
        )}

        <TextField label="Price (KES)" type="number" value={form.price} onChange={update("price")} min={10} />

        <div className="sm:col-span-2">
          <TextField
            label="Title (auto-generated, or override)"
            value={displayedTitle}
            onChange={handleTitleChange}
            placeholder="e.g. Grade 5 Mathematics Mid-Term Exams Term 2 2026"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {busy && (
        <div>
          <div className="h-2 bg-black/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1A56DB] transition-all"
              style={{ width: `${stage === "saving" ? 100 : progress}%` }}
            />
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            {stage === "uploading" ? `Uploading… ${progress}%` : "Saving details…"}
          </p>
        </div>
      )}

      {stage === "success" && (
        <p className="text-sm text-[#0F6E5C] bg-[#0F6E5C]/10 rounded-lg px-3 py-2">
          Uploaded — pending your review before it goes live.
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-[#1A56DB] text-white rounded-xl py-3 font-medium hover:bg-[#1543ad] transition-colors disabled:opacity-60"
      >
        {busy ? "Uploading…" : "Upload paper"}
      </button>
    </form>
  );
}

function TextField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#16233D] mb-1 block">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-[#16233D] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
      />
    </label>
  );
}

function SelectField({
  label,
  options,
  placeholder,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: string[];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#16233D] mb-1 block">{label}</span>
      <select
        {...props}
        className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-[#16233D] focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] disabled:bg-black/5 disabled:text-[#9CA3AF]"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExamRow({ exam }: { exam: Exam }) {
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border border-black/5 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[#16233D]">{exam.title}</p>
        <p className="text-xs text-[#6B7280] mt-0.5">
          {exam.grade} · {exam.subject} · {exam.term} {exam.year} · KES {exam.price}
        </p>
      </div>
      <span
        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          exam.isApproved
            ? "bg-[#0F6E5C]/10 text-[#0F6E5C]"
            : "bg-[#C9972D]/10 text-[#C9972D]"
        }`}
      >
        {exam.isApproved ? "Live" : "Pending review"}
      </span>
    </div>
  );
}