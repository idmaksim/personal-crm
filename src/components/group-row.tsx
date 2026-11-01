"use client";

import { useActionState, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { renameGroup, deleteGroup, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type GroupRowProps = {
  group: { id: number; name: string };
  contactCount: number;
};

export function GroupRow({ group, contactCount }: GroupRowProps) {
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState<
    ActionState,
    FormData
  >(renameGroup, undefined);

  // Leave edit mode after a successful rename. Adjusting state during render
  // (guarded so it runs once per new result) is React's recommended alternative
  // to calling setState inside an effect.
  const [handled, setHandled] = useState<ActionState>(undefined);
  if (renameState?.message && renameState !== handled) {
    setHandled(renameState);
    setEditing(false);
  }

  return (
    <div className="space-y-2 p-4">
      <div className="flex items-center justify-between gap-3">
        {editing ? (
          <form
            action={renameAction}
            className="flex flex-1 items-center gap-2"
          >
            <input type="hidden" name="groupId" value={group.id} />
            <Input
              name="name"
              defaultValue={group.name}
              aria-label={`Новое название группы ${group.name}`}
              autoFocus
              autoComplete="off"
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              disabled={renamePending}
              aria-label="Сохранить название"
            >
              <Check />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setEditing(false)}
              aria-label="Отменить переименование"
            >
              <X />
            </Button>
          </form>
        ) : (
          <>
            <div className="min-w-0">
              <p className="truncate font-medium">{group.name}</p>
              <p className="text-xs text-muted-foreground">
                {contactCount > 0
                  ? `Контактов: ${contactCount}`
                  : "Нет контактов"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setEditing(true)}
                aria-label={`Переименовать группу ${group.name}`}
                className="text-muted-foreground"
              >
                <Pencil />
              </Button>
              <DeleteGroupButton groupId={group.id} name={group.name} />
            </div>
          </>
        )}
      </div>

      {editing && renameState?.error ? (
        <p className="text-sm text-destructive">{renameState.error}</p>
      ) : null}
    </div>
  );
}

function DeleteGroupButton({
  groupId,
  name,
}: {
  groupId: number;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteGroup,
    undefined,
  );

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Удалить группу ${name}`}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить группу «{name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Контакты останутся — у них просто пропадёт эта метка. Это действие
            нельзя отменить.
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
            <input type="hidden" name="groupId" value={groupId} />
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
