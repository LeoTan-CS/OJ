import { redirect } from "next/navigation";
export default async function LegacyAdminProblemPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; redirect(`/admin/competitions/${id}`); }
