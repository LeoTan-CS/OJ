import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Bench AI Leaderboard", description: "AI competition leaderboard platform" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
