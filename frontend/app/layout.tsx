import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-serif", weight: ["500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "EdusyncHub",
  description: "Exam papers,Lesson plans,schemes & lesson notes marketplace for Kenyan educators",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-sans bg-white text-[#16233D]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
