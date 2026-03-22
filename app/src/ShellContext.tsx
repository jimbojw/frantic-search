// SPDX-License-Identifier: Apache-2.0
/**
 * ShellContext: App reports full-screen mode so AppShell can hide bar and relax main constraint.
 * Used when docs or Dual Wield are active — those views fill the screen with their own chrome.
 */
import { createContext, useContext } from 'solid-js'

export const ShellContext = createContext<((fullScreen: boolean) => void) | undefined>(undefined)

export function useSetShellFullScreen() {
  return useContext(ShellContext)
}
