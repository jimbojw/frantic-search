// SPDX-License-Identifier: Apache-2.0
import { createMemo, For } from "solid-js";
import { buildListSpans } from "@frantic-search/shared";
import type { ListValidationResult } from "@frantic-search/shared";

export const LIST_ROLE_CLASSES: Record<string, string> = {
  quantity: "text-amber-600 dark:text-amber-400",
  "card-name": "text-gray-900 dark:text-gray-100",
  "set-code": "text-blue-600 dark:text-blue-400",
  "collector-number": "text-blue-600 dark:text-blue-400",
  "foil-marker": "text-violet-600 dark:text-violet-400",
  "alter-marker": "text-violet-600 dark:text-violet-400",
  "etched-marker": "text-violet-600 dark:text-violet-400",
  category: "text-emerald-600 dark:text-emerald-400",
  "category-tag": "text-slate-600 dark:text-slate-400",
  variant: "text-slate-600 dark:text-slate-400",
  "collection-status-text": "text-slate-600 dark:text-slate-400",
  "collection-status-color": "text-slate-500 dark:text-slate-500",
  "section-header": "text-sky-600 dark:text-sky-400 font-semibold",
  metadata: "text-slate-600 dark:text-slate-400 italic",
  comment: "text-gray-500 dark:text-gray-400 italic",
  error:
    "text-red-600 dark:text-red-400 underline decoration-wavy decoration-red-400 dark:decoration-red-500",
  "variant-approx":
    "text-amber-600 dark:text-amber-400 underline decoration-wavy decoration-amber-400 dark:decoration-amber-500",
};

export default function ListHighlight(props: {
  text: string;
  validation?: ListValidationResult | null;
  class?: string;
}) {
  const spans = createMemo(() =>
    buildListSpans(props.text, props.validation ?? undefined)
  );

  return (
    <pre
      aria-hidden="true"
      class={`pointer-events-none font-mono whitespace-pre-wrap break-words ${props.class ?? ""}`}
    >
      <For each={spans()}>
        {(span) =>
          span.role ? (
            <span class={LIST_ROLE_CLASSES[span.role] ?? ""}>{span.text}</span>
          ) : (
            <>{span.text}</>
          )
        }
      </For>
    </pre>
  );
}
