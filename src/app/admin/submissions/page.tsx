import Link from "next/link";
import { AdminNav, AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export default async function AdminSubmissionsPage() { const submissions=await prisma.submission.findMany({include:{user:true,problem:true},orderBy:{createdAt:'desc'},take:100}); return <AppShell admin><AdminNav /><Card><h1 className="text-xl font-bold">提交列表</h1><table className="mt-3"><tbody>{submissions.map(s=><tr key={s.id}><td><Link className="font-semibold" href={`/submissions/${s.id}`}>{s.problem.title}</Link></td><td>{s.user.nickname}</td><td><StatusBadge status={s.status} /></td><td>{s.score}%</td><td>{s.createdAt.toLocaleString()}</td></tr>)}</tbody></table></Card></AppShell>; }
