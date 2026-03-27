// SPDX-License-Identifier: Apache-2.0

/**
 * Escape characters that break CommonMark-style inline link text inside `[...]`.
 */
export function escapeMarkdownLinkText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/** `[escapedText](url)` for pasting into Markdown documents. */
export function formatMarkdownInlineLink(text: string, url: string): string {
  return `[${escapeMarkdownLinkText(text)}](${url})`;
}
