// SPDX-License-Identifier: Apache-2.0
import type { InstanceStateEntry, ListMetadataEntry } from '@frantic-search/shared'

const DEFAULT_DB_NAME = 'frantic-search'
const DB_VERSION = 1
const INSTANCE_LOG_STORE = 'instance_log'
const LIST_METADATA_LOG_STORE = 'list_metadata_log'

/**
 * Schema validation and recovery.
 *
 * IndexedDB can end up with the expected version but missing object stores (e.g. dev tools
 * deletion, browser quirks, or unknown user actions). Without our stores, transactions throw
 * DOMException: "'instance_log' is not a known object store name".
 *
 * We cannot repair in place: object stores can only be created inside onupgradeneeded, which
 * does not run when the DB version already matches. The standard recovery is to delete the
 * database and reopen, which triggers onupgradeneeded and recreates the schema.
 *
 * We only validate the two original stores. Do not add new stores here — future migrations
 * create stores in onupgradeneeded; validating them would risk deleting user data on upgrade.
 */
function hasExpectedSchema(db: IDBDatabase): boolean {
  return (
    db.objectStoreNames.contains(INSTANCE_LOG_STORE) &&
    db.objectStoreNames.contains(LIST_METADATA_LOG_STORE)
  )
}

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(INSTANCE_LOG_STORE)) {
        const instanceStore = db.createObjectStore(INSTANCE_LOG_STORE, {
          autoIncrement: true,
        })
        instanceStore.createIndex('uuid', 'uuid', { unique: false })
      }
      if (!db.objectStoreNames.contains(LIST_METADATA_LOG_STORE)) {
        const listStore = db.createObjectStore(LIST_METADATA_LOG_STORE, {
          autoIncrement: true,
        })
        listStore.createIndex('list_id', 'list_id', { unique: false })
      }
    }
  })
}

function deleteDatabase(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function openDbWithRecovery(dbName: string): Promise<IDBDatabase> {
  const db = await openDb(dbName)
  if (hasExpectedSchema(db)) return db

  db.close()
  await deleteDatabase(dbName)
  return openDb(dbName)
}

/**
 * Open the card list IndexedDB. Creates the database and object stores if they do not exist.
 * Validates schema after open; if required stores are missing, deletes and recreates the DB.
 *
 * @param dbName - Optional database name for testing. Defaults to 'frantic-search'.
 */
export async function openCardListDb(dbName?: string): Promise<IDBDatabase> {
  return openDbWithRecovery(dbName ?? DEFAULT_DB_NAME)
}

/**
 * Append an instance log entry. Does not close the database.
 */
export function appendInstanceEntry(
  db: IDBDatabase,
  entry: InstanceStateEntry
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INSTANCE_LOG_STORE, 'readwrite')
    const store = tx.objectStore(INSTANCE_LOG_STORE)
    const request = store.add(entry)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * Append a list metadata log entry. Does not close the database.
 */
export function appendListMetadataEntry(
  db: IDBDatabase,
  entry: ListMetadataEntry
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIST_METADATA_LOG_STORE, 'readwrite')
    const store = tx.objectStore(LIST_METADATA_LOG_STORE)
    const request = store.add(entry)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * Replay instance_log in reverse key order (newest first). Latest entry per uuid wins.
 * Returns a Map of uuid -> InstanceState (without timestamp).
 */
export function replayInstanceLog(
  db: IDBDatabase
): Promise<Map<string, Omit<InstanceStateEntry, 'timestamp'>>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, Omit<InstanceStateEntry, 'timestamp'>>()
    const store = db.transaction(INSTANCE_LOG_STORE, 'readonly').objectStore(INSTANCE_LOG_STORE)
    const request = store.openCursor(undefined, 'prev')

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(result)
        return
      }
      const entry = cursor.value as InstanceStateEntry
      if (!result.has(entry.uuid)) {
        const { timestamp: _t, ...state } = entry
        result.set(entry.uuid, state)
      }
      cursor.continue()
    }
  })
}

/**
 * Replay list_metadata_log in reverse key order (newest first). Latest entry per list_id wins.
 * Returns a Map of list_id -> ListMetadata (without timestamp).
 */
export function replayListMetadataLog(
  db: IDBDatabase
): Promise<Map<string, Omit<ListMetadataEntry, 'timestamp'>>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, Omit<ListMetadataEntry, 'timestamp'>>()
    const store = db
      .transaction(LIST_METADATA_LOG_STORE, 'readonly')
      .objectStore(LIST_METADATA_LOG_STORE)
    const request = store.openCursor(undefined, 'prev')

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(result)
        return
      }
      const entry = cursor.value as ListMetadataEntry
      if (!result.has(entry.list_id)) {
        const { timestamp: _t, ...meta } = entry
        result.set(entry.list_id, meta)
      }
      cursor.continue()
    }
  })
}

/**
 * Get the latest (most recent) log primary key for each uuid in the set.
 * Single reverse-order cursor scan; first occurrence per uuid = most recent.
 * Used for LIFO pop to determine which instance to remove.
 */
export function getInstanceLatestLogKeys(
  db: IDBDatabase,
  uuids: Set<string>
): Promise<Map<string, number>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, number>()
    const remaining = new Set(uuids)
    if (remaining.size === 0) {
      resolve(result)
      return
    }
    const store = db.transaction(INSTANCE_LOG_STORE, 'readonly').objectStore(INSTANCE_LOG_STORE)
    const request = store.openCursor(undefined, 'prev')

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor || remaining.size === 0) {
        resolve(result)
        return
      }
      const entry = cursor.value as InstanceStateEntry
      if (remaining.has(entry.uuid)) {
        result.set(entry.uuid, cursor.primaryKey as number)
        remaining.delete(entry.uuid)
      }
      cursor.continue()
    }
  })
}

/**
 * Read all instance_log entries in key order (oldest first).
 * Used for debug export.
 */
export function readAllInstanceLog(
  db: IDBDatabase
): Promise<InstanceStateEntry[]> {
  return new Promise((resolve, reject) => {
    const result: InstanceStateEntry[] = []
    const store = db.transaction(INSTANCE_LOG_STORE, 'readonly').objectStore(INSTANCE_LOG_STORE)
    const request = store.openCursor()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(result)
        return
      }
      result.push(cursor.value as InstanceStateEntry)
      cursor.continue()
    }
  })
}

/**
 * Read all list_metadata_log entries in key order (oldest first).
 * Used for debug export.
 */
export function readAllListMetadataLog(
  db: IDBDatabase
): Promise<ListMetadataEntry[]> {
  return new Promise((resolve, reject) => {
    const result: ListMetadataEntry[] = []
    const store = db
      .transaction(LIST_METADATA_LOG_STORE, 'readonly')
      .objectStore(LIST_METADATA_LOG_STORE)
    const request = store.openCursor()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(result)
        return
      }
      result.push(cursor.value as ListMetadataEntry)
      cursor.continue()
    }
  })
}

/**
 * Get all log entries for an instance, in key order (oldest first).
 * Used for restore/undo to find the previous list_id.
 */
export function getInstanceHistory(
  db: IDBDatabase,
  uuid: string
): Promise<InstanceStateEntry[]> {
  return new Promise((resolve, reject) => {
    const result: InstanceStateEntry[] = []
    const store = db.transaction(INSTANCE_LOG_STORE, 'readonly').objectStore(INSTANCE_LOG_STORE)
    const index = store.index('uuid')
    const request = index.openCursor(IDBKeyRange.only(uuid))

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(result)
        return
      }
      result.push(cursor.value as InstanceStateEntry)
      cursor.continue()
    }
  })
}
