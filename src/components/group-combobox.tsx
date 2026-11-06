"use client";

import { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  dropdownItemClassName,
  dropdownPanelClassName,
} from "@/components/ui/dropdown-panel";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Normalize a name for matching, mirroring the server rule (case-insensitive,
// "ё" folded into "е").
function normalize(name: string) {
  return name.trim().toLowerCase().replace(/ё/g, "е");
}

type GroupComboboxProps = {
  // All existing group names, offered as suggestions.
  options: string[];
  // Names to leave out of suggestions (already assigned/chosen).
  exclude: string[];
  // Called with the picked existing name or a brand-new typed name.
  onPick: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

// Type-to-pick field: suggests existing groups as you type and, when nothing
// matches, offers to create the typed name. No separate "add" button.
export function GroupCombobox({
  options,
  exclude,
  onPick,
  placeholder = "Добавить группу",
  disabled,
}: GroupComboboxProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const excludeKeys = new Set(exclude.map(normalize));
  const valueKey = normalize(value);

  const suggestions = options
    .filter((name) => !excludeKeys.has(normalize(name)))
    .filter((name) => (valueKey ? normalize(name).includes(valueKey) : true));

  const existsExactly = options.some((name) => normalize(name) === valueKey);
  const alreadyChosen = valueKey !== "" && excludeKeys.has(valueKey);
  const showCreate = valueKey !== "" && !existsExactly && !alreadyChosen;

  // Items the keyboard can move through: suggestions first, then the create row.
  const itemCount = suggestions.length + (showCreate ? 1 : 0);

  function pick(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    onPick(trimmed);
    setValue("");
    setActive(0);
    setOpen(false);
  }

  function choose(index: number) {
    if (index < suggestions.length) {
      pick(suggestions[index]);
    } else if (showCreate) {
      pick(value);
    }
  }

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on a dropdown item registers before it closes.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, Math.max(0, itemCount - 1)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (itemCount > 0) choose(active);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && itemCount > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            dropdownPanelClassName,
            "absolute z-50 mt-1 max-h-60 w-full overflow-auto",
          )}
          // Keep focus on the input so onBlur/click ordering stays predictable.
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((name, index) => (
            <li key={name} role="option" aria-selected={active === index}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  clearTimeout(blurTimer.current);
                  pick(name);
                }}
                className={cn(
                  dropdownItemClassName,
                  "w-full text-left",
                  active === index ? "bg-band" : "hover:bg-band",
                )}
              >
                {name}
              </button>
            </li>
          ))}

          {showCreate ? (
            <li role="option" aria-selected={active === suggestions.length}>
              <button
                type="button"
                onMouseEnter={() => setActive(suggestions.length)}
                onClick={() => {
                  clearTimeout(blurTimer.current);
                  pick(value);
                }}
                className={cn(
                  dropdownItemClassName,
                  "flex w-full items-center gap-2 text-left",
                  active === suggestions.length ? "bg-band" : "hover:bg-band",
                )}
              >
                <Plus className="size-4 shrink-0 text-muted-foreground" />
                <span>
                  Создать «<span className="font-medium">{value.trim()}</span>»
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {open && alreadyChosen ? (
        <div
          className={cn(
            dropdownPanelClassName,
            "absolute z-50 mt-1 w-full p-3 text-sm text-muted-foreground",
          )}
        >
          «{value.trim()}» уже добавлена
        </div>
      ) : null}
    </div>
  );
}
