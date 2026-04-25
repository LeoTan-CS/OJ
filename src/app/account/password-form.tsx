"use client";

import { useState } from "react";
import { Button, Field } from "@/components/ui";
export default function PasswordForm() { const [msg,setMsg]=useState(""); async function submit(formData: FormData){ const res=await fetch('/api/account/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:formData.get('currentPassword'),newPassword:formData.get('newPassword')})}); setMsg(res.ok?'密码已更新':'更新失败'); } return <form action={submit} className="mt-4 grid gap-4"><Field label="当前密码"><input name="currentPassword" type="password" required /></Field><Field label="新密码"><input name="newPassword" type="password" minLength={4} required /></Field>{msg&&<p className="text-sm text-slate-600">{msg}</p>}<Button>保存</Button></form>; }
