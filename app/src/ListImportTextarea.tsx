// SPDX-License-Identifier: Apache-2.0
import { createSignal, createMemo, onMount } from "solid-js";
import { validateDeckList } from "@frantic-search/shared";
import type { DisplayColumns, PrintingDisplayColumns } from "@frantic-search/shared";
import ListHighlight from "./ListHighlight";

const VALIDATION_DEBOUNCE_MS = 150;

export default function ListImportTextarea(props: {
  display: DisplayColumns | null;
  printingDisplay: PrintingDisplayColumns | null;
  placeholder?: string;
  class?: string;
}) {
  const [text, setText] = createSignal("");
  const [debouncedText, setDebouncedText] = createSignal("");
  let hlRef: HTMLDivElement | null = null;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });

  const validation = createMemo(() => {
    const t = debouncedText();
    if (!t.trim()) return null;
    return validateDeckList(t, props.display, props.printingDisplay);
  });

  function syncScroll(el: HTMLTextAreaElement) {
    if (hlRef) {
      hlRef.scrollTop = el.scrollTop;
      hlRef.scrollLeft = el.scrollLeft;
    }
  }

  function handleInput(e: Event) {
    const el = e.currentTarget as HTMLTextAreaElement;
    setText(el.value);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setDebouncedText(el.value);
      debounceTimer = undefined;
    }, VALIDATION_DEBOUNCE_MS);
    syncScroll(el);
  }

  function handleScroll(e: Event) {
    syncScroll(e.currentTarget as HTMLTextAreaElement);
  }

  return (
    <div class={`grid overflow-hidden relative ${props.class ?? ""}`}>
      <div
        ref={(el) => {
          hlRef = el;
        }}
        class="hl-layer overflow-auto whitespace-pre-wrap break-words p-3 min-h-[120px]"
      >
        <ListHighlight
          text={text()}
          validation={validation()}
          class="text-sm leading-relaxed"
        />
      </div>
      <textarea
        value={text()}
        onInput={handleInput}
        onScroll={handleScroll}
        placeholder={props.placeholder ?? "Paste or type a deck list…\n\n1 Lightning Bolt\n4x Birds of Paradise\n1 Shock (M21) 159"}
        autocapitalize="none"
        autocomplete="off"
        autocorrect="off"
        spellcheck={false}
        rows={6}
        class="hl-input w-full bg-transparent p-3 text-sm leading-relaxed font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none resize-y min-h-[120px]"
      />
    </div>
  );
}
