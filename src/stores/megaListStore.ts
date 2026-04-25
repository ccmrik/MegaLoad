import { create } from "zustand";
import type {
  MegaList,
  MegaListItem,
  MegaListBlob,
  MegaListFilterSnapshot,
} from "../types/megaList";
import {
  syncReconcileMegaLists,
} from "../lib/tauri-api";
import { useSyncStore } from "./syncStore";
import { debugLog, debugWarn } from "../lib/debug";

const STORAGE_KEY = "megaload_megalist_blob";
const PUSH_DEBOUNCE_MS = 2000;
const EPOCH = new Date(0).toISOString();

function loadDeviceId(): string {
  const key = "megaload_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `device-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function migrateBlob(blob: MegaListBlob): MegaListBlob {
  // Backfill per-item updatedAt for blobs written before tombstone support shipped.
  let migrated = false;
  const lists = blob.lists.map((l) => {
    let listChanged = false;
    const items = l.items.map((it) => {
      if (!it.updatedAt) {
        listChanged = true;
        return { ...it, updatedAt: it.addedAt || EPOCH };
      }
      return it;
    });
    if (listChanged) {
      migrated = true;
      return { ...l, items };
    }
    return l;
  });
  return migrated ? { ...blob, lists } : blob;
}

function loadBlob(deviceId: string): MegaListBlob {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MegaListBlob;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.lists)) {
        return migrateBlob(parsed);
      }
    }
  } catch (e) {
    debugWarn("MegaList: failed to parse stored blob", e);
  }
  return { version: 1, device_id: deviceId, updated_at: EPOCH, lists: [] };
}

function saveBlob(blob: MegaListBlob) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch (e) {
    debugWarn("MegaList: failed to persist blob", e);
  }
}

function uuid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

/** A list/item is "live" when it has no tombstone, or its tombstone is older than its last update. */
export function isLiveList(l: MegaList): boolean {
  return !l.deletedAt || l.deletedAt < l.updatedAt;
}

export function isLiveItem(it: MegaListItem): boolean {
  if (!it.deletedAt) return true;
  const last = it.updatedAt ?? it.addedAt ?? EPOCH;
  return it.deletedAt < last;
}

let _pushTimer: ReturnType<typeof setTimeout> | null = null;

interface MegaListState {
  /** All lists, including tombstoned. UI consumers should filter via `isLiveList`. */
  lists: MegaList[];
  updatedAt: string;
  deviceId: string;
  loaded: boolean;

  // Initial load (call once on app mount). Idempotent.
  init: () => void;
  // Remote reconcile — fetches remote, merges with local on the backend, saves the merged result.
  reconcile: () => Promise<void>;
  // Direct push — same merge-and-save as reconcile; safe to call blind.
  pushNow: () => Promise<void>;
  // Debounced push — coalesces bursts of edits.
  schedulePush: () => void;

  // List CRUD
  createList: (name: string, items?: MegaListItem[], filterSnapshot?: MegaListFilterSnapshot) => string;
  renameList: (listId: string, name: string) => void;
  deleteList: (listId: string) => void;
  duplicateList: (listId: string) => string | null;

  // Item CRUD (within a list)
  addItems: (listId: string, itemIds: string[], source: MegaListItem["source"]) => number;
  removeItem: (listId: string, itemId: string) => void;
  toggleItem: (listId: string, itemId: string) => void;
  setChecked: (listId: string, itemIds: string[], checked: boolean) => void;

  /** Persist a new ordering of lists. `orderedIds` is the full id sequence. */
  reorderLists: (orderedIds: string[]) => void;
  /** Clear manual ordering on every list — back to alphabetical. */
  clearManualOrder: () => void;
}

function buildBlob(state: MegaListState, deviceId: string): MegaListBlob {
  return {
    version: 1,
    device_id: deviceId,
    updated_at: state.updatedAt,
    lists: state.lists,
  };
}

function commit(
  set: (partial: Partial<MegaListState>) => void,
  get: () => MegaListState,
  mutator: (lists: MegaList[]) => MegaList[],
) {
  const next = mutator(get().lists);
  const updatedAt = nowIso();
  set({ lists: next, updatedAt });
  saveBlob(buildBlob({ ...get(), lists: next, updatedAt } as MegaListState, get().deviceId));
  get().schedulePush();
}

export const useMegaListStore = create<MegaListState>((set, get) => ({
  lists: [],
  updatedAt: EPOCH,
  deviceId: "",
  loaded: false,

  init: () => {
    if (get().loaded) return;
    const deviceId = loadDeviceId();
    const blob = loadBlob(deviceId);
    set({
      lists: blob.lists,
      updatedAt: blob.updated_at,
      deviceId,
      loaded: true,
    });
    debugLog(`MegaList: init — ${blob.lists.length} lists, updated_at ${blob.updated_at}`);
  },

  reconcile: async () => {
    // Hard-gate: refuse to run before init() so a fresh-state EPOCH blob never races onto the wire.
    if (!get().loaded) {
      debugWarn("MegaList reconcile: store not loaded — skipping (init must run first)");
      return;
    }
    const syncEnabled = useSyncStore.getState().enabled;
    if (!syncEnabled) {
      debugLog("MegaList reconcile: cloud sync disabled — skip");
      return;
    }
    const local = buildBlob(get(), get().deviceId);
    try {
      const mergedJson = await syncReconcileMegaLists(JSON.stringify(local));
      const merged = JSON.parse(mergedJson) as MegaListBlob;
      set({ lists: merged.lists, updatedAt: merged.updated_at });
      saveBlob(merged);
      debugLog(`MegaList reconcile: merged (${merged.lists.length} lists, updated_at ${merged.updated_at})`);
    } catch (e) {
      debugWarn("MegaList reconcile failed", e);
    }
  },

  pushNow: async () => {
    if (!get().loaded) return;
    const syncEnabled = useSyncStore.getState().enabled;
    if (!syncEnabled) return;
    // Push is just reconcile — backend always merges before writing.
    await get().reconcile();
  },

  schedulePush: () => {
    const syncEnabled = useSyncStore.getState().enabled;
    const autoSync = useSyncStore.getState().autoSync;
    if (!syncEnabled || !autoSync) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
      _pushTimer = null;
      void get().pushNow();
    }, PUSH_DEBOUNCE_MS);
  },

  // ── Lists ────────────────────────────────────────────────────────────────
  createList: (name, items = [], filterSnapshot) => {
    const id = uuid();
    const now = nowIso();
    const stampedItems = items.map((it) => ({ ...it, updatedAt: it.updatedAt ?? now }));
    const list: MegaList = {
      id,
      name: name.trim() || "Untitled list",
      createdAt: now,
      updatedAt: now,
      filterSnapshot,
      items: stampedItems,
    };
    commit(set, get, (lists) => [...lists, list]);
    debugLog(`MegaList: created list "${list.name}" (${items.length} items)`);
    return id;
  },

  renameList: (listId, name) => {
    commit(set, get, (lists) =>
      lists.map((l) =>
        l.id === listId ? { ...l, name: name.trim() || l.name, updatedAt: nowIso() } : l,
      ),
    );
  },

  deleteList: (listId) => {
    // Soft-delete: tombstone propagates to peers so they learn about the deletion.
    const now = nowIso();
    commit(set, get, (lists) =>
      lists.map((l) => (l.id === listId ? { ...l, deletedAt: now, updatedAt: now } : l)),
    );
    debugLog(`MegaList: tombstoned list ${listId}`);
  },

  duplicateList: (listId) => {
    const src = get().lists.find((l) => l.id === listId && isLiveList(l));
    if (!src) return null;
    const id = uuid();
    const now = nowIso();
    const copy: MegaList = {
      ...src,
      id,
      name: `${src.name} (copy)`,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
      items: src.items
        .filter(isLiveItem)
        .map((it) => ({ ...it, updatedAt: now, deletedAt: undefined })),
    };
    commit(set, get, (lists) => [...lists, copy]);
    return id;
  },

  // ── Items ────────────────────────────────────────────────────────────────
  addItems: (listId, itemIds, source) => {
    let added = 0;
    commit(set, get, (lists) =>
      lists.map((l) => {
        if (l.id !== listId) return l;
        const now = nowIso();
        // Index existing items by itemId (including tombstoned ones, which we'll un-tombstone).
        const byId = new Map(l.items.map((it) => [it.itemId, it]));
        const nextItems = [...l.items];
        for (const id of itemIds) {
          const existing = byId.get(id);
          if (existing) {
            // If tombstoned, revive it; otherwise leave alone (it's already there).
            if (existing.deletedAt && !isLiveItem(existing)) {
              const idx = nextItems.findIndex((it) => it.itemId === id);
              if (idx >= 0) {
                nextItems[idx] = {
                  ...existing,
                  checked: false,
                  source,
                  updatedAt: now,
                  deletedAt: undefined,
                };
                added++;
              }
            }
          } else {
            nextItems.push({
              itemId: id,
              checked: false,
              addedAt: now,
              source,
              updatedAt: now,
            });
            added++;
          }
        }
        if (added === 0) return l;
        return { ...l, items: nextItems, updatedAt: now };
      }),
    );
    return added;
  },

  removeItem: (listId, itemId) => {
    const now = nowIso();
    commit(set, get, (lists) =>
      lists.map((l) =>
        l.id === listId
          ? {
              ...l,
              items: l.items.map((it) =>
                it.itemId === itemId ? { ...it, deletedAt: now, updatedAt: now } : it,
              ),
              updatedAt: now,
            }
          : l,
      ),
    );
  },

  toggleItem: (listId, itemId) => {
    const now = nowIso();
    commit(set, get, (lists) =>
      lists.map((l) =>
        l.id === listId
          ? {
              ...l,
              items: l.items.map((it) =>
                it.itemId === itemId ? { ...it, checked: !it.checked, updatedAt: now } : it,
              ),
              updatedAt: now,
            }
          : l,
      ),
    );
  },

  setChecked: (listId, itemIds, checked) => {
    const now = nowIso();
    const set_ = new Set(itemIds);
    commit(set, get, (lists) =>
      lists.map((l) =>
        l.id === listId
          ? {
              ...l,
              items: l.items.map((it) =>
                set_.has(it.itemId) ? { ...it, checked, updatedAt: now } : it,
              ),
              updatedAt: now,
            }
          : l,
      ),
    );
  },

  reorderLists: (orderedIds) => {
    const indexOf = new Map(orderedIds.map((id, idx) => [id, idx]));
    const now = nowIso();
    commit(set, get, (lists) =>
      lists.map((l) => {
        const idx = indexOf.get(l.id);
        return idx !== undefined ? { ...l, order: idx, updatedAt: now } : l;
      }),
    );
    debugLog(`MegaList: reordered ${orderedIds.length} lists`);
  },

  clearManualOrder: () => {
    const now = nowIso();
    commit(set, get, (lists) =>
      lists.map((l) => {
        if (l.order === undefined) return l;
        const { order: _drop, ...rest } = l;
        void _drop;
        return { ...rest, updatedAt: now };
      }),
    );
    debugLog("MegaList: manual order cleared → alphabetical");
  },
}));
