"use client";

import { useState, useTransition } from "react";
import { setContactFrequency } from "@/app/actions";
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // No <form>/requestSubmit: a form action triggers React's post-submit reset,
  // which makes the Radix Select revert the just-picked value. Call the action
  // directly with the chosen value instead.
  function save(value: string) {
    startTransition(async () => {
      const state = await setContactFrequency(contactId, value);
      setError(state?.error);
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="frequency">Как часто общаться</Label>
      <FrequencySelect
        id="frequency"
        name="frequency"
        defaultValue={frequency ?? ""}
        disabled={pending}
        // Save right on change, there is no "Save" button.
        onValueChange={save}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
