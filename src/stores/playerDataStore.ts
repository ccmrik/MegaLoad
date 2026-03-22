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
  clear: () => void;
}

export const usePlayerDataStore = create<PlayerDataState>((set) => ({
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

  clear: () => set({ character: null, selectedPath: null }),
}));
