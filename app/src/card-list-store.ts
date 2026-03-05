// SPDX-License-Identifier: Apache-2.0
import type {
  InstanceState,
  InstanceStateEntry,
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
  appendListMetadataEntry,
  replayInstanceLog,
  replayListMetadataLog,
  getInstanceHistory,
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
  }

  getView(): MaterializedView {
    return this.view
  }

  /**
   * Add a new instance to a list. Assigns uuid via crypto.randomUUID().
   */
  async addInstance(
    oracleId: string,
    listId: string,
    scryfallId: string | null = null,
    finish: string | null = null
  ): Promise<InstanceState> {
    if (!this.db) throw new Error('CardListStore not initialized')
    const uuid = crypto.randomUUID()
    const instance: InstanceState = {
      uuid,
      oracle_id: oracleId,
      scryfall_id: scryfallId,
      finish,
      list_id: listId,
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
   * Remove an instance to trash.
   */
  async removeToTrash(uuid: string): Promise<InstanceState | null> {
    return this.transferInstance(uuid, TRASH_LIST_ID)
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
