export const dynamic = "force-dynamic";
import { AdminNav, AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { DeleteButton, JsonForm } from "@/components/admin-forms";
import { prisma } from "@/lib/prisma";

export default async function AnnouncementsPage() { const [items, classes] = await Promise.all([prisma.announcement.findMany({ include:{class:true}, orderBy:{createdAt:'desc'} }), prisma.class.findMany()]); const classOptions=[{label:'全部',value:''},...classes.map(c=>({label:c.name,value:c.id}))]; return <AppShell admin><AdminNav /><div className="grid gap-6 lg:grid-cols-[380px_1fr]"><Card><h1 className="text-xl font-bold">发布公告</h1><div className="mt-4"><JsonForm endpoint="/api/admin/announcements" fields={[{name:'title',label:'标题'},{name:'body',label:'正文',textarea:true},{name:'classId',label:'目标班级',options:classOptions}]} /></div></Card><Card><h1 className="text-xl font-bold">公告列表</h1><table className="mt-3"><tbody>{items.map((a)=><tr key={a.id}><td>{a.title}<p className="text-xs text-slate-500 whitespace-pre-wrap">{a.body}</p></td><td>{a.class?.name??'全部'}</td><td><DeleteButton endpoint={`/api/admin/announcements/${a.id}`} /></td></tr>)}</tbody></table></Card></div></AppShell>; }
