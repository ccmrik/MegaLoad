import { create } from "zustand";
import { getLoggingEnabled, setLoggingEnabled as apiSetLogging } from "../lib/tauri-api";

interface SettingsState {
  loggingEnabled: boolean;
  megabugsEnabled: boolean;
  loaded: boolean;
  fetchSettings: () => Promise<void>;
  setLoggingEnabled: (enabled: boolean) => Promise<void>;
  setMegabugsEnabled: (enabled: boolean) => void;
}

const MEGABUGS_KEY = "megaload_megabugs_enabled";

export const useSettingsStore = create<SettingsState>((set) => ({
  loggingEnabled: false,
  megabugsEnabled: localStorage.getItem(MEGABUGS_KEY) !== "false", // default on
  loaded: false,

  fetchSettings: async () => {
    try {
      const logging = await getLoggingEnabled();
      set({ loggingEnabled: logging, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setLoggingEnabled: async (enabled: boolean) => {
    await apiSetLogging(enabled);
    set({ loggingEnabled: enabled });
  },

  setMegabugsEnabled: (enabled: boolean) => {
    localStorage.setItem(MEGABUGS_KEY, String(enabled));
    set({ megabugsEnabled: enabled });
  },
}));
