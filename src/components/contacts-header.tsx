"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createContact, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FrequencySelect } from "@/components/frequency-select";
import {
  BirthdayInput,
  EMPTY_BIRTHDAY,
  type BirthdayFields,
} from "@/components/birthday-input";
import { GroupSelectField } from "@/components/group-select-field";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// Section header for the contacts list: the "Контакты" title with the
// "Добавить контакт" button, and the add-contact form that unfolds as a
// full-width card right below the header when opened.
export function ContactsHeader({ allGroups }: { allGroups: string[] }) {
  const [open, setOpen] = useState(false);
  const [birthday, setBirthday] = useState<BirthdayFields>(EMPTY_BIRTHDAY);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createContact,
    undefined,
  );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Контакты</h1>
        {!open ? (
          <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
            <Plus /> Добавить контакт
          </Button>
        ) : null}
      </div>

      {open ? (
        <Card>
          <CardContent className="pt-6">
            {/* One column on phones; two columns from the sm breakpoint up,
                with wide fields spanning both. */}
            <form action={formAction} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Имя *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Иван Петров"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="relationship">Откуда знакомы</Label>
                <Input
                  id="relationship"
                  name="relationship"
                  placeholder="Университет, бывшая работа…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <Input id="phone" name="phone" placeholder="+7 900 000-00-00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Почта</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="ivan@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frequency">Как часто общаться</Label>
                <FrequencySelect
                  id="frequency"
                  name="frequency"
                  defaultValue=""
                />
              </div>

              <BirthdayInput
                value={birthday}
                onChange={(patch) =>
                  setBirthday((prev) => ({ ...prev, ...patch }))
                }
              />

              <div className="sm:col-span-2">
                <GroupSelectField allGroups={allGroups} />
              </div>

              {state?.error ? (
                <p className="text-sm text-destructive sm:col-span-2">
                  {state.error}
                </p>
              ) : null}

              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Сохраняю…" : "Сохранить"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Отмена
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
