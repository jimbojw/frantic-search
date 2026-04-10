// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { MULTI_FACE_LAYOUTS } from "./process";

describe("MULTI_FACE_LAYOUTS (Spec 003)", () => {
  test("prepare is expanded via card_faces so root oracle_text is not used alone (Issue #264)", () => {
    expect(MULTI_FACE_LAYOUTS.has("prepare")).toBe(true);
  });
});
