# Spec 007: Worker Protocol

**Status:** Draft

## Goal

Define the message protocol between the main thread and the search WebWorker. The protocol must handle worker lifecycle (initialization, data loading, errors) and search request/response, with clean integration into SolidJS's reactive model.

## Background

The app uses a WebWorker to keep search off the main thread (ADR-003). The worker fetches and parses the card dataset (Spec 005), then evaluates queries using the shared query engine (Spec 002, Spec 004). Communication uses `postMessage` — no third-party RPC library.

The main design challenge: the worker has an asynchronous startup phase (fetch + parse + index construction), during which the user may already be typing. The protocol must handle this gracefully without queuing or replay machinery.

## Message Types

All messages are plain objects with a discriminant `type` field. The types are defined in `shared/` so both the app and any future consumers (e.g., tests) share the same contract.

### Main → Worker (`ToWorker`)

```typescript
type ToWorker =
  | { type: 'search'; queryId: number; query: string }
```

| Message    | When sent                                  | Fields                                  |
|------------|--------------------------------------------|-----------------------------------------|
| `search`   | User input changes and worker is ready     | `queryId`: monotonic counter; `query`: raw query string |

The main thread only sends `search` messages after receiving a `ready` status. `queryId` is a monotonically increasing integer assigned by the main thread. The worker may receive a new `search` before finishing the previous one.

### Worker → Main (`FromWorker`)

```typescript
type CardResult = {
  name: string
  manaCost: string
  typeLine: string
  oracleText: string
}

type FromWorker =
  | { type: 'status'; status: 'loading' | 'ready' | 'error'; error?: string }
  | { type: 'result'; queryId: number; cards: CardResult[]; totalMatches: number }
```

| Message    | When sent                                  | Fields                                  |
|------------|--------------------------------------------|-----------------------------------------|
| `status`   | On startup, after data load, or on failure | `status`: lifecycle state; `error`: message if `status` is `error` |
| `result`   | After evaluating a search query            | `queryId`: echoed from request; `cards`: matched card data (name, mana cost, type line, oracle text); `totalMatches`: total face matches before deduplication |

## Worker Lifecycle

```
┌──────────────┐
│  Worker init │
└──────┬───────┘
       │ posts { type: 'status', status: 'loading' }
       ▼
┌──────────────────────────────┐
│  fetch('columns.json')       │
│  JSON.parse → ColumnarData   │
│  new CardIndex(data)         │
│  new NodeCache(index)        │
└──────────────┬───────────────┘
       │ posts { type: 'status', status: 'ready' }
       ▼
┌──────────────────────────────┐
│  Listening for messages      │◄──── search requests arrive here
└──────────────────────────────┘
```

If any step fails (network error, JSON parse error, etc.), the worker posts `{ type: 'status', status: 'error', error: '...' }` and stops. It does not retry — the user must reload the page.

## Query Flow

1. The main thread assigns a monotonically increasing `queryId` and posts a `search` message.
2. The worker receives the message, calls `parse(query)`, then `cache.evaluate(ast)`.
3. The worker calls `index.deduplicateMatches(matchingIndices)` to get canonical face indices.
4. The worker reads the name, mana cost, type line, and oracle text for each matched face and posts a `result` message with the echoed `queryId`.

### Stale result discard

The main thread tracks the most recently sent `queryId`. When a `result` arrives, it is ignored if `result.queryId < latestQueryId`. This handles rapid typing naturally — no cancellation protocol is needed. The worker processes messages in order; stale queries simply produce results that are silently dropped.

## Main-Thread Integration (SolidJS)

The main thread exposes three reactive signals:

```typescript
const [workerStatus, setWorkerStatus] = createSignal<'loading' | 'ready' | 'error'>('loading')
const [workerError, setWorkerError] = createSignal<string>('')
const [results, setResults] = createSignal<CardResult[]>([])
```

A single `onmessage` handler maps incoming messages to signal updates:

```typescript
worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data
  switch (msg.type) {
    case 'status':
      setWorkerStatus(msg.status)
      if (msg.error) setWorkerError(msg.error)
      break
    case 'result':
      if (msg.queryId === latestQueryId) {
        setResults(msg.cards)
      }
      break
  }
}
```

A reactive effect sends search requests when both conditions are met — the worker is ready and the query is non-empty:

```typescript
let latestQueryId = 0

createEffect(() => {
  const q = query().trim()
  if (workerStatus() === 'ready' && q) {
    latestQueryId++
    worker.postMessage({ type: 'search', queryId: latestQueryId, query: q })
  } else if (!q) {
    setResults([])
  }
})
```

This handles the "typing before ready" case automatically: SolidJS re-runs the effect when `workerStatus` transitions to `'ready'`, sending whatever query the user has typed so far.

## Result Shape

The `result` message carries an array of `CardResult` objects, each containing the card's name, mana cost (Scryfall format, e.g. `{2}{W}{U}`), type line, and oracle text. The `queryId` correlation and stale-discard mechanism remain unchanged regardless of payload shape. Additional fields (e.g., image URLs) can be added to `CardResult` in the future without protocol changes.

## File Organization

```
shared/src/
└── worker-protocol.ts    ToWorker and FromWorker type definitions

app/src/
├── worker.ts             WebWorker entry point (data loading + message handler)
└── ...                   Main-thread code (signals, effect, onmessage handler)
```

The protocol types live in `shared/` because the CLI or test harness may want to use them. The worker implementation lives in `app/` because it depends on browser APIs (`fetch`, `self.postMessage`).

## Acceptance Criteria

1. The worker posts `{ type: 'status', status: 'loading' }` immediately on startup.
2. After successfully loading and indexing `columns.json`, the worker posts `{ type: 'status', status: 'ready' }`.
3. If data loading fails, the worker posts `{ type: 'status', status: 'error', error: '...' }` with a descriptive message.
4. A `search` message with a valid query produces a `result` message with the correct `queryId` and matching card data (name, mana cost, type line, oracle text).
5. An empty or whitespace-only query does not produce a `search` message; the main thread clears results locally.
6. When multiple `search` messages are sent in rapid succession, the main thread only applies the result whose `queryId` matches the latest sent query.
7. If the user has typed a query before the worker is ready, the query is sent automatically when the worker transitions to `ready`.
