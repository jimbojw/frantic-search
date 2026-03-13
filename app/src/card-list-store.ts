// SPDX-License-Identifier: Apache-2.0
import type {
  InstanceState,
  InstanceStateEntry,
  ImportCandidate,
  ListMetadata,
  ListMetadataEntry,
  MaterializedView,
} from '@frantic-search/shared'
import {
  EXTERNAL_LIST_ID,
  TRASH_LIST_ID,
  DEFAULT_LIST_ID,
  BROADCAST_CHANNEL_NAME,
} from '@frantic-search/shared'
import {
  openCardListDb,
  appendInstanceEntry,
  appendInstanceEntries,
  appendListMetadataEntry,
  replayInstanceLog,
  replayListMetadataLog,
  readAllInstanceLog,
  readAllListMetadataLog,
  getInstanceHistory,
  getInstanceLatestLogKeys,
} from './card-list-db'

function buildInstancesByList(instances: Map<string, InstanceState>): Map<string, Set<string>> {
  const byList = new Map<string, Set<string>>()
  for (const [uuid, state] of instances) {
    let set = byList.get(state.list_id)
    if (!set) {
      set = new Set()
      byList.set(state.list_id, set)
    }
    set.add(uuid)
  }
  return byList
}

export class CardListStore {
  private db: IDBDatabase | null = null
  private view: MaterializedView = {
    instances: new Map(),
    lists: new Map(),
    instancesByList: new Map(),
  }
  private channel: BroadcastChannel | null = null
  private initPromise: Promise<void> | null = null
  private onChange?: (affectedListIds: string[]) => void

  constructor(onChange?: (affectedListIds: string[]) => void) {
    this.onChange = onChange
  }

  /**
   * Initialize the store: open IndexedDB, replay logs, bootstrap default list, subscribe to BroadcastChannel.
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<void> {
    this.db = await openCardListDb()

    const [instances, listMeta] = await Promise.all([
      replayInstanceLog(this.db),
      replayListMetadataLog(this.db),
    ])

    this.view.instances = instances as Map<string, InstanceState>
    this.view.lists = listMeta as Map<string, ListMetadata>
    this.view.instancesByList = buildInstancesByList(this.view.instances)

    if (!this.view.lists.has(DEFAULT_LIST_ID)) {
      const entry: ListMetadataEntry = {
        list_id: DEFAULT_LIST_ID,
        name: 'My List',
        short_name: 'list',
        timestamp: Date.now(),
      }
      await appendListMetadataEntry(this.db, entry)
      this.view.lists.set(DEFAULT_LIST_ID, {
        list_id: DEFAULT_LIST_ID,
        name: 'My List',
        short_name: 'list',
      })
    }

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
      this.channel.onmessage = (e: MessageEvent) => {
        this.handleBroadcast(e.data)
      }
    }
  }

  private handleBroadcast(msg: { type: string; instance?: InstanceState; previous?: Pick<InstanceState, 'list_id'> | null; metadata?: ListMetadata; previousMetadata?: ListMetadata | null }): void {
    if (msg.type === 'instance-updated' && msg.instance) {
      const { instance, previous } = msg
      if (previous?.list_id) {
        const prevSet = this.view.instancesByList.get(previous.list_id)
        if (prevSet) {
          prevSet.delete(instance.uuid)
          if (prevSet.size === 0) this.view.instancesByList.delete(previous.list_id)
        }
      }
      let set = this.view.instancesByList.get(instance.list_id)
      if (!set) {
        set = new Set()
        this.view.instancesByList.set(instance.list_id, set)
      }
      set.add(instance.uuid)
      this.view.instances.set(instance.uuid, instance)
      const affected = [previous?.list_id, instance.list_id].filter((id): id is string => !!id)
      this.onChange?.([...new Set(affected)])
    } else if (msg.type === 'list-metadata-updated' && msg.metadata) {
      this.view.lists.set(msg.metadata.list_id, msg.metadata)
    }
  }

  private broadcastInstance(instance: InstanceState, previous: Pick<InstanceState, 'list_id'> | null): void {
    this.channel?.postMessage({ type: 'instance-updated', instance, previous })
  }

  private broadcastListMetadata(metadata: ListMetadata, previous: ListMetadata | null): void {
    this.channel?.postMessage({ type: 'list-metadata-updated', metadata, previous })
  }

  private applyInstanceDelta(instance: InstanceState, previous: Pick<InstanceState, 'list_id'> | null): void {
    const affected = this.applyInstanceDeltaToView(instance, previous)
    this.onChange?.([...new Set(affected)])
  }

  /**
   * Apply instance delta to the materialized view only. Returns affected list IDs.
   */
  private applyInstanceDeltaToView(
    instance: InstanceState,
    previous: Pick<InstanceState, 'list_id'> | null
  ): string[] {
    if (previous?.list_id) {
      const prevSet = this.view.instancesByList.get(previous.list_id)
      if (prevSet) {
        prevSet.delete(instance.uuid)
        if (prevSet.size === 0) this.view.instancesByList.delete(previous.list_id)
      }
    }
    let set = this.view.instancesByList.get(instance.list_id)
    if (!set) {
      set = new Set()
      this.view.instancesByList.set(instance.list_id, set)
    }
    set.add(instance.uuid)
    this.view.instances.set(instance.uuid, instance)
    return [previous?.list_id, instance.list_id].filter((id): id is string => !!id)
  }

  getView(): MaterializedView {
    return this.view
  }

  /**
   * Return the newest (most recently added) matching instance, or null if none.
   * Oracle-level: pass oracleId only; printing-level: pass scryfallId and finish.
   * Used when adding to clone metadata from existing entry so list deduplication works.
   */
  async getNewestMatchingInstance(
    listId: string,
    oracleId: string,
    scryfallId?: string | null,
    finish?: string | null
  ): Promise<InstanceState | null> {
    if (!this.db) return null
    const uuids = this.view.instancesByList.get(listId)
    if (!uuids || uuids.size === 0) return null
    const isOracleLevel = scryfallId == null && finish == null
    const matching = new Set<string>()
    for (const uuid of uuids) {
      const instance = this.view.instances.get(uuid)
      if (!instance || instance.oracle_id !== oracleId) continue
      if (isOracleLevel) {
        if (instance.scryfall_id == null && instance.finish == null) matching.add(uuid)
      } else {
        const finishMatch =
          instance.finish === finish ||
          (finish === 'nonfoil' && instance.finish == null)
        if (instance.scryfall_id === scryfallId && finishMatch) matching.add(uuid)
      }
    }
    if (matching.size === 0) return null
    const keys = await getInstanceLatestLogKeys(this.db, matching)
    let maxKey = -1
    let targetUuid: string | null = null
    for (const [uuid, key] of keys) {
      if (key > maxKey) {
        maxKey = key
        targetUuid = uuid
      }
    }
    return targetUuid ? this.view.instances.get(targetUuid) ?? null : null
  }

  /**
   * Add a new instance to a list. Assigns uuid via crypto.randomUUID().
   * When the caller does not pass tags/zone/collection_status/variant and a matching
   * instance exists, clones metadata from the newest matching instance so list
   * deduplication yields a single line with increased count.
   */
  async addInstance(
    oracleId: string,
    listId: string,
    opts?: {
      scryfallId?: string | null
      finish?: string | null
      zone?: string | null
      tags?: string[]
      collection_status?: string | null
      variant?: string | null
    }
  ): Promise<InstanceState> {
    if (!this.db) throw new Error('CardListStore not initialized')
    const shouldCloneMetadata =
      opts?.tags === undefined &&
      opts?.zone === undefined &&
      opts?.collection_status === undefined &&
      opts?.variant === undefined
    let resolvedOpts = opts
    if (shouldCloneMetadata) {
      const template = await this.getNewestMatchingInstance(
        listId,
        oracleId,
        opts?.scryfallId ?? undefined,
        opts?.finish ?? undefined
      )
      if (template) {
        resolvedOpts = {
          ...opts,
          tags: template.tags,
          zone: template.zone,
          collection_status: template.collection_status,
          variant: template.variant,
        }
      }
    }
    const uuid = crypto.randomUUID()
    const instance: InstanceState = {
      uuid,
      oracle_id: oracleId,
      scryfall_id: resolvedOpts?.scryfallId ?? null,
      finish: resolvedOpts?.finish ?? null,
      list_id: listId,
      zone: resolvedOpts?.zone ?? null,
      tags: resolvedOpts?.tags ?? [],
      collection_status: resolvedOpts?.collection_status ?? null,
      variant: resolvedOpts?.variant ?? null,
    }
    const entry: InstanceStateEntry = { ...instance, timestamp: Date.now() }
    await appendInstanceEntry(this.db, entry)
    this.applyInstanceDelta(instance, null)
    this.broadcastInstance(instance, null)
    return instance
  }

  /**
   * Transfer an instance to a new list.
   */
  async transferInstance(uuid: string, newListId: string): Promise<InstanceState | null> {
    if (!this.db) throw new Error('CardListStore not initialized')
    const current = this.view.instances.get(uuid)
    if (!current) return null
    const instance: InstanceState = { ...current, list_id: newListId }
    const entry: InstanceStateEntry = { ...instance, timestamp: Date.now() }
    await appendInstanceEntry(this.db, entry)
    this.applyInstanceDelta(instance, { list_id: current.list_id })
    this.broadcastInstance(instance, { list_id: current.list_id })
    return instance
  }

  /**
   * Remove the most recently added matching instance (LIFO pop) to trash.
   * Oracle-level: pass oracleId only; printing-level: pass scryfallId and finish.
   * Returns true if removed, false if none matched.
   */
  async removeMostRecentMatchingInstance(
    listId: string,
    oracleId: string,
    scryfallId?: string | null,
    finish?: string | null
  ): Promise<boolean> {
    if (!this.db) throw new Error('CardListStore not initialized')
    const uuids = this.view.instancesByList.get(listId)
    if (!uuids || uuids.size === 0) return false
    const isOracleLevel = scryfallId == null && finish == null
    const matching = new Set<string>()
    for (const uuid of uuids) {
      const instance = this.view.instances.get(uuid)
      if (!instance || instance.oracle_id !== oracleId) continue
      if (isOracleLevel) {
        if (instance.scryfall_id == null && instance.finish == null) matching.add(uuid)
      } else {
        if (instance.scryfall_id === scryfallId && instance.finish === finish) matching.add(uuid)
      }
    }
    if (matching.size === 0) return false
    const keys = await getInstanceLatestLogKeys(this.db, matching)
    let maxKey = -1
    let targetUuid: string | null = null
    for (const [uuid, key] of keys) {
      if (key > maxKey) {
        maxKey = key
        targetUuid = uuid
      }
    }
    if (targetUuid) {
      await this.removeToTrash(targetUuid)
      return true
    }
    return false
  }

  /**
   * Remove an instance to trash.
   */
  async removeToTrash(uuid: string): Promise<InstanceState | null> {
    return this.transferInstance(uuid, TRASH_LIST_ID)
  }

  /**
   * Apply a diff in batch: removals go to trash, additions go to the target list.
   * Uses a single IndexedDB transaction and calls onChange once at the end.
   */
  async applyDiff(
    listId: string,
    removals: InstanceState[],
    additions: ImportCandidate[]
  ): Promise<void> {
    if (!this.db) throw new Error('CardListStore not initialized')
    if (removals.length === 0 && additions.length === 0) return

    const entries: InstanceStateEntry[] = []
    const newInstances: InstanceState[] = []
    const timestamp = Date.now()

    for (const inst of removals) {
      entries.push({
        ...inst,
        list_id: TRASH_LIST_ID,
        timestamp,
      })
    }

    for (const cand of additions) {
      const uuid = crypto.randomUUID()
      const instance: InstanceState = {
        uuid,
        oracle_id: cand.oracle_id,
        scryfall_id: cand.scryfall_id ?? null,
        finish: cand.finish ?? null,
        list_id: listId,
        zone: cand.zone ?? null,
        tags: cand.tags ?? [],
        collection_status: cand.collection_status ?? null,
        variant: cand.variant ?? null,
      }
      entries.push({ ...instance, timestamp })
      newInstances.push(instance)
    }

    await appendInstanceEntries(this.db, entries)

    const affected = new Set<string>()
    for (const inst of removals) {
      const transfer: InstanceState = { ...inst, list_id: TRASH_LIST_ID }
      for (const id of this.applyInstanceDeltaToView(transfer, { list_id: inst.list_id })) {
        affected.add(id)
      }
      this.broadcastInstance(transfer, { list_id: inst.list_id })
    }

    for (const instance of newInstances) {
      for (const id of this.applyInstanceDeltaToView(instance, null)) {
        affected.add(id)
      }
      this.broadcastInstance(instance, null)
    }

    this.onChange?.([...affected])
  }

  /**
   * Restore an instance from trash to its previous list.
   */
  async restoreFromTrash(uuid: string): Promise<InstanceState | null> {
    if (!this.db) throw new Error('CardListStore not initialized')
    const current = this.view.instances.get(uuid)
    if (!current || current.list_id !== TRASH_LIST_ID) return null
    const history = await getInstanceHistory(this.db, uuid)
    const previousEntry = history[history.length - 2]
    const previousListId = previousEntry?.list_id ?? DEFAULT_LIST_ID
    return this.transferInstance(uuid, previousListId)
  }

  /**
   * Permanently delete an instance (sends to external).
   */
  async permanentDelete(uuid: string): Promise<InstanceState | null> {
    return this.transferInstance(uuid, EXTERNAL_LIST_ID)
  }

  /**
   * Undo: revert instance to its previous list_id.
   */
  async undo(uuid: string): Promise<InstanceState | null> {
    if (!this.db) throw new Error('CardListStore not initialized')
    const history = await getInstanceHistory(this.db, uuid)
    if (history.length < 2) return null
    const previousListId = history[history.length - 2].list_id
    return this.transferInstance(uuid, previousListId)
  }

  /**
   * Export full history for debugging. Returns JSON string of instance_log,
   * list_metadata_log, and materialized view.
   */
  async getDebugDump(): Promise<string> {
    if (!this.db) return JSON.stringify({ error: 'CardListStore not initialized' })
    const [instanceLog, metadataLog] = await Promise.all([
      readAllInstanceLog(this.db),
      readAllListMetadataLog(this.db),
    ])
    const materialized = {
      instances: Object.fromEntries(this.view.instances),
      lists: Object.fromEntries(this.view.lists),
      instancesByList: Object.fromEntries(
        [...this.view.instancesByList.entries()].map(([k, v]) => [k, [...v]])
      ),
    }
    return JSON.stringify(
      {
        instance_log: instanceLog,
        list_metadata_log: metadataLog,
        materialized_view: materialized,
      },
      null,
      2
    )
  }

  /**
   * Update list metadata.
   */
  async updateListMetadata(
    listId: string,
    metadata: Omit<ListMetadata, 'list_id'>
  ): Promise<ListMetadata> {
    if (!this.db) throw new Error('CardListStore not initialized')
    const previous = this.view.lists.get(listId) ?? null
    const entry: ListMetadataEntry = {
      list_id: listId,
      ...metadata,
      timestamp: Date.now(),
    }
    await appendListMetadataEntry(this.db, entry)
    const meta: ListMetadata = { list_id: listId, ...metadata }
    this.view.lists.set(listId, meta)
    this.broadcastListMetadata(meta, previous)
    return meta
  }
}
