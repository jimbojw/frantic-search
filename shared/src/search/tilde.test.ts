// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { normalizeOracleText } from "./tilde";

describe("normalizeOracleText", () => {
  test("replaces full card name with ~", () => {
    expect(
      normalizeOracleText(
        "Lightning Bolt",
        "Lightning Bolt deals 3 damage to any target.",
      ),
    ).toBe("~ deals 3 damage to any target.");
  });

  test("replaces 'this <type>' with ~", () => {
    expect(
      normalizeOracleText(
        "Oblivion Ring",
        "When this enchantment enters, exile another target nonland permanent.",
      ),
    ).toBe("When ~ enters, exile another target nonland permanent.");
  });

  test("replaces short legendary name with ~", () => {
    expect(
      normalizeOracleText(
        "Ayara, Widow of the Realm",
        "Ayara deals X damage to target opponent.",
      ),
    ).toBe("~ deals X damage to target opponent.");
  });

  test("returns empty string when no self-reference found", () => {
    expect(normalizeOracleText("Sol Ring", "{T}: Add {C}{C}.")).toBe("");
  });

  test("replaces both full name and 'this spell'", () => {
    expect(
      normalizeOracleText(
        "Abrupt Decay",
        "This spell can't be countered.\nAbrupt Decay destroys target nonland permanent with mana value 3 or less.",
      ),
    ).toBe(
      "~ can't be countered.\n~ destroys target nonland permanent with mana value 3 or less.",
    );
  });

  test("replacement is case-insensitive", () => {
    expect(
      normalizeOracleText("LIGHTNING BOLT", "lightning bolt deals 3 damage."),
    ).toBe("~ deals 3 damage.");
  });

  test("does not replace 'this ability'", () => {
    const text = "Activate this ability only once each turn.";
    expect(normalizeOracleText("Some Card", text)).toBe("");
  });

  test("does not replace 'this turn'", () => {
    const text = "Draw a card. Until end of this turn, you may play an additional land.";
    expect(normalizeOracleText("Some Card", text)).toBe("");
  });

  test("does not replace 'this token'", () => {
    const text = "Create a 1/1 white Soldier creature token. This token has lifelink.";
    expect(normalizeOracleText("Some Card", text)).toBe("");
  });

  test("word-boundary matching prevents partial replacements", () => {
    expect(
      normalizeOracleText("Al", "Also, Al deals 1 damage."),
    ).toBe("Also, ~ deals 1 damage.");
  });

  test("replaces 'this creature'", () => {
    expect(
      normalizeOracleText(
        "Grizzly Bears",
        "This creature gets +1/+1 until end of turn.",
      ),
    ).toBe("~ gets +1/+1 until end of turn.");
  });

  test("replaces 'this land'", () => {
    expect(
      normalizeOracleText("Arid Mesa", "This land enters tapped."),
    ).toBe("~ enters tapped.");
  });

  test("replaces 'this permanent'", () => {
    expect(
      normalizeOracleText("Some Permanent", "Exile this permanent."),
    ).toBe("Exile ~.");
  });

  test("replaces 'this card'", () => {
    expect(
      normalizeOracleText(
        "Alien Symbiosis",
        "You may cast this card from your graveyard.",
      ),
    ).toBe("You may cast ~ from your graveyard.");
  });

  test("replaces 'this artifact'", () => {
    expect(
      normalizeOracleText("Some Artifact", "Sacrifice this artifact."),
    ).toBe("Sacrifice ~.");
  });

  test("replaces 'this planeswalker'", () => {
    expect(
      normalizeOracleText("Some PW", "This planeswalker enters with 3 loyalty counters."),
    ).toBe("~ enters with 3 loyalty counters.");
  });

  test("replaces multiple self-references in one text", () => {
    expect(
      normalizeOracleText(
        "Tarmogoyf",
        "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and Tarmogoyf's toughness is that number plus 1.",
      ),
    ).toBe(
      "~'s power is equal to the number of card types among cards in all graveyards and ~'s toughness is that number plus 1.",
    );
  });

  test("full name takes precedence over short name", () => {
    // If the full name appears in the text, it gets replaced first
    expect(
      normalizeOracleText(
        "Ayara, Widow of the Realm",
        "Ayara, Widow of the Realm enters tapped.",
      ),
    ).toBe("~ enters tapped.");
  });

  test("empty oracle text returns empty string", () => {
    expect(normalizeOracleText("Some Card", "")).toBe("");
  });

  test("replaces subtypes like 'this equipment'", () => {
    expect(
      normalizeOracleText("Some Sword", "Equip: Attach this equipment to target creature."),
    ).toBe("Equip: Attach ~ to target creature.");
  });

  test("replaces 'this saga'", () => {
    expect(
      normalizeOracleText("Some Saga", "When the last lore counter is removed from this saga, exile it."),
    ).toBe("When the last lore counter is removed from ~, exile it.");
  });

  test("replaces 'this vehicle'", () => {
    expect(
      normalizeOracleText("Some Vehicle", "Crew 3: Tap creatures with total power 3 to make this vehicle an artifact creature."),
    ).toBe("Crew 3: Tap creatures with total power 3 to make ~ an artifact creature.");
  });

  test("'this spell' is replaced", () => {
    expect(
      normalizeOracleText("Some Instant", "This spell can't be countered."),
    ).toBe("~ can't be countered.");
  });
});
