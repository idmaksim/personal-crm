"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { addGroupToContact, removeGroupFromContact } from "@/app/actions";
import { GroupCombobox } from "@/components/group-combobox";

type GroupRef = { id: number; name: string };

type ContactGroupsEditorProps = {
  contactId: number;
  // Groups currently assigned to this contact.
  assigned: GroupRef[];
  // All groups, used as suggestions in the combobox.
  allGroups: GroupRef[];
};

export function ContactGroupsEditor({
  contactId,
  assigned,
  allGroups,
}: ContactGroupsEditorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function assign(name: string) {
    const formData = new FormData();
    formData.set("contactId", String(contactId));
    formData.set("name", name);
    startTransition(async () => {
      const result = await addGroupToContact(undefined, formData);
      setError(result?.error);
    });
  }

  function remove(groupId: number) {
    const formData = new FormData();
    formData.set("contactId", String(contactId));
    formData.set("groupId", String(groupId));
    startTransition(async () => {
      const result = await removeGroupFromContact(undefined, formData);
      setError(result?.error);
    });
  }

  return (
    <div className="space-y-3">
      {assigned.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {assigned.map((group) => (
            <li key={group.id}>
              <span className="inline-flex items-center gap-1 rounded-full border border-input bg-band py-1 pl-3 pr-1 text-sm">
                {group.name}
                <button
                  type="button"
                  onClick={() => remove(group.id)}
                  disabled={pending}
                  aria-label={`Снять группу ${group.name}`}
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Групп пока нет</p>
      )}

      <GroupCombobox
        options={allGroups.map((g) => g.name)}
        exclude={assigned.map((g) => g.name)}
        onPick={assign}
        disabled={pending}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
