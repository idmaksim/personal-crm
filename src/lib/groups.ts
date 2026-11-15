// Pure, database-free group logic shared by the UI. The matching rule here
// mirrors the server's SQL normalization (translate(lower(name), 'ё', 'е')) so
// the field's suggestions and de-duplication agree with what the database will
// actually store and treat as a duplicate.

// Normalize a group name for comparison: trim the edges, lower-case it and fold
// "ё" into "е". Leading/trailing spaces are dropped; inner spaces are kept. An
// empty or whitespace-only name normalizes to "".
export function normalizeGroupName(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, "е");
}

export type GroupOptions = {
  // Existing groups to suggest, in the order they were given.
  suggestions: string[];
  // Whether to offer "create «value»" — the typed name is new for this owner.
  showCreate: boolean;
  // Whether the typed name is one that is already assigned/chosen.
  alreadyChosen: boolean;
};

// Decide what a group field offers for the current input: which existing groups
// to suggest, whether to offer creating the typed name, and whether the typed
// name is already chosen. `options` are all existing names; `exclude` are names
// already assigned/chosen (hidden from suggestions).
export function computeGroupOptions({
  options,
  exclude,
  value,
}: {
  options: string[];
  exclude: string[];
  value: string;
}): GroupOptions {
  const excludeKeys = new Set(exclude.map(normalizeGroupName));
  const valueKey = normalizeGroupName(value);

  const suggestions = options
    .filter((name) => !excludeKeys.has(normalizeGroupName(name)))
    .filter((name) =>
      valueKey ? normalizeGroupName(name).includes(valueKey) : true,
    );

  const existsExactly = options.some(
    (name) => normalizeGroupName(name) === valueKey,
  );
  const alreadyChosen = valueKey !== "" && excludeKeys.has(valueKey);
  const showCreate = valueKey !== "" && !existsExactly && !alreadyChosen;

  return { suggestions, showCreate, alreadyChosen };
}

// Read the repeatable ?group param (string | string[] | undefined) into a list
// of positive integer ids, dropping anything that is not one (empty, non-numeric
// or fractional). Group ids are positive serials, so 0 and below are never real.
export function parseGroupIds(raw: string | string[] | undefined): number[] {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const ids: number[] = [];
  for (const value of values) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }
  return ids;
}
