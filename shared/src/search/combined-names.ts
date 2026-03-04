// SPDX-License-Identifier: Apache-2.0

/**
 * Build facesOf map from canonical_face, then for each face i:
 * facesOf(canonical_face[i]).map(j => names[j]).join(" // ")
 */
export function computeCombinedNames(
  names: string[],
  canonicalFace: number[],
): string[] {
  const facesOf = new Map<number, number[]>();
  for (let i = 0; i < names.length; i++) {
    const cf = canonicalFace[i];
    let faces = facesOf.get(cf);
    if (!faces) {
      faces = [];
      facesOf.set(cf, faces);
    }
    faces.push(i);
  }

  const result: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const cf = canonicalFace[i];
    const faces = facesOf.get(cf) ?? [];
    result.push(faces.map((j) => names[j]).join(" // "));
  }
  return result;
}
