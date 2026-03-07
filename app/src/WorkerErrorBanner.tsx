// SPDX-License-Identifier: Apache-2.0
import { Show } from 'solid-js'
import type { Accessor } from 'solid-js'

type WorkerStatus = 'loading' | 'ready' | 'error'
type ErrorCause = 'stale' | 'network' | 'unknown'

export function WorkerErrorBanner(props: {
  workerStatus: Accessor<WorkerStatus>
  errorCause: Accessor<ErrorCause>
  workerError: Accessor<string>
  onHardReload: () => void
}) {
  return (
    <>
      <Show when={props.workerStatus() === 'error'}>
        <div class="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-6 shadow-sm">
          <Show when={props.errorCause() === 'stale'} fallback={<>
            <p class="text-sm font-medium text-red-800 dark:text-red-200">Could not load card data</p>
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">
              {props.errorCause() === 'network'
                ? 'Check your internet connection. The page will reload automatically when connectivity is restored.'
                : props.workerError()}
            </p>
            <button
              type="button"
              onClick={() => location.reload()}
              class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 transition-colors"
            >
              Try again
            </button>
          </>}>
            <p class="text-sm font-medium text-red-800 dark:text-red-200">Card data is out of date</p>
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">
              A newer version of Frantic Search has been deployed. Reload to get the latest data.
            </p>
            <button
              type="button"
              onClick={props.onHardReload}
              class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 transition-colors"
            >
              Reload
            </button>
          </Show>
        </div>
      </Show>

      <Show when={props.workerStatus() === 'loading'}>
        <p class="text-center text-sm text-gray-400 dark:text-gray-600 pt-8">
          Loading card data…
        </p>
      </Show>
    </>
  )
}
