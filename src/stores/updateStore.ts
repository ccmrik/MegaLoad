import { create } from "zustand";
import {
  checkModUpdates,
  autoUpdateMods,
  type UpdateCheckResult,
} from "../lib/tauri-api";

/** Poll every 5 minutes for mod updates (check only, no auto-install) */
const MOD_POLL_INTERVAL_MS = 5 * 60 * 1000;

interface UpdateState {
  checking: boolean;
  updating: boolean;
  updateResult: UpdateCheckResult | null;
  error: string | null;
  /** True once the first startup check (+ auto-install) has finished */
  startupCheckDone: boolean;

  /** Check all mods for available updates */
  checkUpdates: (bepinexPath: string) => Promise<UpdateCheckResult | null>;

  /** Check + auto-install all available updates (startup flow) */
  autoUpdate: (bepinexPath: string) => Promise<UpdateCheckResult | null>;

  /** Start periodic mod update checking (check only, no auto-install) */
  startLiveCheck: (bepinexPath: string) => void;

  /** Stop periodic checking */
  stopLiveCheck: () => void;
}

let modPollTimer: ReturnType<typeof setInterval> | null = null;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  checking: false,
  updating: false,
  updateResult: null,
  error: null,
  startupCheckDone: false,

  checkUpdates: async (bepinexPath: string) => {
    const { checking, updating } = get();
    if (checking || updating) return null;

    set({ checking: true, error: null });
    try {
      const result = await checkModUpdates(bepinexPath);
      set({ updateResult: result, checking: false });
      return result;
    } catch (e) {
      set({ error: String(e), checking: false });
      return null;
    }
  },

  autoUpdate: async (bepinexPath: string) => {
    set({ checking: true, updating: true, error: null });
    try {
      const result = await autoUpdateMods(bepinexPath);
      set({
        updateResult: result,
        checking: false,
        updating: false,
        startupCheckDone: true,
      });
      return result;
    } catch (e) {
      set({
        error: String(e),
        checking: false,
        updating: false,
        startupCheckDone: true,
      });
      return null;
    }
  },

  startLiveCheck: (bepinexPath: string) => {
    if (modPollTimer) return;
    // Don't do an immediate check — the startup autoUpdate handles that.
    // First periodic check fires after the interval.
    modPollTimer = setInterval(() => {
      get().checkUpdates(bepinexPath);
    }, MOD_POLL_INTERVAL_MS);
  },

  stopLiveCheck: () => {
    if (modPollTimer) {
      clearInterval(modPollTimer);
      modPollTimer = null;
    }
  },
}));
