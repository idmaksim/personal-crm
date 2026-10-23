"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteContact, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
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

type DeleteContactButtonProps = {
  contactId: number;
  contactName: string;
  // "button" — labelled button for the contact card; "icon" — trash icon for list rows.
  variant?: "button" | "icon";
};

export function DeleteContactButton({
  contactId,
  contactName,
  variant = "button",
}: DeleteContactButtonProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteContact,
    undefined,
  );

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Удалить контакт ${contactName}`}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
          </Button>
        ) : (
          <Button variant="outline" className="text-destructive hover:bg-destructive/10">
            <Trash2 /> Удалить
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить контакт «{contactName}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Заметки этого контакта тоже удалятся. Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state?.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} className="w-full sm:w-auto">
            Отмена
          </AlertDialogCancel>
          <form action={formAction} className="w-full sm:w-auto">
            <input type="hidden" name="contactId" value={contactId} />
            <Button
              type="submit"
              variant="destructive"
              disabled={pending}
              className="w-full"
            >
              {pending ? "Удаляю…" : "Удалить"}
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
