// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import {
  TCGCSV_GROUPS_PATH,
  TCGCSV_META_PATH,
  TCGCSV_PRODUCTS_DIR,
  TCGCSV_PRODUCT_MAP_PATH,
  ensureDistDir,
} from "./paths";
import { log } from "./log";

interface TcgcsvMeta {
  groupIds?: number[];
  groupAbbrevs?: Record<string, string>;
}

interface ExtendedDataEntry {
  name?: string;
  value?: string;
}

interface TcgcsvProduct {
  productId?: number;
  groupId?: number;
  name?: string;
  extendedData?: ExtendedDataEntry[];
}

interface TcgcsvProductsResponse {
  success?: boolean;
  results?: TcgcsvProduct[];
}

/** Build product map from parsed data. Exported for testing. */
export function buildProductMapFromData(
  groupIds: number[],
  groupAbbrevs: Record<string, string>,
  productsByGroup: Record<number, TcgcsvProductsResponse>,
): Record<string, { setAbbrev: string; number: string; name: string }> {
  const productMap: Record<string, { setAbbrev: string; number: string; name: string }> = {};

  for (const groupId of groupIds) {
    const abbrev = groupAbbrevs[String(groupId)];
    if (!abbrev || abbrev === "") continue;

    const data = productsByGroup[groupId];
    if (!data) continue;

    const results = data.results ?? [];
    for (const product of results) {
      const productId = product.productId;
      if (productId == null) continue;

      const numberEntry = product.extendedData?.find((e) => e.name === "Number");
      const number = numberEntry?.value;
      if (!number || number === "") continue;

      productMap[String(productId)] = {
        setAbbrev: abbrev,
        number,
        name: product.name ?? "",
      };
    }
  }

  return productMap;
}

export function processTcgcsv(verbose: boolean): void {
  if (!fs.existsSync(TCGCSV_GROUPS_PATH) || !fs.existsSync(TCGCSV_META_PATH)) {
    log("TCGCSV raw data not found — skipping", true);
    return;
  }

  let meta: TcgcsvMeta;
  try {
    const raw = fs.readFileSync(TCGCSV_META_PATH, "utf-8");
    meta = JSON.parse(raw) as TcgcsvMeta;
  } catch (err) {
    process.stderr.write(
      `Warning: TCGCSV meta parse failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return;
  }

  const groupAbbrevs = meta.groupAbbrevs ?? {};
  const groupIds = meta.groupIds ?? [];

  const productsByGroup: Record<number, TcgcsvProductsResponse> = {};

  for (const groupId of groupIds) {
    const productPath = `${TCGCSV_PRODUCTS_DIR}/${groupId}.json`;
    if (!fs.existsSync(productPath)) {
      if (verbose) log(`TCGCSV: skipping group ${groupId} (no products file)`, verbose);
      continue;
    }

    try {
      const raw = fs.readFileSync(productPath, "utf-8");
      productsByGroup[groupId] = JSON.parse(raw) as TcgcsvProductsResponse;
    } catch (err) {
      process.stderr.write(
        `Warning: TCGCSV products parse failed for group ${groupId}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const productMap = buildProductMapFromData(groupIds, groupAbbrevs, productsByGroup);

  ensureDistDir();
  const tmpPath = TCGCSV_PRODUCT_MAP_PATH + ".tmp";
  fs.writeFileSync(
    tmpPath,
    JSON.stringify({ productMap }, null, 2) + "\n",
  );
  fs.renameSync(tmpPath, TCGCSV_PRODUCT_MAP_PATH);

  log(`TCGCSV product map: ${Object.keys(productMap).length} entries`, true);
}
