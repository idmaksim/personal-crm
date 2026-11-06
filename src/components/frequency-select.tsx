"use client";

import * as React from "react";
import { FREQUENCY_LABELS } from "@/lib/frequency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Radix Select forbids an empty-string item value, so "unset" uses a sentinel
// that maps back to "" in the hidden input the form submits.
const UNSET = "__unset__";

type FrequencySelectProps = {
  id?: string;
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  className?: string;
  // Called with the resolved value ("" for unset) after the user picks one.
  onValueChange?: (value: string) => void;
};

export function FrequencySelect({
  id,
  name,
  defaultValue = "",
  disabled,
  className,
  onValueChange,
}: FrequencySelectProps) {
  const initial = defaultValue === "" ? UNSET : defaultValue;
  // Uncontrolled Radix Select; we only mirror the chosen value into the hidden
  // input so a surrounding <form> (e.g. "add contact") submits it.
  const [submitted, setSubmitted] = React.useState(defaultValue);

  function handleChange(next: string) {
    const resolved = next === UNSET ? "" : next;
    setSubmitted(resolved);
    onValueChange?.(resolved);
  }

  return (
    <>
      <input type="hidden" name={name} value={submitted} />
      <Select
        defaultValue={initial}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger id={id} className={className}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>Не задано</SelectItem>
          {Object.entries(FREQUENCY_LABELS).map(([itemValue, label]) => (
            <SelectItem key={itemValue} value={itemValue}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
