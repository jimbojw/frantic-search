// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { formatSlackCardReference } from "./slack-card-reference";

describe("formatSlackCardReference", () => {
  it("formats name, uppercase set, and collector", () => {
    expect(formatSlackCardReference("Lightning Bolt", "leb", "116")).toBe(
      "[[!Lightning Bolt|LEB|116]]",
    );
  });

  it("preserves mixed-case collector tokens", () => {
    expect(formatSlackCardReference("Forest", "who", "347s")).toBe(
      "[[!Forest|WHO|347s]]",
    );
  });
});
