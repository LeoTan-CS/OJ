export const dynamic = "force-dynamic";
import { AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import PasswordForm from "./password-form";
export default function AccountPage() { return <AppShell><Card className="max-w-xl"><h1 className="text-2xl font-bold">修改密码</h1><PasswordForm /></Card></AppShell>; }
