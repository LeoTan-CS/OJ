export const dynamic = "force-dynamic";
import Link from "next/link";
import { AdminNav, AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { formatMetricValue } from "@/lib/judge";
import { prisma } from "@/lib/prisma";

export default async function AdminSubmissionsPage() {
  const submissions = await prisma.submission.findMany({ include: { user: true, competition: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return <AppShell admin><AdminNav /><Card><h1 className="text-xl font-bold">提交列表</h1><table className="mt-3"><tbody>{submissions.map((submission) => <tr key={submission.id}><td><Link className="font-semibold" href={`/submissions/${submission.id}`}>{submission.competition.title}</Link></td><td>{submission.user.nickname}</td><td><StatusBadge status={submission.status} /></td><td>{formatMetricValue(submission.metricValue)}</td><td>{submission.createdAt.toLocaleString()}</td></tr>)}</tbody></table></Card></AppShell>;
}
