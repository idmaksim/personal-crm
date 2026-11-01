"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { GroupCombobox } from "@/components/group-combobox";
import { Label } from "@/components/ui/label";

// Normalize a name for local de-duplication, mirroring the server rule.
function normalize(name: string) {
  return name.trim().toLowerCase().replace(/ё/g, "е");
}

// Collects the groups chosen for a brand-new contact. The chosen names are
// submitted as repeated hidden "groups" fields; createContact creates any
// missing ones and links them.
export function GroupSelectField({ allGroups }: { allGroups: string[] }) {
  const [chosen, setChosen] = useState<string[]>([]);

  function add(name: string) {
    const key = normalize(name);
    if (!key) return;
    if (chosen.some((n) => normalize(n) === key)) return;
    setChosen((prev) => [...prev, name.trim()]);
  }

  function remove(name: string) {
    setChosen((prev) => prev.filter((n) => n !== name));
  }

  return (
    <div className="space-y-2">
      <Label>Группы</Label>

      {chosen.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((name) => (
            <li key={name}>
              <span className="inline-flex items-center gap-1 rounded-full border border-input bg-band py-1 pl-3 pr-1 text-sm">
                {name}
                <button
                  type="button"
                  onClick={() => remove(name)}
                  aria-label={`Убрать группу ${name}`}
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <GroupCombobox
        options={allGroups}
        exclude={chosen}
        onPick={add}
        placeholder="Выбрать или ввести новую"
      />

      {/* Chosen groups travel with the form as repeated "groups" fields. */}
      {chosen.map((name) => (
        <input key={name} type="hidden" name="groups" value={name} />
      ))}
    </div>
  );
}
