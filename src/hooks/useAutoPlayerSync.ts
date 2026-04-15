import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  startPlayerDataWatcher,
  stopPlayerDataWatcher,
  syncPushPlayerData,
} from "../lib/tauri-api";
import { useSyncStore } from "../stores/syncStore";
import { useToastStore } from "../stores/toastStore";

const PUSH_DEBOUNCE_MS = 5_000;

/**
 * Auto-sync player data (characters) — runs globally regardless of which page
 * the user is on. When a .fch change is detected and cloud sync is enabled,
 * pushes characters to the cloud after a short debounce.
 *
 * Mount once in AppShell.
 */
export function useAutoPlayerSync() {
  const enabled = useSyncStore((s) => s.enabled);
  const autoSync = useSyncStore((s) => s.autoSync);
  const addToast = useToastStore((s) => s.addToast);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPushDone = useRef(false);

  // Start watcher + listen for changes
  useEffect(() => {
    if (!enabled || !autoSync) return;

    let unlistenFn: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        await startPlayerDataWatcher();
      } catch (e) {
        console.warn("[MegaLoad] Failed to start player data watcher:", e);
      }

      if (cancelled) return;

      unlistenFn = await listen("player-data-changed", () => {
        // Debounced push — reset timer on each change (Valheim writes often)
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(async () => {
          debounceTimerRef.current = null;
          try {
            const count = await syncPushPlayerData();
            if (count > 0) {
              addToast({
                type: "info",
                title: "Player Sync",
                message: `Pushed ${count} character${count !== 1 ? "s" : ""} to cloud`,
                duration: 2500,
              });
            }
          } catch (e) {
            console.warn("[MegaLoad] Auto player push failed:", e);
          }
        }, PUSH_DEBOUNCE_MS);
      });
    })();

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      stopPlayerDataWatcher().catch(() => {});
    };
  }, [enabled, autoSync, addToast]);

  // Initial push on app start (if sync enabled and we haven't pushed this session)
  useEffect(() => {
    if (!enabled || !autoSync || initialPushDone.current) return;
    initialPushDone.current = true;

    (async () => {
      try {
        const count = await syncPushPlayerData();
        if (count > 0) {
          addToast({
            type: "info",
            title: "Player Sync",
            message: `Pushed ${count} character${count !== 1 ? "s" : ""} on startup`,
            duration: 2500,
          });
        }
      } catch (e) {
        console.warn("[MegaLoad] Initial player push failed:", e);
      }
    })();
  }, [enabled, autoSync, addToast]);
}
