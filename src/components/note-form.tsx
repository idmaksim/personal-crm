"use client";

import { useActionState, useState } from "react";
import { MessageCircle } from "lucide-react";
import { addNote, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ contactId }: { contactId: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addNote,
    undefined,
  );

  // Collapse the form right after a successful save. Adjusting state during
  // render (guarded so it runs once per new result) is React's recommended
  // alternative to calling setState inside an effect. Collapsing unmounts the
  // form, so the textarea starts empty again next time it opens.
  const [handled, setHandled] = useState<ActionState>(undefined);
  if (state?.message && state !== handled) {
    setHandled(state);
    setOpen(false);
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <MessageCircle /> Пообщались
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="contactId" value={contactId} />
      <Textarea
        name="body"
        placeholder="Как пообщались? Можно оставить пустым"
        aria-label="Как пообщались?"
        rows={3}
        autoFocus
      />
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
