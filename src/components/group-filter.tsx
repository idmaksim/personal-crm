"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type GroupRef = { id: number; name: string };

type GroupFilterProps = {
  // Currently applied groups (shown as active chips, click to remove).
  selected: GroupRef[];
  // Groups that can be added next (already ordered most-used first, and limited
  // to ones that keep the result non-empty). Does not include selected ones.
  candidates: GroupRef[];
};

// Multi-select group filter above the contact list. Selecting several groups
// narrows the list to contacts in all of them (intersection). The selection
// lives in the URL as repeated ?group=<id> params so it survives paging.
export function GroupFilter({ selected, candidates }: GroupFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [clamp, setClamp] = useState<{ height: number; hidden: number } | null>(null);

  const selectedIds = new Set(selected.map((g) => g.id));

  function navigate(ids: Set<number>) {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    for (const id of ids) params.append("group", String(id));
    // Changing the filter resets to the first page (page is omitted).
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/"));
  }

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    navigate(next);
  }

  // Measure how many chips spill past two rows so we can clamp and offer an
  // "expand" control. Runs after layout and on resize; offsetTop stays accurate
  // even while the container is clipped.
  useLayoutEffect(() => {
    const container = chipsRef.current;
    if (!container) return;

    const measure = () => {
      const children = Array.from(container.children) as HTMLElement[];
      if (children.length === 0) {
        setClamp(null);
        return;
      }
      const tops = [...new Set(children.map((c) => c.offsetTop))].sort((a, b) => a - b);
      if (tops.length <= 2) {
        setClamp(null);
        return;
      }
      const secondRowTop = tops[1];
      const thirdRowTop = tops[2];
      const height = Math.max(
        ...children
          .filter((c) => c.offsetTop === secondRowTop)
          .map((c) => c.offsetTop + c.offsetHeight),
      );
      const hidden = children.filter((c) => c.offsetTop >= thirdRowTop).length;
      setClamp({ height, hidden });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selected, candidates]);

  const chips = [
    ...selected.map((g) => ({ ...g, active: true })),
    ...candidates.map((g) => ({ ...g, active: false })),
  ];

  const collapsed = clamp !== null && !expanded;

  return (
    <div className="space-y-2">
      {chips.length > 0 ? (
        <div
          ref={chipsRef}
          className="relative flex flex-wrap gap-2 overflow-hidden"
          style={collapsed ? { maxHeight: clamp.height } : undefined}
        >
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => toggle(chip.id)}
              disabled={pending}
              aria-pressed={chip.active}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50",
                chip.active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:bg-band",
              )}
            >
              {chip.name}
              {chip.active ? <X className="size-3.5" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {clamp !== null ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" /> Свернуть
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" /> Ещё {clamp.hidden}
              </>
            )}
          </button>
        ) : null}

        <Link
          href="/groups"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="size-3.5" /> Управление группами
        </Link>
      </div>
    </div>
  );
}
