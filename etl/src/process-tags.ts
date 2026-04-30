// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import {
  COLUMNS_PATH,
  DEFAULT_CARDS_PATH,
  PRINTINGS_PATH,
  ORACLE_TAGS_PATH,
  ILLUSTRATION_TAGS_PATH,
  OTAGS_PATH,
  ATAGS_PATH,
  ensureDistDir,
} from "./paths";
import { loadRootJsonArray } from "./load-json-array";
import { log } from "./log";
import type { ColumnarData, PrintingColumnarData, OracleTagData, IllustrationTagData } from "@frantic-search/shared";

// ---------------------------------------------------------------------------
// Raw tag file shapes (Spec 091)
// ---------------------------------------------------------------------------

interface OracleTagEntry {
  object: "tag";
  label: string;
  oracle_ids: string[];
}

interface IllustrationTagEntry {
  object: "tag";
  label: string;
  illustration_ids: string[];
}

interface OracleTagResponse {
  object: "list";
  data: OracleTagEntry[];
}

interface IllustrationTagResponse {
  object: "list";
  data: IllustrationTagEntry[];
}

// ---------------------------------------------------------------------------
// Default-cards shape (fields we need)
// ---------------------------------------------------------------------------

interface DefaultCardFace {
  illustration_id?: string;
}

interface DefaultCard {
  id?: string;
  oracle_id?: string;
  illustration_id?: string;
  card_faces?: DefaultCardFace[];
}

/** Front-face illustration_id (multiface uses card_faces[0]). */
function getFrontIllustrationId(card: DefaultCard): string | undefined {
  return card.card_faces?.[0]?.illustration_id ?? card.illustration_id;
}

// ---------------------------------------------------------------------------
// Oracle tag processing
// ---------------------------------------------------------------------------

function buildOracleIdToFaceMap(columns: ColumnarData): Map<string, number> {
  const oracleIds = columns.oracle_ids;
  if (!oracleIds || oracleIds.length !== columns.canonical_face.length) {
    throw new Error(
      "columns.json must have oracle_ids (run processCards first); oracle_ids length must match canonical_face",
    );
  }
  const map = new Map<string, number>();
  for (let i = 0; i < oracleIds.length; i++) {
    const oid = oracleIds[i];
    if (oid && !map.has(oid)) {
      map.set(oid, columns.canonical_face[i]);
    }
  }
  return map;
}

function processOracleTags(verbose: boolean): OracleTagData | null {
  if (!fs.existsSync(ORACLE_TAGS_PATH)) {
    log("oracle-tags.json not found — skipping oracle tags", true);
    return null;
  }

  const columnsRaw = fs.readFileSync(COLUMNS_PATH, "utf-8");
  const columns: ColumnarData = JSON.parse(columnsRaw);
  const oracleIdMap = buildOracleIdToFaceMap(columns);

  const raw = fs.readFileSync(ORACLE_TAGS_PATH, "utf-8");
  const response: OracleTagResponse = JSON.parse(raw);

  const result: OracleTagData = {};
  let totalRefs = 0;
  let droppedTags = 0;

  for (const tag of response.data) {
    const faces = new Set<number>();
    for (const oid of tag.oracle_ids) {
      const face = oracleIdMap.get(oid);
      if (face !== undefined) {
        faces.add(face);
      }
    }
    if (faces.size === 0) {
      droppedTags++;
      continue;
    }
    const sorted = Array.from(faces).sort((a, b) => a - b);
    result[tag.label] = sorted;
    totalRefs += sorted.length;
  }

  log(`Oracle tags: ${Object.keys(result).length} tags, ${totalRefs} face indices, ${droppedTags} dropped`, verbose);
  return result;
}

// ---------------------------------------------------------------------------
// Illustration tag processing
// ---------------------------------------------------------------------------

async function buildIllustrationIdMap(
  verbose: boolean,
): Promise<Map<string, Array<[number, number]>>> {
  log("Building illustration_id → (face, illust_idx) map…", verbose);

  const printingsRaw = fs.readFileSync(PRINTINGS_PATH, "utf-8");
  const printings: PrintingColumnarData = JSON.parse(printingsRaw);

  const scryfallIds = printings.scryfall_ids;
  const canonicalFaceRef = printings.canonical_face_ref;
  const illustrationIdIndex = printings.illustration_id_index ?? [];

  const scryfallToPair = new Map<string, [number, number]>();
  for (let i = 0; i < scryfallIds.length; i++) {
    const sid = scryfallIds[i];
    if (sid && !scryfallToPair.has(sid)) {
      const face = canonicalFaceRef[i];
      const illustIdx = illustrationIdIndex[i] ?? 0;
      scryfallToPair.set(sid, [face, illustIdx]);
    }
  }

  const defaultCards: DefaultCard[] = await loadRootJsonArray<DefaultCard>(DEFAULT_CARDS_PATH);

  const illustrationIdMap = new Map<string, Array<[number, number]>>();
  for (const card of defaultCards) {
    const illId = getFrontIllustrationId(card);
    if (!illId || !card.id) continue;

    const pair = scryfallToPair.get(card.id);
    if (pair === undefined) continue;

    let arr = illustrationIdMap.get(illId);
    if (!arr) {
      arr = [];
      illustrationIdMap.set(illId, arr);
    }
    arr.push(pair);
  }

  log(`Mapped ${illustrationIdMap.size} illustration_ids to (face, illust_idx) pairs`, verbose);
  return illustrationIdMap;
}

async function processIllustrationTags(verbose: boolean): Promise<IllustrationTagData | null> {
  if (!fs.existsSync(ILLUSTRATION_TAGS_PATH)) {
    log("illustration-tags.json not found — skipping illustration tags", true);
    return null;
  }

  if (!fs.existsSync(DEFAULT_CARDS_PATH)) {
    log("default-cards.json not found — skipping illustration tags (required for join)", true);
    return null;
  }

  if (!fs.existsSync(PRINTINGS_PATH)) {
    log("printings.json not found — skipping illustration tags (required for join)", true);
    return null;
  }

  const illustrationIdMap = await buildIllustrationIdMap(verbose);

  const raw = fs.readFileSync(ILLUSTRATION_TAGS_PATH, "utf-8");
  const response: IllustrationTagResponse = JSON.parse(raw);

  const result: IllustrationTagData = {};
  let totalPairs = 0;
  let droppedTags = 0;

  for (const tag of response.data) {
    const pairs = new Map<string, [number, number]>();
    for (const illId of tag.illustration_ids) {
      const arr = illustrationIdMap.get(illId);
      if (!arr) continue;
      for (const p of arr) {
        const key = `${p[0]},${p[1]}`;
        if (!pairs.has(key)) {
          pairs.set(key, p);
        }
      }
    }
    if (pairs.size === 0) {
      droppedTags++;
      continue;
    }
    const sorted = Array.from(pairs.values()).sort((a, b) => {
      if (a[0] !== b[0]) return a[0] - b[0];
      return a[1] - b[1];
    });
    const strided: number[] = [];
    for (const [face, illustIdx] of sorted) {
      strided.push(face, illustIdx);
    }
    result[tag.label] = strided;
    totalPairs += sorted.length;
  }

  log(
    `Illustration tags: ${Object.keys(result).length} tags, ${totalPairs} pairs, ${droppedTags} dropped`,
    verbose,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function processTags(verbose: boolean): Promise<void> {
  if (!fs.existsSync(ORACLE_TAGS_PATH) && !fs.existsSync(ILLUSTRATION_TAGS_PATH)) {
    log("No tag files found (oracle-tags.json, illustration-tags.json) — skipping tag processing", true);
    return;
  }

  if (!fs.existsSync(COLUMNS_PATH)) {
    throw new Error(
      `${COLUMNS_PATH} not found — run card processing first (processTags depends on columns.json)`,
    );
  }

  ensureDistDir();

  const otags = processOracleTags(verbose);
  if (otags !== null) {
    const json = JSON.stringify(otags);
    fs.writeFileSync(OTAGS_PATH, json);
    const size = Buffer.byteLength(json, "utf8");
    log(`Wrote otags.json (${(size / 1024 / 1024).toFixed(2)} MB)`, verbose);
  }

  const atags = await processIllustrationTags(verbose);
  if (atags !== null) {
    const json = JSON.stringify(atags);
    fs.writeFileSync(ATAGS_PATH, json);
    const size = Buffer.byteLength(json, "utf8");
    log(`Wrote atags.json (${(size / 1024 / 1024).toFixed(2)} MB)`, verbose);
  }
}
