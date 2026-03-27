// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";
import { escapeMarkdownLinkText, formatMarkdownInlineLink } from "./markdown-link";

describe("escapeMarkdownLinkText", () => {
  test("empty", () => {
    expect(escapeMarkdownLinkText("")).toBe("");
  });

  test("plain text unchanged", () => {
    expect(escapeMarkdownLinkText("ci:bg otag:reanimate")).toBe("ci:bg otag:reanimate");
  });

  test("escapes backslash bracket sequences", () => {
    expect(escapeMarkdownLinkText("a\\b")).toBe("a\\\\b");
    expect(escapeMarkdownLinkText("a[b]c")).toBe("a\\[b\\]c");
  });

  test("nested brackets", () => {
    expect(escapeMarkdownLinkText("[[x]]")).toBe("\\[\\[x\\]\\]");
  });
});

describe("formatMarkdownInlineLink", () => {
  test("builds link with escaped text", () => {
    expect(formatMarkdownInlineLink("foo", "https://example.com/?q=1")).toBe(
      "[foo](https://example.com/?q=1)",
    );
  });

  test("escapes link text", () => {
    expect(formatMarkdownInlineLink("a]b", "https://x")).toBe("[a\\]b](https://x)");
  });
});
