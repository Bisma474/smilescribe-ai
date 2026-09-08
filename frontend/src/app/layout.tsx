import type { Metadata } from "next";
import "../styles/globals.css";
import { AuthProvider } from "@/store/AuthContext";

export const metadata: Metadata = {
  title: "DentXcribe AI — Dental Charting & Scribing",
  description: "AI-powered dental charting, live transcription, CDT coding, and revenue recovery for modern dental practices.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
