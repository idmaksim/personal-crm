"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createContact, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FrequencySelect } from "@/components/frequency-select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function AddContactForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createContact,
    undefined,
  );

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Plus /> Добавить контакт
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Имя *</Label>
            <Input id="name" name="name" placeholder="Иван Петров" autoFocus required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="relationship">Откуда знакомы</Label>
            <Input
              id="relationship"
              name="relationship"
              placeholder="Университет, бывшая работа…"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" name="phone" placeholder="+7 900 000-00-00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Почта</Label>
              <Input id="email" name="email" type="email" placeholder="ivan@example.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="frequency">Как часто общаться</Label>
            <FrequencySelect id="frequency" name="frequency" defaultValue="" />
          </div>

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
      </CardContent>
    </Card>
  );
}
