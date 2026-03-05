// SPDX-License-Identifier: Apache-2.0
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { InstanceStateEntry, ListMetadataEntry } from '@frantic-search/shared'
import {
  openCardListDb,
  appendInstanceEntry,
  appendListMetadataEntry,
  replayInstanceLog,
  replayListMetadataLog,
  getInstanceHistory,
} from './card-list-db'

function uniqueDbName(): string {
  return `frantic-search-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe('card-list-db', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openCardListDb(uniqueDbName())
  })

  afterEach(() => {
    db.close()
  })

  describe('appendInstanceEntry', () => {
    it('appends an entry to instance_log', async () => {
      const entry: InstanceStateEntry = {
        uuid: 'a1b2c3d4-0000-4000-8000-000000000001',
        oracle_id: 'oracle-1',
        scryfall_id: null,
        finish: null,
        list_id: 'default',
        timestamp: 1000,
      }
      await appendInstanceEntry(db, entry)
      const result = await replayInstanceLog(db)
      expect(result.size).toBe(1)
      expect(result.get(entry.uuid)).toEqual({
        uuid: entry.uuid,
        oracle_id: entry.oracle_id,
        scryfall_id: entry.scryfall_id,
        finish: entry.finish,
        list_id: entry.list_id,
      })
    })
  })

  describe('replayInstanceLog', () => {
    it('returns latest entry per uuid when multiple entries exist', async () => {
      const uuid = 'a1b2c3d4-0000-4000-8000-000000000002'
      await appendInstanceEntry(db, {
        uuid,
        oracle_id: 'oracle-1',
        scryfall_id: null,
        finish: null,
        list_id: 'default',
        timestamp: 1000,
      })
      await appendInstanceEntry(db, {
        uuid,
        oracle_id: 'oracle-1',
        scryfall_id: null,
        finish: null,
        list_id: 'trash',
        timestamp: 2000,
      })
      const result = await replayInstanceLog(db)
      expect(result.size).toBe(1)
      expect(result.get(uuid)?.list_id).toBe('trash')
    })

    it('handles multiple uuids', async () => {
      await appendInstanceEntry(db, {
        uuid: 'uuid-1',
        oracle_id: 'o1',
        scryfall_id: null,
        finish: null,
        list_id: 'default',
        timestamp: 1000,
      })
      await appendInstanceEntry(db, {
        uuid: 'uuid-2',
        oracle_id: 'o2',
        scryfall_id: 's2',
        finish: 'foil',
        list_id: 'default',
        timestamp: 1000,
      })
      const result = await replayInstanceLog(db)
      expect(result.size).toBe(2)
      expect(result.get('uuid-1')?.oracle_id).toBe('o1')
      expect(result.get('uuid-2')?.scryfall_id).toBe('s2')
      expect(result.get('uuid-2')?.finish).toBe('foil')
    })
  })

  describe('appendListMetadataEntry', () => {
    it('appends an entry to list_metadata_log', async () => {
      const entry: ListMetadataEntry = {
        list_id: 'default',
        name: 'My List',
        short_name: 'list',
        timestamp: 1000,
      }
      await appendListMetadataEntry(db, entry)
      const result = await replayListMetadataLog(db)
      expect(result.size).toBe(1)
      expect(result.get('default')).toEqual({
        list_id: 'default',
        name: 'My List',
        short_name: 'list',
      })
    })
  })

  describe('replayListMetadataLog', () => {
    it('returns latest entry per list_id when multiple entries exist', async () => {
      await appendListMetadataEntry(db, {
        list_id: 'default',
        name: 'Old Name',
        timestamp: 1000,
      })
      await appendListMetadataEntry(db, {
        list_id: 'default',
        name: 'New Name',
        short_name: 'list',
        timestamp: 2000,
      })
      const result = await replayListMetadataLog(db)
      expect(result.size).toBe(1)
      expect(result.get('default')?.name).toBe('New Name')
      expect(result.get('default')?.short_name).toBe('list')
    })
  })

  describe('getInstanceHistory', () => {
    it('returns entries in chronological order', async () => {
      const uuid = 'uuid-history'
      await appendInstanceEntry(db, {
        uuid,
        oracle_id: 'o1',
        scryfall_id: null,
        finish: null,
        list_id: 'default',
        timestamp: 1000,
      })
      await appendInstanceEntry(db, {
        uuid,
        oracle_id: 'o1',
        scryfall_id: null,
        finish: null,
        list_id: 'trash',
        timestamp: 2000,
      })
      const history = await getInstanceHistory(db, uuid)
      expect(history).toHaveLength(2)
      expect(history[0].list_id).toBe('default')
      expect(history[1].list_id).toBe('trash')
    })

    it('returns empty array for unknown uuid', async () => {
      const history = await getInstanceHistory(db, 'unknown-uuid')
      expect(history).toHaveLength(0)
    })
  })
})
