import { cn } from "@/lib/utils";

// Circle avatar with initials, mirroring the landing's contact rows.
// Palette is picked deterministically from the name so it stays stable.
const palettes = [
  "bg-av-gold-bg text-av-gold-ink",
  "bg-av-green-bg text-av-green-ink",
  "bg-av-purple-bg text-av-purple-ink",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function paletteFor(name: string): string {
  let sum = 0;
  for (const ch of name) sum += ch.codePointAt(0) ?? 0;
  return palettes[sum % palettes.length];
}

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        paletteFor(name),
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
