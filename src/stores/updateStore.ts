import { create } from "zustand";
import {
  checkModUpdates,
  autoUpdateMods,
  type UpdateCheckResult,
} from "../lib/tauri-api";

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
}

export const useUpdateStore = create<UpdateState>((set) => ({
  checking: false,
  updating: false,
  updateResult: null,
  error: null,
  startupCheckDone: false,

  checkUpdates: async (bepinexPath: string) => {
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
}));
