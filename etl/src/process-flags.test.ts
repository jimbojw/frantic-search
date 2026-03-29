// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { CardFlag } from "@frantic-search/shared";
import { encodeFlags, type Card } from "./process";

describe("encodeFlags (oracle card)", () => {
  test("content_warning sets CardFlag.ContentWarning", () => {
    const card: Card = { content_warning: true };
    expect(encodeFlags(card, new Set()) & CardFlag.ContentWarning).toBe(
      CardFlag.ContentWarning,
    );
  });

  test("omit content_warning leaves ContentWarning bit clear", () => {
    const card: Card = { name: "Test" };
    expect(encodeFlags(card, new Set()) & CardFlag.ContentWarning).toBe(0);
  });
});
