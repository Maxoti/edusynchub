// app/page.tsx
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div>
      {/* Nav */}
      <header className="flex items-center justify-between px-6 md:px-12 py-5 w-full">
        <span className="font-display text-xl text-[#1A56DB]">EdusyncHub</span>
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-medium text-[#16233D] hover:text-[#1A56DB]">
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium bg-[#1A56DB] text-white rounded-lg px-4 py-2 hover:bg-[#1543ad] transition-colors"
          >
            Create free account
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 md:px-12 py-12 md:py-20 grid md:grid-cols-2 gap-12 items-center w-full">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-[#6B7280] font-medium mb-4">
            For Kenyan teachers.
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-tight text-[#16233D]">
            Turn your revision papers into a steady income.
          </h1>
          <p className="text-lg text-[#6B7280] mt-6 leading-relaxed">
            Upload the exam papers you already write. Parents across Kenya pay
            KES 50–100 to download them via M-Pesa. You keep 85.5% — paid
            straight to your phone, every time.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="bg-[#1A56DB] text-white rounded-xl px-6 py-3.5 font-medium hover:bg-[#1543ad] transition-colors"
            >
              Create your free storefront.
            </Link>
            <span className="text-sm text-[#6B7280]">
              Free to join. No card needed to sign up.
            </span>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
            <Stat value="85.5%" label="You keep per sale" />
            <Stat value="KES 299" label="Monthly activation" />
          </div>
        </div>

        <div className="relative aspect-500/749 rounded-3xl overflow-hidden">
          <Image
            src="/images/wanjiku.jpg"
            alt="A Kenyan teacher"
            fill
            priority
            sizes="(min-width: 768px) 480px, 100vw"
            className="object-cover object-[50%_35%]"
          />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-[#F7F9FC] py-16 w-full">
        <div className="px-6 md:px-12">
          <h2 className="font-display text-2xl md:text-3xl text-center text-[#16233D] mb-12">
            Three steps to your first sale
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Step
              number="1"
              title="Create your storefront"
              description="Sign up free in under a minute. Set up your teacher profile — no card required."
            />
            <Step
              number="2"
              title="Upload your papers"
              description="Add your revision materials, exams, and schemes of work. A one-time KES 299 unlocks unlimited uploads."
            />
            <Step
              number="3"
              title="Get paid on M-Pesa"
              description="Share your link. When a parent buys a paper, your 85.5% lands in your wallet — withdraw anytime."
            />
          </div>
        </div>
      </section>

      {/* Trust / value props */}
      <section className="px-6 md:px-12 py-16 w-full">
        <div className="grid md:grid-cols-3 gap-8">
          <ValueProp
            title="No account needed for parents"
            description="Parents pay and download instantly — no sign-up friction that costs you sales."
          />
          <ValueProp
            title="Your work stays yours"
            description="Every download is watermarked with the buyer's details, so your papers don't end up free on WhatsApp."
          />
          <ValueProp
            title="Built for Kenyan classrooms"
            description="CBE curriculum, all grades and terms — organized the way you actually teach."
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#1A56DB] py-16 text-center px-6 w-full">
        <h2 className="font-display text-2xl md:text-3xl text-white mb-4">
          Your papers are already written. Start earning from them today.
        </h2>
        <Link
          href="/signup"
          className="inline-block mt-4 bg-white text-[#1A56DB] rounded-xl px-6 py-3.5 font-medium hover:bg-white/90 transition-colors"
        >
          Create your free storefront
        </Link>
      </section>

      <footer className="text-center text-sm text-[#6B7280] py-8">
        EdusyncHub · Nairobi, Kenya
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl text-[#1A56DB]">{value}</p>
      <p className="text-xs text-[#6B7280] mt-1">{label}</p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6">
      <div className="w-8 h-8 rounded-full bg-[#1A56DB] text-white flex items-center justify-center font-medium text-sm mb-4">
        {number}
      </div>
      <h3 className="font-medium text-[#16233D] mb-2">{title}</h3>
      <p className="text-sm text-[#6B7280] leading-relaxed">{description}</p>
    </div>
  );
}

function ValueProp({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-medium text-[#16233D] mb-2">{title}</h3>
      <p className="text-sm text-[#6B7280] leading-relaxed">{description}</p>
    </div>
  );
}