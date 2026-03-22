import { create } from "zustand";
import {
  listCharacters,
  readCharacter,
  type CharacterSummary,
  type CharacterData,
} from "../lib/tauri-api";

interface PlayerDataState {
  characters: CharacterSummary[];
  selectedPath: string | null;
  character: CharacterData | null;
  loading: boolean;
  error: string | null;

  fetchCharacters: () => Promise<void>;
  selectCharacter: (path: string) => Promise<void>;
  /** Re-read the currently selected character (for live updates) */
  refreshSelected: () => Promise<void>;
  clear: () => void;
}

export const usePlayerDataStore = create<PlayerDataState>((set, get) => ({
  characters: [],
  selectedPath: null,
  character: null,
  loading: false,
  error: null,

  fetchCharacters: async () => {
    set({ loading: true, error: null });
    try {
      const characters = await listCharacters();
      set({ characters, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectCharacter: async (path: string) => {
    set({ loading: true, error: null, selectedPath: path });
    try {
      const character = await readCharacter(path);
      set({ character, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  refreshSelected: async () => {
    const { selectedPath } = get();
    if (!selectedPath) return;
    try {
      const characters = await listCharacters();
      const character = await readCharacter(selectedPath);
      set({ characters, character });
    } catch {
      // Silently ignore — file may be mid-write
    }
  },

  clear: () => set({ character: null, selectedPath: null }),
}));
