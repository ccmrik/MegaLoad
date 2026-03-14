import { create } from "zustand";
import { getLoggingEnabled, setLoggingEnabled as apiSetLogging } from "../lib/tauri-api";

interface SettingsState {
  loggingEnabled: boolean;
  loaded: boolean;
  fetchSettings: () => Promise<void>;
  setLoggingEnabled: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  loggingEnabled: false,
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
}));
