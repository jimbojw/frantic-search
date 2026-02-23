// SPDX-License-Identifier: Apache-2.0

export interface CardLensEntry {
  canonicalFace: number;
  name: string;
  releasedAt: string;
  cmc: number;
  manaCostLength: number;
  complexity: number;
  colorIdentity: number;
}

export interface LensOrderings {
  lens_name: number[];
  lens_chronology: number[];
  lens_mana_curve: number[];
  lens_complexity: number[];
  lens_color_identity: number[];
}

const cmp = new Intl.Collator("en", { sensitivity: "base" });

function sortedFaces(
  entries: CardLensEntry[],
  key: (e: CardLensEntry) => number | string,
  numeric: boolean,
): number[] {
  const sorted = [...entries].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const primary = numeric
      ? (ka as number) - (kb as number)
      : (ka as string) < (kb as string)
        ? -1
        : (ka as string) > (kb as string)
          ? 1
          : 0;
    return primary || cmp.compare(a.name, b.name);
  });
  return sorted.map((e) => e.canonicalFace);
}

export function computeLensOrderings(entries: CardLensEntry[]): LensOrderings {
  const lens_name = [...entries]
    .sort((a, b) => cmp.compare(a.name, b.name))
    .map((e) => e.canonicalFace);

  const lens_chronology = sortedFaces(
    entries,
    (e) => e.releasedAt,
    false,
  );

  const gray = (v: number) => v ^ (v >> 1);

  const lens_mana_curve = [...entries]
    .sort(
      (a, b) =>
        a.cmc - b.cmc ||
        gray(a.colorIdentity) - gray(b.colorIdentity) ||
        a.manaCostLength - b.manaCostLength ||
        cmp.compare(a.name, b.name),
    )
    .map((e) => e.canonicalFace);

  const lens_complexity = sortedFaces(entries, (e) => e.complexity, true);
  const lens_color_identity = [...entries]
    .sort(
      (a, b) =>
        gray(a.colorIdentity) - gray(b.colorIdentity) ||
        a.cmc - b.cmc ||
        cmp.compare(a.name, b.name),
    )
    .map((e) => e.canonicalFace);

  return { lens_name, lens_chronology, lens_mana_curve, lens_complexity, lens_color_identity };
}
