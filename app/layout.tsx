import Navbar from "@/app/components/Navbar";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NBA Betting Dashboard",
  description: "Sports betting dashboard with picks, calendar, and performance tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-[-8rem] top-20 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl" />
          <div className="absolute right-[-6rem] top-32 h-80 w-80 rounded-full bg-teal-200/40 blur-3xl" />
          <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
        </div>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
