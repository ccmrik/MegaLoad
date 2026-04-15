import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  startPlayerDataWatcher,
  stopPlayerDataWatcher,
  syncPushPlayerData,
} from "../lib/tauri-api";
import { useSyncStore } from "../stores/syncStore";
import { useIdentityStore } from "../stores/identityStore";
import { useToastStore } from "../stores/toastStore";

const PUSH_DEBOUNCE_MS = 5_000;
const INITIAL_PUSH_DELAY_MS = 3_000; // Give the UI time to render first

/**
 * Auto-sync player data (characters) — runs globally regardless of which page
 * the user is on. When a .fch change is detected and cloud sync is enabled,
 * pushes characters to the cloud after a short debounce.
 *
 * Startup policy:
 *   - Waits for identity to be loaded (so IdentityGate completes first)
 *   - Then waits 3s to let the UI settle
 *   - Only THEN does the initial push
 *
 * The Tauri command itself runs via spawn_blocking so it doesn't occupy the
 * Tauri IPC pool and block other commands.
 *
 * Mount once in AppShell.
 */
export function useAutoPlayerSync() {
  const enabled = useSyncStore((s) => s.enabled);
  const autoSync = useSyncStore((s) => s.autoSync);
  const identity = useIdentityStore((s) => s.identity);
  const addToast = useToastStore((s) => s.addToast);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPushDone = useRef(false);

  // Start watcher + listen for changes (no sync here, just setup)
  useEffect(() => {
    if (!enabled || !autoSync || !identity) return;

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
  }, [enabled, autoSync, identity, addToast]);

  // Deferred initial push — only after identity is loaded + 3s delay so the
  // UI has already rendered and IdentityGate has cleared its loader
  useEffect(() => {
    if (!enabled || !autoSync || !identity || initialPushDone.current) return;

    initialPushTimerRef.current = setTimeout(() => {
      initialPushTimerRef.current = null;
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
    }, INITIAL_PUSH_DELAY_MS);

    return () => {
      if (initialPushTimerRef.current) {
        clearTimeout(initialPushTimerRef.current);
        initialPushTimerRef.current = null;
      }
    };
  }, [enabled, autoSync, identity, addToast]);
}
