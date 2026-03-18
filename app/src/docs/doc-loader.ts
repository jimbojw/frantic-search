// SPDX-License-Identifier: Apache-2.0
import type { Component } from 'solid-js'

export type DocModule = {
  default: Component
  meta?: { title: string }
}

// Reference articles discovered via glob; adding a new reference/*.mdx requires only DOC_INDEX update
const referenceGlob = import.meta.glob<DocModule>('./reference/**/*.mdx', { eager: false })
const referenceLoaders: Record<string, () => Promise<DocModule>> = Object.fromEntries(
  Object.entries(referenceGlob).map(([path, fn]) => [
    path.replace(/^\.\//, '').replace(/\.mdx$/, ''),
    fn,
  ]),
)

const DOC_LOADERS: Record<string, () => Promise<DocModule>> = {
  ...referenceLoaders,
  'tutorials/getting-started': () => import('./tutorials/getting-started.mdx'),
  'how-to/budget-alternatives': () => import('./how-to/budget-alternatives.mdx'),
  'explanation/engine-overview': () => import('./explanation/engine-overview.mdx'),
}

export function getDocLoader(docParam: string): (() => Promise<DocModule>) | undefined {
  return DOC_LOADERS[docParam]
}
