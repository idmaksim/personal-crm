"use client";

import { useActionState, useEffect, useRef } from "react";
import { addNote, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ contactId }: { contactId: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addNote,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Clear the textarea after a successful submit (no error returned)
    if (!pending && !state?.error) {
      formRef.current?.reset();
    }
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="contactId" value={contactId} />
      <Textarea
        name="body"
        placeholder="Дописать заметку после разговора: о чём договорились…"
        rows={3}
        required
      />
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохраняю…" : "Добавить заметку"}
      </Button>
    </form>
  );
}
