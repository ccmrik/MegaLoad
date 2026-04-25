// Mirror: MegaApp/src/types/megaList.ts — keep in sync.

export interface MegaListItem {
  itemId: string;
  checked: boolean;
  addedAt: string;
  source: "export" | "manual";
  /** Set whenever the item is mutated (checked/unchecked, source change). Used for merge tie-breaks across devices. */
  updatedAt?: string;
  /** Soft-delete tombstone. If present and >= updatedAt, the item is treated as removed. */
  deletedAt?: string;
}

export interface MegaListFilterSnapshot {
  query?: string;
  types?: string[];
  subcategories?: string[];
  biomes?: string[];
  stations?: string[];
  factories?: string[];
  vendors?: string[];
  onlyTameable?: boolean;
  exportedAt: string;
}

export interface MegaList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  filterSnapshot?: MegaListFilterSnapshot;
  items: MegaListItem[];
  /** Manual ordering index — set when the user drags to reorder.
   *  Undefined means "sort alphabetically" (the default). */
  order?: number;
  /** Soft-delete tombstone. If present and >= updatedAt, the list is treated as deleted.
   *  Kept in the blob for ~30 days so peer devices learn about the deletion, then GC'd. */
  deletedAt?: string;
}

export interface MegaListBlob {
  version: 1;
  device_id: string;
  updated_at: string;
  lists: MegaList[];
}

export function emptyBlob(deviceId: string): MegaListBlob {
  return {
    version: 1,
    device_id: deviceId,
    updated_at: new Date(0).toISOString(),
    lists: [],
  };
}
