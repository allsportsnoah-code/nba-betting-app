import Navbar from "@/app/components/Navbar";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Betting Lab",
  description: "Adaptive sports betting boards with frozen history, live sync, and model review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-[-10rem] top-16 h-80 w-80 bg-cyan-200/30 blur-3xl" />
          <div className="absolute right-[-8rem] top-24 h-96 w-96 bg-emerald-200/25 blur-3xl" />
          <div className="absolute bottom-[-12rem] left-1/4 h-[28rem] w-[28rem] bg-orange-100/40 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        </div>
        <div className="relative z-10 flex min-h-screen flex-col">
          <Navbar />
          {children}
        </div>
      </body>
    </html>
  );
}
