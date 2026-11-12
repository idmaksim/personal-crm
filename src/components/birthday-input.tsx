"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BirthdayFields = { day: string; month: string; year: string };

export const EMPTY_BIRTHDAY: BirthdayFields = { day: "", month: "", year: "" };

// Nominative Russian month names, index 0 = January.
export const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

// Radix Select forbids an empty-string item value, so "unset" uses a sentinel
// that maps back to "" (matching FrequencySelect).
const MONTH_UNSET = "__unset__";

// Keep only digits, capped to `max` characters.
function digits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

// Day / month / year inputs for a contact's date of birth. The year is optional.
// Controlled: the parent keeps the value and submits it (field names birthDay /
// birthMonth / birthYear) or saves it directly.
export function BirthdayInput({
  value,
  onChange,
  disabled,
}: {
  value: BirthdayFields;
  onChange: (next: BirthdayFields) => void;
  disabled?: boolean;
}) {
  const monthValue = value.month === "" ? MONTH_UNSET : value.month;

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium leading-none text-foreground">
        Дата рождения
      </legend>
      <div className="grid grid-cols-[5.5rem_1fr_5.5rem] gap-2">
        <Input
          name="birthDay"
          type="text"
          inputMode="numeric"
          placeholder="День"
          aria-label="День рождения"
          value={value.day}
          onChange={(e) =>
            onChange({ ...value, day: digits(e.target.value, 2) })
          }
        />
        {/* Hidden field mirrors the chosen month so a surrounding <form> submits it. */}
        <input type="hidden" name="birthMonth" value={value.month} />
        <Select
          value={monthValue}
          disabled={disabled}
          onValueChange={(next) =>
            onChange({ ...value, month: next === MONTH_UNSET ? "" : next })
          }
        >
          <SelectTrigger aria-label="Месяц рождения">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={MONTH_UNSET}>Месяц</SelectItem>
            {MONTH_NAMES.map((label, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          name="birthYear"
          type="text"
          inputMode="numeric"
          placeholder="Год"
          aria-label="Год рождения (необязательно)"
          value={value.year}
          onChange={(e) =>
            onChange({ ...value, year: digits(e.target.value, 4) })
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">Год можно не указывать</p>
    </fieldset>
  );
}
