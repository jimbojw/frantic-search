// SPDX-License-Identifier: Apache-2.0

/**
 * Write a message to stderr. Always prints if `condition` is true.
 * This keeps stdout clean for potential piping.
 */
export function log(message: string, condition: boolean): void {
  if (condition) {
    process.stderr.write(`${message}\n`);
  }
}
