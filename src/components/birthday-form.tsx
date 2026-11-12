"use client";

import { useState, useTransition } from "react";
import { setBirthday } from "@/app/actions";
import {
  BirthdayInput,
  type BirthdayFields,
} from "@/components/birthday-input";
import { Button } from "@/components/ui/button";

export function BirthdayForm({
  contactId,
  birthDay,
  birthMonth,
  birthYear,
}: {
  contactId: number;
  birthDay: number | null;
  birthMonth: number | null;
  birthYear: number | null;
}) {
  const saved: BirthdayFields = {
    day: birthDay?.toString() ?? "",
    month: birthMonth?.toString() ?? "",
    year: birthYear?.toString() ?? "",
  };
  const [value, setValue] = useState<BirthdayFields>(saved);
  // The last persisted value; the Save button shows only while the fields
  // differ from it, and disappears again once the save lands.
  const [baseline, setBaseline] = useState<BirthdayFields>(saved);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const dirty =
    value.day !== baseline.day ||
    value.month !== baseline.month ||
    value.year !== baseline.year;

  function save() {
    startTransition(async () => {
      const state = await setBirthday(contactId, {
        day: value.day,
        month: value.month,
        year: value.year,
      });
      if (state?.error) {
        setError(state.error);
      } else {
        setError(undefined);
        setBaseline(value);
      }
    });
  }

  return (
    <div className="space-y-2">
      <BirthdayInput
        value={value}
        disabled={pending}
        onChange={(next) => {
          setValue(next);
          setError(undefined);
        }}
      />
      {dirty || error ? (
        <div className="flex items-center gap-3">
          {dirty ? (
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? "Сохраняю…" : "Сохранить"}
            </Button>
          ) : null}
          {error ? (
            <span className="text-sm text-destructive">{error}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
