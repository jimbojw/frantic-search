// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { SORT_FIELDS } from "./sort-fields";

describe("SORT_FIELDS", () => {
  test("canonical name aliases resolve correctly", () => {
    expect(SORT_FIELDS["cmc"].canonical).toBe("mv");
    expect(SORT_FIELDS["manavalue"].canonical).toBe("mv");
    expect(SORT_FIELDS["pow"].canonical).toBe("power");
    expect(SORT_FIELDS["tou"].canonical).toBe("toughness");
    expect(SORT_FIELDS["usd"].canonical).toBe("usd");
    expect(SORT_FIELDS["$"].canonical).toBe("usd");
    expect(SORT_FIELDS["released"].canonical).toBe("date");
    expect(SORT_FIELDS["year"].canonical).toBe("date");
    expect(SORT_FIELDS["c"].canonical).toBe("color");
    expect(SORT_FIELDS["identity"].canonical).toBe("identity");
    expect(SORT_FIELDS["id"].canonical).toBe("identity");
    expect(SORT_FIELDS["ci"].canonical).toBe("identity");
    expect(SORT_FIELDS["cmd"].canonical).toBe("identity");
  });

  test("face-domain fields are not printing domain", () => {
    for (const key of ["name", "mv", "cmc", "color", "identity", "id", "ci", "cmd", "power", "toughness"]) {
      expect(SORT_FIELDS[key].isPrintingDomain).toBe(false);
    }
  });

  test("printing-domain fields are printing domain", () => {
    for (const key of ["usd", "$", "date", "released", "rarity", "set"]) {
      expect(SORT_FIELDS[key].isPrintingDomain).toBe(true);
    }
  });

  test("default directions match spec", () => {
    expect(SORT_FIELDS["name"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["mv"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["color"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["identity"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["power"].defaultDir).toBe("desc");
    expect(SORT_FIELDS["toughness"].defaultDir).toBe("desc");
    expect(SORT_FIELDS["usd"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["date"].defaultDir).toBe("desc");
    expect(SORT_FIELDS["rarity"].defaultDir).toBe("desc");
    expect(SORT_FIELDS["set"].defaultDir).toBe("asc");
  });

  test("unknown field is undefined", () => {
    expect(SORT_FIELDS["foo"]).toBeUndefined();
    expect(SORT_FIELDS["bogus"]).toBeUndefined();
  });
});
