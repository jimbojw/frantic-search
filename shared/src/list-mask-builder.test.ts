// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import {
  buildOracleToCanonicalFaceMap,
  buildPrintingLookup,
  buildMasksForList,
  buildMasksFromParsedEntries,
  getMatchingCount,
  hasPrintingLevelEntries,
  countListEntriesPerCard,
} from "./list-mask-builder";
import type {
  DisplayColumns,
  PrintingDisplayColumns,
  InstanceState,
  MaterializedView,
} from "@frantic-search/shared";

function inst(
  partial: Omit<
    InstanceState,
    "zone" | "tags" | "collection_status" | "variant"
  > &
    Partial<Pick<InstanceState, "zone" | "tags" | "collection_status" | "variant">>,
): InstanceState {
  return {
    zone: null,
    tags: [],
    collection_status: null,
    variant: null,
    ...partial,
  };
}

function makeDisplay(): DisplayColumns {
  return {
    names: ["Bolt", "Sol", "Counterspell"],
    mana_costs: ["{R}", "{1}", "{U}{U}"],
    type_lines: ["Instant", "Artifact", "Instant"],
    oracle_texts: ["", "", ""],
    powers: [0, 0, 0],
    toughnesses: [0, 0, 0],
    loyalties: [0, 0, 0],
    defenses: [0, 0, 0],
    color_identity: [0, 0, 0],
    scryfall_ids: ["sf1", "sf2", "sf3"],
    art_crop_thumb_hashes: ["", "", ""],
    card_thumb_hashes: ["", "", ""],
    layouts: ["normal", "normal", "normal"],
    legalities_legal: [0, 0, 0],
    legalities_banned: [0, 0, 0],
    legalities_restricted: [0, 0, 0],
    power_lookup: [],
    toughness_lookup: [],
    loyalty_lookup: [],
    defense_lookup: [],
    canonical_face: [0, 1, 2],
    oracle_ids: ["oid-bolt", "oid-sol", "oid-counterspell"],
    edhrec_rank: [null, null, null],
    edhrec_salt: [null, null, null],
  };
}

function makePrintingDisplay(): PrintingDisplayColumns {
  return {
    scryfall_ids: ["p-a", "p-b", "p-c"],
    collector_numbers: ["1", "2", "3"],
    set_codes: ["MH2", "MH2", "A25"],
    set_names: ["", "", ""],
    rarity: [0, 0, 0],
    finish: [0, 1, 0],
    price_usd: [100, 300, 50],
    canonical_face_ref: [0, 0, 0],
  };
}

function makeView(): MaterializedView {
  return {
    instances: new Map(),
    lists: new Map(),
    instancesByList: new Map(),
  };
}

describe("buildOracleToCanonicalFaceMap", () => {
  it("maps oracle_id to canonical face index", () => {
    const display = makeDisplay();
    const map = buildOracleToCanonicalFaceMap(display);
    expect(map.get("oid-bolt")).toBe(0);
    expect(map.get("oid-sol")).toBe(1);
    expect(map.get("oid-counterspell")).toBe(2);
  });

  it("handles multi-face cards (same oracle_id maps to canonical)", () => {
    const display = makeDisplay();
    display.oracle_ids = ["oid-a", "oid-a", "oid-b"];
    display.canonical_face = [0, 0, 2];
    const map = buildOracleToCanonicalFaceMap(display);
    expect(map.get("oid-a")).toBe(0);
    expect(map.get("oid-b")).toBe(2);
  });

  it("skips empty oracle_ids", () => {
    const display = makeDisplay();
    display.oracle_ids[1] = "";
    const map = buildOracleToCanonicalFaceMap(display);
    expect(map.has("")).toBe(false);
    expect(map.get("oid-bolt")).toBe(0);
  });
});

describe("buildPrintingLookup", () => {
  it("maps scryfall_id:finish to printing index", () => {
    const pd = makePrintingDisplay();
    const map = buildPrintingLookup(pd);
    expect(map.get("p-a:0")).toBe(0);
    expect(map.get("p-b:1")).toBe(1);
    expect(map.get("p-c:0")).toBe(2);
  });

  it("handles etched finish", () => {
    const pd = makePrintingDisplay();
    pd.finish = [0, 1, 2];
    const map = buildPrintingLookup(pd);
    expect(map.get("p-c:2")).toBe(2);
  });
});

describe("buildMasksForList", () => {
  const display = makeDisplay();
  const oracleMap = buildOracleToCanonicalFaceMap(display);
  const printingDisplay = makePrintingDisplay();
  const printingLookup = buildPrintingLookup(printingDisplay);

  it("returns zeroed faceMask for empty list", () => {
    const view = makeView();
    view.instancesByList.set("default", new Set());
    const { faceMask } = buildMasksForList({
      view,
      listId: "default",
      faceCount: 3,
      oracleToCanonicalFace: oracleMap,
    });
    expect(faceMask.length).toBe(3);
    expect(faceMask[0]).toBe(0);
    expect(faceMask[1]).toBe(0);
    expect(faceMask[2]).toBe(0);
  });

  it("omits printingMask for empty list", () => {
    const view = makeView();
    view.instancesByList.set("default", new Set());
    const result = buildMasksForList({
      view,
      listId: "default",
      faceCount: 3,
      printingCount: 3,
      oracleToCanonicalFace: oracleMap,
      printingLookup,
    });
    expect(result.printingMask).toBeUndefined();
  });

  it("sets faceMask for oracle-level entries", () => {
    const view = makeView();
    const uuids = new Set<string>();
    const uuid1 = "uuid-1";
    const uuid2 = "uuid-2";
    uuids.add(uuid1);
    uuids.add(uuid2);
    view.instancesByList.set("default", uuids);
    view.instances.set(
      uuid1,
      inst({
        uuid: uuid1,
        oracle_id: "oid-bolt",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    view.instances.set(
      uuid2,
      inst({
        uuid: uuid2,
        oracle_id: "oid-sol",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    const { faceMask } = buildMasksForList({
      view,
      listId: "default",
      faceCount: 3,
      oracleToCanonicalFace: oracleMap,
    });
    expect(faceMask[0]).toBe(1);
    expect(faceMask[1]).toBe(1);
    expect(faceMask[2]).toBe(0);
  });

  it("sets printingMask for printing-level entries", () => {
    const view = makeView();
    const uuids = new Set<string>();
    const uuid1 = "uuid-1";
    uuids.add(uuid1);
    view.instancesByList.set("default", uuids);
    view.instances.set(
      uuid1,
      inst({
        uuid: uuid1,
        oracle_id: "oid-bolt",
        scryfall_id: "p-b",
        finish: "foil",
        list_id: "default",
      }),
    );
    const { faceMask, printingMask } = buildMasksForList({
      view,
      listId: "default",
      faceCount: 3,
      printingCount: 3,
      oracleToCanonicalFace: oracleMap,
      printingLookup,
    });
    expect(faceMask[0]).toBe(1);
    expect(printingMask).toBeDefined();
    expect(printingMask![0]).toBe(0);
    expect(printingMask![1]).toBe(1);
    expect(printingMask![2]).toBe(0);
  });

  it("sets printingMask when scryfall_id present and finish null (treat as nonfoil)", () => {
    const view = makeView();
    const uuids = new Set<string>();
    const uuid1 = "uuid-1";
    uuids.add(uuid1);
    view.instancesByList.set("default", uuids);
    view.instances.set(
      uuid1,
      inst({
        uuid: uuid1,
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        finish: null,
        list_id: "default",
      }),
    );
    const { faceMask, printingMask } = buildMasksForList({
      view,
      listId: "default",
      faceCount: 3,
      printingCount: 3,
      oracleToCanonicalFace: oracleMap,
      printingLookup,
    });
    expect(faceMask[0]).toBe(1);
    expect(printingMask).toBeDefined();
    expect(printingMask![0]).toBe(1);
    expect(printingMask![1]).toBe(0);
    expect(printingMask![2]).toBe(0);
  });

  it("printing-only: faceMask zeros when oracle_id not in map, printingMask set", () => {
    const view = makeView();
    const uuids = new Set<string>();
    const uuid1 = "uuid-1";
    uuids.add(uuid1);
    view.instancesByList.set("default", uuids);
    view.instances.set(
      uuid1,
      inst({
        uuid: uuid1,
        oracle_id: "unknown-oid",
        scryfall_id: "p-b",
        finish: "foil",
        list_id: "default",
      }),
    );
    const { faceMask, printingMask } = buildMasksForList({
      view,
      listId: "default",
      faceCount: 3,
      printingCount: 3,
      oracleToCanonicalFace: oracleMap,
      printingLookup,
    });
    expect(faceMask[0]).toBe(0);
    expect(faceMask[1]).toBe(0);
    expect(faceMask[2]).toBe(0);
    expect(printingMask).toBeDefined();
    expect(printingMask![1]).toBe(1);
  });

  it("handles mixed oracle and printing entries", () => {
    const view = makeView();
    const uuids = new Set<string>();
    const uuid1 = "uuid-1";
    const uuid2 = "uuid-2";
    uuids.add(uuid1);
    uuids.add(uuid2);
    view.instancesByList.set("default", uuids);
    view.instances.set(
      uuid1,
      inst({
        uuid: uuid1,
        oracle_id: "oid-bolt",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    view.instances.set(
      uuid2,
      inst({
        uuid: uuid2,
        oracle_id: "oid-sol",
        scryfall_id: "p-c",
        finish: "nonfoil",
        list_id: "default",
      }),
    );
    const { faceMask, printingMask } = buildMasksForList({
      view,
      listId: "default",
      faceCount: 3,
      printingCount: 3,
      oracleToCanonicalFace: oracleMap,
      printingLookup,
    });
    expect(faceMask[0]).toBe(1);
    expect(faceMask[1]).toBe(1);
    expect(faceMask[2]).toBe(0);
    expect(printingMask![2]).toBe(1);
  });

  it("handles unknown oracle_id in list (skips setting faceMask)", () => {
    const view = makeView();
    const uuids = new Set<string>();
    const uuid1 = "uuid-1";
    uuids.add(uuid1);
    view.instancesByList.set("default", uuids);
    view.instances.set(
      uuid1,
      inst({
        uuid: uuid1,
        oracle_id: "unknown-oid",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    const { faceMask } = buildMasksForList({
      view,
      listId: "default",
      faceCount: 3,
      oracleToCanonicalFace: oracleMap,
    });
    expect(faceMask[0]).toBe(0);
    expect(faceMask[1]).toBe(0);
    expect(faceMask[2]).toBe(0);
  });
});

describe("buildMasksFromParsedEntries", () => {
  const display = makeDisplay();
  const oracleMap = buildOracleToCanonicalFaceMap(display);
  const printingDisplay = makePrintingDisplay();
  const printingLookup = buildPrintingLookup(printingDisplay);

  it("returns zeroed faceMask for empty entries", () => {
    const { faceMask } = buildMasksFromParsedEntries([], {
      faceCount: 3,
      oracleToCanonicalFace: oracleMap,
    });
    expect(faceMask.length).toBe(3);
    expect(faceMask[0]).toBe(0);
    expect(faceMask[1]).toBe(0);
    expect(faceMask[2]).toBe(0);
  });

  it("sets faceMask for oracle-level entries", () => {
    const entries = [
      { oracle_id: "oid-bolt", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid-sol", scryfall_id: null, quantity: 2 },
    ];
    const { faceMask } = buildMasksFromParsedEntries(entries, {
      faceCount: 3,
      oracleToCanonicalFace: oracleMap,
    });
    expect(faceMask[0]).toBe(1);
    expect(faceMask[1]).toBe(1);
    expect(faceMask[2]).toBe(0);
  });

  it("sets printingMask for printing-level entries", () => {
    const entries = [
      {
        oracle_id: "oid-bolt",
        scryfall_id: "p-b",
        quantity: 1,
        finish: "foil" as const,
      },
    ];
    const { faceMask, printingMask } = buildMasksFromParsedEntries(entries, {
      faceCount: 3,
      printingCount: 3,
      oracleToCanonicalFace: oracleMap,
      printingLookup,
    });
    expect(faceMask[0]).toBe(1);
    expect(printingMask).toBeDefined();
    expect(printingMask![1]).toBe(1);
  });

  it("treats null finish as nonfoil for printing-level entries", () => {
    const entries = [
      {
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        quantity: 1,
      },
    ];
    const { printingMask } = buildMasksFromParsedEntries(entries, {
      faceCount: 3,
      printingCount: 3,
      oracleToCanonicalFace: oracleMap,
      printingLookup,
    });
    expect(printingMask).toBeDefined();
    expect(printingMask![0]).toBe(1);
  });
});

describe("getMatchingCount", () => {
  it("returns 0 for empty list", () => {
    const view = makeView();
    view.instancesByList.set("default", new Set());
    expect(getMatchingCount(view, "default", "oid-bolt")).toBe(0);
    expect(
      getMatchingCount(view, "default", "oid-bolt", "p-a", "nonfoil"),
    ).toBe(0);
  });

  it("returns 0 for unknown list id", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    expect(getMatchingCount(view, "other", "oid-bolt")).toBe(0);
  });

  it("counts oracle-level entries", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    uuids.add("uuid-2");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    view.instances.set(
      "uuid-2",
      inst({
        uuid: "uuid-2",
        oracle_id: "oid-bolt",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    expect(getMatchingCount(view, "default", "oid-bolt")).toBe(2);
    expect(getMatchingCount(view, "default", "oid-sol")).toBe(0);
  });

  it("oracle-level excludes printing-level entries", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        finish: "nonfoil",
        list_id: "default",
      }),
    );
    expect(getMatchingCount(view, "default", "oid-bolt")).toBe(0);
  });

  it("counts printing-level entries", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    uuids.add("uuid-2");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        finish: "nonfoil",
        list_id: "default",
      }),
    );
    view.instances.set(
      "uuid-2",
      inst({
        uuid: "uuid-2",
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        finish: "nonfoil",
        list_id: "default",
      }),
    );
    expect(
      getMatchingCount(view, "default", "oid-bolt", "p-a", "nonfoil"),
    ).toBe(2);
    expect(
      getMatchingCount(view, "default", "oid-bolt", "p-b", "foil"),
    ).toBe(0);
    expect(
      getMatchingCount(view, "default", "oid-bolt", "p-a", "foil"),
    ).toBe(0);
  });

  it("printing-level excludes oracle-level entries", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    expect(
      getMatchingCount(view, "default", "oid-bolt", "p-a", "nonfoil"),
    ).toBe(0);
  });

  it("printing-level nonfoil query matches instance with finish null", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        finish: null,
        list_id: "default",
      }),
    );
    expect(
      getMatchingCount(view, "default", "oid-bolt", "p-a", "nonfoil"),
    ).toBe(1);
  });
});

describe("hasPrintingLevelEntries", () => {
  it("returns false for empty list", () => {
    const view = makeView();
    view.instancesByList.set("default", new Set());
    expect(hasPrintingLevelEntries(view, "default")).toBe(false);
  });

  it("returns false when all entries are oracle-level", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    expect(hasPrintingLevelEntries(view, "default")).toBe(false);
  });

  it("returns true when any entry has scryfall_id and finish", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        finish: "nonfoil",
        list_id: "default",
      }),
    );
    expect(hasPrintingLevelEntries(view, "default")).toBe(true);
  });

  it("returns true when entry has scryfall_id and finish null (nonfoil default)", () => {
    const view = makeView();
    const uuids = new Set<string>();
    uuids.add("uuid-1");
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        finish: null,
        list_id: "default",
      }),
    );
    expect(hasPrintingLevelEntries(view, "default")).toBe(true);
  });
});

describe("countListEntriesPerCard", () => {
  it("returns empty map for empty list", () => {
    const view = makeView();
    view.instancesByList.set("default", new Set());
    const oracleMap = buildOracleToCanonicalFaceMap(makeDisplay());
    expect(countListEntriesPerCard(view, "default", oracleMap).size).toBe(0);
  });

  it("counts list entries per canonical face", () => {
    const view = makeView();
    const uuids = new Set<string>(["uuid-1", "uuid-2", "uuid-3"]);
    view.instancesByList.set("default", uuids);
    view.instances.set(
      "uuid-1",
      inst({
        uuid: "uuid-1",
        oracle_id: "oid-bolt",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    view.instances.set(
      "uuid-2",
      inst({
        uuid: "uuid-2",
        oracle_id: "oid-bolt",
        scryfall_id: "p-a",
        finish: "nonfoil",
        list_id: "default",
      }),
    );
    view.instances.set(
      "uuid-3",
      inst({
        uuid: "uuid-3",
        oracle_id: "oid-sol",
        scryfall_id: null,
        finish: null,
        list_id: "default",
      }),
    );
    const oracleMap = buildOracleToCanonicalFaceMap(makeDisplay());
    const result = countListEntriesPerCard(view, "default", oracleMap);
    expect(result.get(0)).toBe(2);
    expect(result.get(1)).toBe(1);
  });
});
