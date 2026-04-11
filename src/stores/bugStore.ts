import { create } from "zustand";
import {
  checkMegabugsAccess,
  getMegabugsIdentity,
  setMegabugsIdentity,
  fetchTickets,
  fetchTicketDetail,
  submitTicket,
  replyToTicket,
  updateTicketStatus,
  deleteTicket as apiDeleteTicket,
  type MegaBugsAccess,
  type UserIdentity,
  type TicketSummary,
  type Ticket,
  type ImageData,
} from "../lib/tauri-api";

// ── Unread tracking via localStorage ──────────────────────────────
const UNREAD_KEY = "megabugs_last_read";

function getLastReadMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(UNREAD_KEY) || "{}");
  } catch {
    return {};
  }
}

function setLastRead(ticketId: string) {
  const map = getLastReadMap();
  map[ticketId] = new Date().toISOString();
  localStorage.setItem(UNREAD_KEY, JSON.stringify(map));
}

export function hasUnread(ticket: TicketSummary): boolean {
  const map = getLastReadMap();
  const lastRead = map[ticket.id];
  if (!lastRead) return ticket.message_count > 1; // never opened = unread if replies exist
  return ticket.updated_at > lastRead;
}

// ── Cooldown ──────────────────────────────────────────────────────
const COOLDOWN_MS = 60_000;

interface BugState {
  access: MegaBugsAccess | null;
  identity: UserIdentity | null;
  tickets: TicketSummary[];
  activeTicket: Ticket | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  /** Whether the GitHub API appears unreachable */
  offline: boolean;
  /** Epoch ms of last successful submit — drives cooldown UI */
  lastSubmitTime: number;
  /** Open ticket count for notification badges (admin: all open, user: own unread) */
  notificationCount: number;

  checkAccess: (bepinexPath: string) => Promise<void>;
  loadIdentity: () => Promise<void>;
  saveIdentity: (displayName: string) => Promise<void>;
  loadTickets: () => Promise<void>;
  loadTicketDetail: (ticketId: string) => Promise<void>;
  submit: (
    ticketType: string,
    title: string,
    description: string,
    images: ImageData[],
    bepinexPath: string,
  ) => Promise<void>;
  reply: (ticketId: string, text: string, images: ImageData[]) => Promise<void>;
  setStatus: (ticketId: string, status: string, labels: string[]) => Promise<void>;
  deleteTicket: (ticketId: string) => Promise<void>;
  markTicketRead: (ticketId: string) => void;
  clearActiveTicket: () => void;
  clearError: () => void;
  /** Seconds remaining on cooldown (0 = ready) */
  cooldownRemaining: () => number;
  /** Start background polling for notification badges */
  startNotificationPolling: () => void;
  /** Stop background polling */
  stopNotificationPolling: () => void;
}

function isOfflineError(e: unknown): boolean {
  const msg = String(e).toLowerCase();
  return msg.includes("network") || msg.includes("dns") || msg.includes("connect") || msg.includes("unreachable") || msg.includes("timed out");
}

let _notifInterval: ReturnType<typeof setInterval> | null = null;

// Optimistic status overrides — persisted across re-fetches until CDN catches up
const _statusOverrides: Map<string, { status: string; labels: string[]; expiresAt: number }> = new Map();
const OVERRIDE_TTL_MS = 120_000; // 2 minutes — enough for GitHub CDN to propagate

function applyOverrides(tickets: TicketSummary[]): TicketSummary[] {
  const now = Date.now();
  // Clean expired overrides
  for (const [id, ov] of _statusOverrides) {
    if (now > ov.expiresAt) _statusOverrides.delete(id);
  }
  if (_statusOverrides.size === 0) return tickets;
  return tickets.map((t) => {
    const ov = _statusOverrides.get(t.id);
    return ov ? { ...t, status: ov.status, labels: ov.labels } : t;
  });
}

function computeNotificationCount(tickets: TicketSummary[]): number {
  // Count tickets with unread activity (works for both admin and user)
  return tickets.filter((t) => t.status === "open" && hasUnread(t)).length;
}

export const useBugStore = create<BugState>((set, get) => ({
  access: null,
  identity: null,
  tickets: [],
  activeTicket: null,
  loading: false,
  submitting: false,
  error: null,
  offline: false,
  lastSubmitTime: 0,
  notificationCount: 0,

  checkAccess: async (bepinexPath: string) => {
    try {
      const access = await checkMegabugsAccess(bepinexPath);
      set({ access });
    } catch (e) {
      set({ access: { enabled: false, is_admin: false } });
    }
  },

  loadIdentity: async () => {
    try {
      const identity = await getMegabugsIdentity();
      set({ identity });
    } catch {
      set({ identity: null });
    }
  },

  saveIdentity: async (displayName: string) => {
    try {
      const identity = await setMegabugsIdentity(displayName);
      set({ identity, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadTickets: async () => {
    const { identity, access } = get();
    if (!identity) return;
    set({ loading: true, error: null });
    try {
      const userId = access?.is_admin ? undefined : identity.user_id;
      const raw = await fetchTickets(userId);
      const tickets = applyOverrides(raw);
      set({ tickets, loading: false, offline: false, notificationCount: computeNotificationCount(tickets) });
    } catch (e) {
      const offline = isOfflineError(e);
      set({ error: offline ? "Unable to reach MegaBugs — check your internet connection." : String(e), loading: false, offline });
    }
  },

  loadTicketDetail: async (ticketId: string) => {
    set({ loading: true, error: null });
    try {
      const ticket = await fetchTicketDetail(ticketId);
      // Sync accurate status from ticket file back to the list
      // (ticket file is authoritative; index.json from CDN may be stale)
      const { tickets } = get();
      const updatedTickets = tickets.map((t) =>
        t.id === ticketId ? { ...t, status: ticket.status, updated_at: ticket.updated_at } : t
      );
      set({ activeTicket: ticket, tickets: updatedTickets, loading: false, offline: false, notificationCount: computeNotificationCount(updatedTickets) });
    } catch (e) {
      const offline = isOfflineError(e);
      set({ error: offline ? "Unable to reach MegaBugs — check your internet connection." : String(e), loading: false, offline });
    }
  },

  submit: async (
    ticketType: string,
    title: string,
    description: string,
    images: ImageData[],
    bepinexPath: string,
  ) => {
    const { identity, cooldownRemaining } = get();
    if (!identity) return;
    if (cooldownRemaining() > 0) {
      set({ error: `Please wait ${cooldownRemaining()}s before submitting another ticket.` });
      return;
    }
    set({ submitting: true, error: null });
    try {
      const summary = await submitTicket(
        ticketType,
        title,
        description,
        images,
        bepinexPath,
        identity.user_id,
        identity.display_name,
      );
      set((s) => ({
        tickets: [summary, ...s.tickets],
        submitting: false,
        offline: false,
        lastSubmitTime: Date.now(),
      }));
    } catch (e) {
      const offline = isOfflineError(e);
      set({ error: offline ? "Unable to reach MegaBugs — check your internet connection." : String(e), submitting: false, offline });
    }
  },

  reply: async (ticketId: string, text: string, images: ImageData[]) => {
    const { identity, access } = get();
    if (!identity) return;
    set({ submitting: true, error: null });
    try {
      await replyToTicket(
        ticketId,
        text,
        images,
        identity.user_id,
        identity.display_name,
        access?.is_admin ?? false,
      );
      const ticket = await fetchTicketDetail(ticketId);
      set({ activeTicket: ticket, submitting: false, offline: false });
    } catch (e) {
      const offline = isOfflineError(e);
      set({ error: offline ? "Unable to reach MegaBugs — check your internet connection." : String(e), submitting: false, offline });
    }
  },

  setStatus: async (ticketId: string, status: string, labels: string[]) => {
    set({ error: null });
    // Register optimistic override that persists through re-fetches (CDN may be stale)
    _statusOverrides.set(ticketId, { status, labels, expiresAt: Date.now() + OVERRIDE_TTL_MS });
    const { tickets } = get();
    const updatedTickets = applyOverrides(tickets);
    set({ tickets: updatedTickets, notificationCount: computeNotificationCount(updatedTickets) });
    try {
      await updateTicketStatus(ticketId, status, labels);
      const ticket = await fetchTicketDetail(ticketId);
      set({ activeTicket: ticket, offline: false });
    } catch (e) {
      // Revert optimistic override on failure
      _statusOverrides.delete(ticketId);
      const offline = isOfflineError(e);
      set({ error: offline ? "Unable to reach MegaBugs — check your internet connection." : String(e), offline });
      get().loadTickets();
    }
  },

  deleteTicket: async (ticketId: string) => {
    // Optimistic removal from UI
    set((s) => ({
      tickets: s.tickets.filter((t) => t.id !== ticketId),
      activeTicket: s.activeTicket?.id === ticketId ? null : s.activeTicket,
      error: null,
    }));
    try {
      await apiDeleteTicket(ticketId);
    } catch (e) {
      const offline = isOfflineError(e);
      set({ error: offline ? "Unable to reach MegaBugs — check your internet connection." : String(e), offline });
      // Re-fetch to restore state on failure
      get().loadTickets();
    }
  },

  markTicketRead: (ticketId: string) => {
    setLastRead(ticketId);
    // Recompute notification count after marking as read
    const { tickets } = get();
    set({ notificationCount: computeNotificationCount(tickets) });
  },

  clearActiveTicket: () => set({ activeTicket: null }),
  clearError: () => set({ error: null }),

  cooldownRemaining: () => {
    const elapsed = Date.now() - get().lastSubmitTime;
    return Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
  },

  startNotificationPolling: () => {
    if (_notifInterval) return;
    // Do an initial fetch
    get().loadTickets();
    // Poll every 60s for badge updates
    _notifInterval = setInterval(() => {
      const { identity } = get();
      if (identity) get().loadTickets();
    }, 60_000);
  },

  stopNotificationPolling: () => {
    if (_notifInterval) {
      clearInterval(_notifInterval);
      _notifInterval = null;
    }
  },
}));
