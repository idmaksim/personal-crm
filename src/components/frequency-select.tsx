import * as React from "react";
import { FREQUENCY_LABELS } from "@/lib/frequency";
import { cn } from "@/lib/utils";

// Native <select>: no extra dependency, and phones open their own picker.
export const FrequencySelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-[12px] border border-input bg-card px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <option value="">Не задано</option>
    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
      <option key={value} value={value}>
        {label}
      </option>
    ))}
  </select>
));
FrequencySelect.displayName = "FrequencySelect";
