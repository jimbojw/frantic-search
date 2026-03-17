// SPDX-License-Identifier: Apache-2.0
declare module '*.mdx' {
  const content: import('solid-js').Component
  export const meta: { title: string } | undefined
  export default content
}
