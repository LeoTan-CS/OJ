"use client";

import { useId, useState, type ReactNode } from "react";

export function CollapsiblePanel({
  header,
  actions,
  children,
  defaultExpanded = true,
  className = "",
}: {
  header: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <section className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        <div className="flex items-center gap-3">
          {actions}
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={expanded}
            aria-label={expanded ? "收起当前批次" : "展开当前批次"}
            onClick={() => setExpanded((value) => !value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 transition hover:bg-slate-50"
          >
            <span
              aria-hidden="true"
              className={`block text-base leading-none transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              ▶
            </span>
          </button>
        </div>
      </div>

      {expanded && <div id={contentId}>{children}</div>}
    </section>
  );
}
