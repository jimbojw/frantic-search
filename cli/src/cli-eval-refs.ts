// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import type {
  ArtistIndexData,
  ColumnarData,
  FlavorTagData,
  IllustrationTagData,
  KeywordDataRef,
  OracleTagData,
  PrintingColumnarData,
  TagDataRef,
} from "@frantic-search/shared";
import {
  normalizeArtistIndexForSearch,
  normalizeFlavorIndexForSearch,
  resolveIllustrationTagsToPrintingRows,
} from "@frantic-search/shared";

export interface SupplementalDistPaths {
  otags: string;
  atags: string;
  flavorIndex: string;
  artistIndex: string;
}

/** Supplemental JSON files live alongside columns.json in the same dist directory. */
export function defaultSupplementalPathsForDistDir(distDir: string): SupplementalDistPaths {
  return {
    otags: path.join(distDir, "otags.json"),
    atags: path.join(distDir, "atags.json"),
    flavorIndex: path.join(distDir, "flavor-index.json"),
    artistIndex: path.join(distDir, "artist-index.json"),
  };
}

export interface BuildCliEvalRefsOptions {
  /** When true, skip loading otags/atags/flavor/artist from disk (keywords still from columns). */
  noSupplemental?: boolean;
  supplementalPaths?: Partial<SupplementalDistPaths>;
}

export function supplementalPathsFromCliFlags(flags: {
  otags?: string;
  atags?: string;
  flavorIndex?: string;
  artistIndex?: string;
}): Partial<SupplementalDistPaths> | undefined {
  const out: Partial<SupplementalDistPaths> = {};
  if (flags.otags) out.otags = flags.otags;
  if (flags.atags) out.atags = flags.atags;
  if (flags.flavorIndex) out.flavorIndex = flags.flavorIndex;
  if (flags.artistIndex) out.artistIndex = flags.artistIndex;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build TagDataRef and KeywordDataRef for CLI NodeCache — same data shape as the app worker.
 */
export function buildCliEvalRefs(
  data: ColumnarData,
  printingData: PrintingColumnarData | null,
  columnsJsonDir: string,
  options?: BuildCliEvalRefsOptions,
): { tagDataRef: TagDataRef; keywordDataRef: KeywordDataRef } {
  const paths = {
    ...defaultSupplementalPathsForDistDir(columnsJsonDir),
    ...options?.supplementalPaths,
  };

  const tagDataRef: TagDataRef = {
    oracle: null,
    illustration: null,
    flavor: null,
    artist: null,
  };

  const keywordDataRef: KeywordDataRef = {
    keywords: data.keywords_index ?? {},
  };

  if (options?.noSupplemental) {
    return { tagDataRef, keywordDataRef };
  }

  if (fs.existsSync(paths.otags)) {
    try {
      tagDataRef.oracle = JSON.parse(fs.readFileSync(paths.otags, "utf-8")) as OracleTagData;
    } catch {
      /* leave null */
    }
  }

  if (printingData && fs.existsSync(paths.atags)) {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.atags, "utf-8")) as IllustrationTagData;
      tagDataRef.illustration = resolveIllustrationTagsToPrintingRows(raw, printingData);
    } catch {
      /* leave null */
    }
  }

  if (fs.existsSync(paths.flavorIndex)) {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.flavorIndex, "utf-8")) as FlavorTagData;
      tagDataRef.flavor = normalizeFlavorIndexForSearch(raw);
    } catch {
      /* leave null */
    }
  }

  if (fs.existsSync(paths.artistIndex)) {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.artistIndex, "utf-8")) as ArtistIndexData;
      tagDataRef.artist = normalizeArtistIndexForSearch(raw);
    } catch {
      /* leave null */
    }
  }

  return { tagDataRef, keywordDataRef };
}
