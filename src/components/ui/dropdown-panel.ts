// Shared look for the floating list panel that drops open from a control — the
// Radix Select ("how often") and the group combobox ("add group"). Their
// triggers differ on purpose (a select vs a type-to-filter input), but the
// panel and its rows should look identical, so both import these classes.

// The panel container: border, radius, surface and shadow. Callers add their own
// positioning and sizing (z-index, width, max-height, absolute/popper offsets).
export const dropdownPanelClassName =
  "rounded-[12px] border border-border bg-card p-1 shadow-lg";

// A single row: geometry only. Callers add the highlight with `bg-band` using
// whatever state selector fits (data-[highlighted], aria-selected, hover).
export const dropdownItemClassName =
  "cursor-default rounded-[8px] px-3 py-2 text-sm outline-none";
