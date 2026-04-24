import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Bench OJ", description: "Python-only teaching OJ" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
