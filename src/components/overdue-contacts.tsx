"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { addNote } from "@/app/actions";
import type { ContactFrequency } from "@/db/schema";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FREQUENCY_LABELS, formatShortDate, pluralizeDays } from "@/lib/frequency";

export type OverdueItem = {
  id: number;
  name: string;
  relationship: string | null;
  frequency: ContactFrequency;
  lastContactAt: Date;
  daysWaiting: number;
};

const VISIBLE_COUNT = 5;

function MarkContactedButton({
  contact,
  onSaved,
}: {
  contact: OverdueItem;
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await addNote(undefined, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (result?.message) onSaved(result.message);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(undefined);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Отметить разговор с ${contact.name}`}
          className="text-muted-foreground hover:bg-accent-bg hover:text-accent-ink"
        >
          <Check />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>О чём говорили?</AlertDialogTitle>
          <AlertDialogDescription>{contact.name}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          <input type="hidden" name="contactId" value={contact.id} />
          <Textarea
            name="body"
            placeholder="Можно оставить пустым"
            aria-label="О чём говорили?"
            rows={3}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending} className="w-full sm:w-auto">
              Отмена
            </AlertDialogCancel>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Сохраняю…" : "Сохранить"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function OverdueContacts({ contacts }: { contacts: OverdueItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const [confirmation, setConfirmation] = useState<string>();

  const visible = showAll ? contacts : contacts.slice(0, VISIBLE_COUNT);
  const hiddenCount = contacts.length - visible.length;

  if (contacts.length === 0 && !confirmation) return null;

  return (
    <section className="space-y-3">
      {confirmation ? (
        <p
          role="status"
          className="rounded-[12px] bg-accent-bg px-4 py-3 text-sm text-accent-ink"
        >
          {confirmation}
        </p>
      ) : null}

      {contacts.length > 0 ? (
        <>
          <h2 className="text-lg font-semibold">
            Пора связаться{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {contacts.length}
            </span>
          </h2>
          <ul className="space-y-2">
            {visible.map((c) => (
              <li key={c.id}>
                <Card className="p-4 shadow-none">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={c.name} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <Link
                            href={`/contacts/${c.id}`}
                            className="truncate font-semibold hover:underline"
                          >
                            {c.name}
                          </Link>
                          <span className="text-sm font-medium text-accent-ink">
                            ждёт {pluralizeDays(c.daysWaiting)}
                          </span>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {[
                            c.relationship,
                            FREQUENCY_LABELS[c.frequency],
                            `последнее общение ${formatShortDate(c.lastContactAt)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    <MarkContactedButton contact={c} onSaved={setConfirmation} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
              Показать ещё {hiddenCount}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
