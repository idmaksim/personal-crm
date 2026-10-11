"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [, startTransition] = useTransition();
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(timeout.current);
  }, []);

  function onChange(next: string) {
    setValue(next);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (next.trim()) params.set("q", next.trim());
      startTransition(() => {
        router.replace(params.toString() ? `/?${params.toString()}` : "/");
      });
    }, 250);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Поиск по имени, телефону или почте"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
        aria-label="Поиск контактов"
      />
    </div>
  );
}
