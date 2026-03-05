// SPDX-License-Identifier: Apache-2.0

/** Instance state in the materialized view (log entry minus timestamp). */
export interface InstanceState {
  uuid: string
  oracle_id: string
  scryfall_id: string | null
  finish: string | null
  list_id: string
}

/** Instance log entry. Every entry is a full snapshot. Latest per uuid = current state. */
export interface InstanceStateEntry extends InstanceState {
  timestamp: number
}

/** List metadata in the materialized view (log entry minus timestamp). */
export interface ListMetadata {
  list_id: string
  name: string
  description?: string
  short_name?: string
}

/** List metadata log entry. Every entry is a full snapshot. Latest per list_id = current metadata. */
export interface ListMetadataEntry extends ListMetadata {
  timestamp: number
}

/** Materialized view: current state derived from replaying the log. */
export interface MaterializedView {
  instances: Map<string, InstanceState>
  lists: Map<string, ListMetadata>
  instancesByList: Map<string, Set<string>>
}

/** Instance state changed. Receiver: remove uuid from previous.list_id, add to instance.list_id, overwrite instance. */
export interface InstanceUpdatedMessage {
  type: 'instance-updated'
  instance: InstanceState
  previous: Pick<InstanceState, 'list_id'> | null
}

/** List metadata changed. Receiver: overwrite metadata for list_id. */
export interface ListMetadataUpdatedMessage {
  type: 'list-metadata-updated'
  metadata: ListMetadata
  previous: ListMetadata | null
}

export type CardListBroadcastMessage = InstanceUpdatedMessage | ListMetadataUpdatedMessage

/** Reserved list IDs — cannot be used as user list IDs. */
export const EXTERNAL_LIST_ID = 'external'
export const TRASH_LIST_ID = 'trash'
export const DEFAULT_LIST_ID = 'default'

export const BROADCAST_CHANNEL_NAME = 'frantic-search-card-lists'
