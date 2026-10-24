"use client";

import { useActionState, useRef } from "react";
import { setContactFrequency, type ActionState } from "@/app/actions";
import type { ContactFrequency } from "@/db/schema";
import { FrequencySelect } from "@/components/frequency-select";
import { Label } from "@/components/ui/label";

export function ContactFrequencyForm({
  contactId,
  frequency,
}: {
  contactId: number;
  frequency: ContactFrequency | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setContactFrequency,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="contactId" value={contactId} />
      <Label htmlFor="frequency">Как часто общаться</Label>
      <FrequencySelect
        id="frequency"
        name="frequency"
        defaultValue={frequency ?? ""}
        disabled={pending}
        // Save right on change, there is no "Save" button
        onChange={() => formRef.current?.requestSubmit()}
      />
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
