"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { createGroup, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createGroup,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Clear the field after a successful create.
    if (state?.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-[12rem] flex-1">
          <Input
            name="name"
            placeholder="Новая группа"
            aria-label="Название новой группы"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <Plus /> {pending ? "Создаю…" : "Создать"}
        </Button>
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
