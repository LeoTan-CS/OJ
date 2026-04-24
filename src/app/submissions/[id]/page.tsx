export const dynamic = "force-dynamic";
import { AppShell } from "@/components/shell";
import SubmissionView from "./view";
export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AppShell><SubmissionView id={id} /></AppShell>; }
