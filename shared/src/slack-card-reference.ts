// SPDX-License-Identifier: Apache-2.0

/**
 * Slack / Reddit bot-style card reference for a specific printing (Spec 165).
 * Set code is normalized to uppercase in the output.
 */
export function formatSlackCardReference(
  name: string,
  setCode: string,
  collectorNumber: string,
): string {
  return `[[!${name}|${setCode.toUpperCase()}|${collectorNumber}]]`;
}
