// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { SORT_FIELDS } from "./sort-fields";

describe("SORT_FIELDS", () => {
  test("canonical name aliases resolve correctly", () => {
    expect(SORT_FIELDS["cmc"].canonical).toBe("mv");
    expect(SORT_FIELDS["manavalue"].canonical).toBe("mv");
    expect(SORT_FIELDS["pow"].canonical).toBe("power");
    expect(SORT_FIELDS["tou"].canonical).toBe("toughness");
    expect(SORT_FIELDS["usd"].canonical).toBe("price");
    expect(SORT_FIELDS["released"].canonical).toBe("date");
    expect(SORT_FIELDS["year"].canonical).toBe("date");
    expect(SORT_FIELDS["c"].canonical).toBe("color");
  });

  test("face-domain fields are not printing domain", () => {
    for (const key of ["name", "mv", "cmc", "color", "power", "toughness"]) {
      expect(SORT_FIELDS[key].isPrintingDomain).toBe(false);
    }
  });

  test("printing-domain fields are printing domain", () => {
    for (const key of ["price", "usd", "date", "released", "rarity"]) {
      expect(SORT_FIELDS[key].isPrintingDomain).toBe(true);
    }
  });

  test("default directions match spec", () => {
    expect(SORT_FIELDS["name"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["mv"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["color"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["power"].defaultDir).toBe("desc");
    expect(SORT_FIELDS["toughness"].defaultDir).toBe("desc");
    expect(SORT_FIELDS["price"].defaultDir).toBe("asc");
    expect(SORT_FIELDS["date"].defaultDir).toBe("desc");
    expect(SORT_FIELDS["rarity"].defaultDir).toBe("desc");
  });

  test("unknown field is undefined", () => {
    expect(SORT_FIELDS["foo"]).toBeUndefined();
    expect(SORT_FIELDS["bogus"]).toBeUndefined();
  });
});
