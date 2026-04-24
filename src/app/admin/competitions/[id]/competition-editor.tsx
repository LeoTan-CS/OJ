"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field } from "@/components/ui";
import { competitionMetrics } from "@/lib/judge";

type Competition = { id: string; title: string; description: string; metric: string; hiddenTestDataDir: string; answerCsvPath: string; codeTemplate: string; runtimeLimitMs: number; enabled: boolean } | null;
const defaultTemplate = `import argparse\nimport csv\n\nparser = argparse.ArgumentParser()\nparser.add_argument("--data-dir", required=True)\nparser.add_argument("--output", required=True)\nargs = parser.parse_args()\n\n# TODO: read files from args.data_dir and write id,prediction CSV.\nwith open(args.output, "w", newline="") as f:\n    writer = csv.writer(f)\n    writer.writerow(["id", "prediction"])\n`;

export default function CompetitionEditor({ competition }: { competition: Competition }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setError("");
    const body = { title: formData.get("title"), description: formData.get("description"), metric: formData.get("metric"), hiddenTestDataDir: formData.get("hiddenTestDataDir"), answerCsvPath: formData.get("answerCsvPath"), codeTemplate: formData.get("codeTemplate"), runtimeLimitMs: Number(formData.get("runtimeLimitMs")), enabled: formData.get("enabled") === "on" };
    const endpoint = competition ? `/api/admin/competitions/${competition.id}` : "/api/admin/competitions";
    const res = await fetch(endpoint, { method: competition ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "保存失败");
    router.push("/admin/competitions");
    router.refresh();
  }
  return <form action={submit} className="mt-4 grid gap-4"><Field label="标题"><input name="title" defaultValue={competition?.title ?? ""} required /></Field><Field label="比赛说明"><textarea name="description" defaultValue={competition?.description ?? ""} required /></Field><div className="grid gap-4 md:grid-cols-2"><Field label="评分指标"><select name="metric" defaultValue={competition?.metric ?? "accuracy"}>{competitionMetrics.map((metric) => <option key={metric} value={metric}>{metric}</option>)}</select></Field><Field label="运行限制 ms"><input name="runtimeLimitMs" type="number" defaultValue={competition?.runtimeLimitMs ?? 10000} /></Field></div><Field label="隐藏测试集目录"><input name="hiddenTestDataDir" defaultValue={competition?.hiddenTestDataDir ?? ""} required /></Field><Field label="答案 CSV 路径"><input name="answerCsvPath" defaultValue={competition?.answerCsvPath ?? ""} required /></Field><Field label="代码模板"><textarea name="codeTemplate" defaultValue={competition?.codeTemplate || defaultTemplate} /></Field><label className="flex items-center gap-2 text-sm font-medium"><input className="w-auto" name="enabled" type="checkbox" defaultChecked={competition?.enabled ?? true} />启用</label>{error && <p className="text-sm text-red-600">{error}</p>}<Button>保存比赛</Button></form>;
}
