import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Bench AI 模型评测平台", description: "本地运行的模型上传、测试、排名与排行榜平台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
