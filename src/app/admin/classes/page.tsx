import { AdminNav, AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { DeleteButton, JsonForm } from "@/components/admin-forms";
import { prisma } from "@/lib/prisma";

export default async function ClassesPage() { const classes = await prisma.class.findMany({ orderBy: { createdAt: "desc" } }); return <AppShell admin><AdminNav /><div className="grid gap-6 lg:grid-cols-[360px_1fr]"><Card><h1 className="text-xl font-bold">新建班级</h1><div className="mt-4"><JsonForm endpoint="/api/admin/classes" fields={[{name:'name',label:'名称'},{name:'description',label:'描述',textarea:true},{name:'enabled',label:'启用',type:'checkbox'}]} /></div></Card><Card><h1 className="text-xl font-bold">班级列表</h1><table className="mt-3"><tbody>{classes.map((c)=><tr key={c.id}><td>{c.name}<p className="text-xs text-slate-500">{c.description}</p></td><td>{c.enabled?'启用':'禁用'}</td><td><DeleteButton endpoint={`/api/admin/classes/${c.id}`} /></td></tr>)}</tbody></table></Card></div></AppShell>; }
