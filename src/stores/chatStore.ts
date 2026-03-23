import { create } from "zustand";
import {
  chatSendMessage,
  chatGetUsage,
  chatGetDebugEnabled,
  chatSetDebugEnabled as apiSetDebug,
  type ChatMessage,
  type DailyUsage,
} from "../lib/tauri-api";
import { useModStore } from "./modStore";
import { usePlayerDataStore } from "./playerDataStore";
import { useProfileStore } from "./profileStore";
import { useAppUpdateStore } from "./appUpdateStore";

const MAX_HISTORY = 20;
const DAILY_TOKEN_LIMIT = 50_000;

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  inputTokens?: number;
  outputTokens?: number;
}

interface ChatState {
  messages: DisplayMessage[];
  loading: boolean;
  error: string | null;
  usage: DailyUsage | null;
  debugEnabled: boolean;
  debugLoaded: boolean;

  sendMessage: (userText: string) => Promise<void>;
  clearChat: () => void;
  fetchUsage: () => Promise<void>;
  fetchDebug: () => Promise<void>;
  setDebugEnabled: (enabled: boolean) => Promise<void>;
}

function buildSystemPrompt(): string {
  const version = useAppUpdateStore.getState().currentVersion;
  const profile = useProfileStore.getState().activeProfile();
  const mods = useModStore.getState().mods;
  const player = usePlayerDataStore.getState();

  let ctx = `You are MegaChat, the AI assistant built into MegaLoad v${version} — a Valheim mod manager.
You help players with Valheim gameplay, mod configuration, character data, and troubleshooting.
Be helpful, concise, and friendly. Use markdown formatting for readability.
If you don't know something, say so — don't make things up.

Current context:`;

  if (profile) {
    ctx += `\n- Active profile: ${profile.name}`;
  }

  if (mods.length > 0) {
    const enabled = mods.filter((m) => m.enabled);
    ctx += `\n- Installed mods (${enabled.length} enabled): ${enabled.map((m) => m.name || m.file_name).join(", ")}`;
  }

  if (player.character) {
    const c = player.character;
    ctx += `\n- Selected character: ${c.name}`;
    if (c.skills && c.skills.length > 0) {
      const top = [...c.skills].sort((a, b) => b.level - a.level).slice(0, 5);
      ctx += `\n- Top skills: ${top.map((s) => `${s.name} (${s.level})`).join(", ")}`;
    }
  }

  return ctx;
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  usage: null,
  debugEnabled: false,
  debugLoaded: false,

  sendMessage: async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || get().loading) return;

    const userMsg: DisplayMessage = {
      id: makeId(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      loading: true,
      error: null,
    }));

    try {
      // Build API messages from history (last N)
      const allMsgs = [...get().messages];
      const recent = allMsgs.slice(-MAX_HISTORY);
      const apiMessages: ChatMessage[] = recent.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const systemContext = buildSystemPrompt();
      const response = await chatSendMessage(apiMessages, systemContext);

      const assistantMsg: DisplayMessage = {
        id: makeId(),
        role: "assistant",
        content: response.text,
        timestamp: new Date().toISOString(),
        inputTokens: response.input_tokens,
        outputTokens: response.output_tokens,
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        loading: false,
        usage: response.daily_usage,
      }));
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  clearChat: () => {
    set({ messages: [], error: null });
  },

  fetchUsage: async () => {
    try {
      const usage = await chatGetUsage();
      set({ usage });
    } catch {
      // silent
    }
  },

  fetchDebug: async () => {
    try {
      const enabled = await chatGetDebugEnabled();
      set({ debugEnabled: enabled, debugLoaded: true });
    } catch {
      set({ debugLoaded: true });
    }
  },

  setDebugEnabled: async (enabled: boolean) => {
    await apiSetDebug(enabled);
    set({ debugEnabled: enabled });
  },
}));

export { DAILY_TOKEN_LIMIT };
