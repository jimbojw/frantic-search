// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { detectDeckFormat } from "./list-format";
import { lexDeckList } from "./list-lexer";

function detect(text: string) {
  return detectDeckFormat(lexDeckList(text));
}

describe("detectDeckFormat", () => {
  it("returns null for empty input", () => {
    expect(detect("")).toBe(null);
  });

  it("returns null for plain quantity + name lines (ambiguous)", () => {
    expect(detect("4 Lightning Bolt\n2 Birds of Paradise")).toBe(null);
  });

  it("detects archidekt from CATEGORY tokens", () => {
    expect(detect("1 Lightning Bolt [Removal] ^Have,#37d67a^")).toBe("archidekt");
  });

  it("detects archidekt from CATEGORY_TAG tokens", () => {
    expect(detect("1 Sol Ring [Commander{top}]")).toBe("archidekt");
  });

  it("detects archidekt from COLLECTION_STATUS_TEXT tokens", () => {
    expect(detect("1 Lightning Bolt ^Have,#37d67a^")).toBe("archidekt");
  });

  it("detects moxfield from FOIL_MARKER", () => {
    expect(detect("1 Lightning Bolt (M21) 159 *F*")).toBe("moxfield");
  });

  it("detects moxfield from ALTER_MARKER", () => {
    expect(detect("1 Lightning Bolt (M21) 159 *A*")).toBe("moxfield");
  });

  it("detects moxfield from ETCHED_MARKER", () => {
    expect(detect("1 Lightning Bolt (M21) 159 *E*")).toBe("moxfield");
  });

  it("detects mtggoldfish from VARIANT token", () => {
    expect(detect("6 Island <251> [THB]")).toBe("mtggoldfish");
  });

  it("detects mtggoldfish from SET_CODE_BRACKET token", () => {
    expect(detect("2 Disdainful Stroke [KTK]")).toBe("mtggoldfish");
  });

  it("detects mtggoldfish from FOIL_PAREN", () => {
    expect(detect("1 Lightning Bolt [M21] (F)")).toBe("mtggoldfish");
  });

  it("detects mtggoldfish from ETCHED_PAREN", () => {
    expect(detect("1 Lightning Bolt [M21] (E)")).toBe("mtggoldfish");
  });

  it("detects melee from MainDeck header", () => {
    expect(detect("MainDeck\n4 Lightning Bolt")).toBe("melee");
  });

  it("detects melee from Main Deck header", () => {
    expect(detect("Main Deck\n4 Lightning Bolt")).toBe("melee");
  });

  it("detects arena from generic section headers only", () => {
    expect(detect("Deck\n4 Lightning Bolt\n\nSideboard\n1 Rest in Peace")).toBe("arena");
  });

  it("detects arena from Commander header", () => {
    expect(detect("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n4 Lightning Bolt")).toBe("arena");
  });

  it("archidekt wins over generic section headers", () => {
    expect(detect("Deck\n1 Lightning Bolt [Removal] ^Have,#37d67a^")).toBe("archidekt");
  });

  it("moxfield wins over generic section headers", () => {
    expect(detect("Deck\n1 Lightning Bolt (M21) 159 *F*")).toBe("moxfield");
  });

  it("returns null when no tokens at all (comments only)", () => {
    expect(detect("// just a comment")).toBe(null);
  });

  it("returns null for mixed format-specific tokens from different formats", () => {
    // This is an unusual case — manual editing mixed Moxfield and MTGGoldfish tokens.
    // The spec says mixed tokens fall back to ambiguous.
    expect(detect("1 Lightning Bolt (M21) 159 *F*\n2 Island <251> [THB]")).toBe(null);
  });

  it("detects tappedout from HASH_TAG", () => {
    expect(detect("1x Lightning Bolt #Land")).toBe("tappedout");
  });

  it("detects tappedout from ROLE_MARKER", () => {
    expect(detect("1x Codie, Vociferous Codex *CMDR*")).toBe("tappedout");
  });

  it("detects tappedout from *f* lowercase foil marker", () => {
    expect(detect("1x Sol Ring (SLD) *f* #Artifact")).toBe("tappedout");
  });

  it("tappedout wins over moxfield when both have foil markers", () => {
    expect(detect("1x Sol Ring (SLD:589) *f* #Land")).toBe("tappedout");
  });
});
