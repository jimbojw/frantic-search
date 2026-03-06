// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { queryForSortSeed } from "./query-for-sort";

describe("queryForSortSeed", () => {
  it("strips view: terms (Issue #62)", () => {
    expect(queryForSortSeed("t:creature view:detail")).toBe("t:creature");
    expect(queryForSortSeed("t:creature view:slim")).toBe("t:creature");
    expect(queryForSortSeed("lightning view:images")).toBe("lightning");
    expect(queryForSortSeed("view:detail t:creature")).toBe("t:creature");
    expect(queryForSortSeed("view:detail")).toBe("");
  });

  it("strips v: alias (Spec 083)", () => {
    expect(queryForSortSeed("t:creature v:detail")).toBe("t:creature");
    expect(queryForSortSeed("lightning v:images")).toBe("lightning");
    expect(queryForSortSeed("v:slim t:creature")).toBe("t:creature");
  });

  it("view: variants produce same result", () => {
    const a = queryForSortSeed("t:creature view:detail");
    const b = queryForSortSeed("t:creature view:slim");
    expect(a).toBe(b);
    expect(a).toBe("t:creature");
  });

  it("strips unique: terms (cards, prints, art)", () => {
    expect(queryForSortSeed("t:creature unique:prints")).toBe("t:creature");
    expect(queryForSortSeed("t:creature unique:cards")).toBe("t:creature");
    expect(queryForSortSeed("t:creature unique:art")).toBe("t:creature");
    expect(queryForSortSeed("unique:prints")).toBe("");
    expect(queryForSortSeed("c:r unique:prints t:instant")).toBe("c:r t:instant");
  });

  it("strips ++ and @@ aliases (Spec 048)", () => {
    expect(queryForSortSeed("t:creature ++")).toBe("t:creature");
    expect(queryForSortSeed("t:creature @@")).toBe("t:creature");
    expect(queryForSortSeed("++")).toBe("");
    expect(queryForSortSeed("c:r ++ t:instant")).toBe("c:r t:instant");
  });

  it("unique: variants produce same result", () => {
    const a = queryForSortSeed("t:creature view:detail");
    const b = queryForSortSeed("t:creature unique:prints");
    const c = queryForSortSeed("t:creature unique:art");
    const d = queryForSortSeed("t:creature ++");
    const e = queryForSortSeed("t:creature @@");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(c).toBe(d);
    expect(d).toBe(e);
    expect(a).toBe("t:creature");
  });

  it("strips both view: and unique:", () => {
    expect(queryForSortSeed("t:creature view:detail unique:prints")).toBe("t:creature");
    expect(queryForSortSeed("t:creature unique:prints view:slim")).toBe("t:creature");
    expect(queryForSortSeed("t:creature unique:art view:images")).toBe("t:creature");
  });

  it("preserves trailing whitespace (tap-to-shuffle)", () => {
    expect(queryForSortSeed("t:creature view:detail ")).toBe("t:creature ");
    expect(queryForSortSeed("t:creature ")).toBe("t:creature ");
    // view:detail alone with trailing: strip yields "  ", collapse yields " "
    expect(queryForSortSeed("view:detail  ")).toBe(" ");
  });

  it("passes through queries without display tokens", () => {
    expect(queryForSortSeed("t:creature c:red")).toBe("t:creature c:red");
    expect(queryForSortSeed("lightning bolt")).toBe("lightning bolt");
  });

  it("handles empty and whitespace-only", () => {
    expect(queryForSortSeed("")).toBe("");
    expect(queryForSortSeed("   ")).toBe("   ");
  });
});
