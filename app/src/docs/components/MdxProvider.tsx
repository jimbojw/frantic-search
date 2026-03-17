// SPDX-License-Identifier: Apache-2.0
import { createComponent, createContext, useContext, type JSX, type ParentProps } from 'solid-js'

const MDXContext = createContext<Record<string, JSX.Element>>(Object.create(null))

export function MDXProvider(
  props: ParentProps<{ components?: Record<string, JSX.Element> }>,
): JSX.Element {
  const context = useContext(MDXContext)
  return createComponent(MDXContext.Provider, {
    get value() {
      return { ...context, ...props.components }
    },
    get children() {
      return props.children
    },
  })
}

export function useMDXComponents(
  components?: Record<string, JSX.Element>,
): Record<string, JSX.Element> {
  const context = useContext(MDXContext)
  return { ...context, ...components }
}
