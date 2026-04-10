import { useEffect, useState, useCallback, useMemo } from "react";
import { useIdentityStore } from "../stores/identityStore";
import {
  adminListUsers,
  adminBanUser,
  adminUnbanUser,
  adminGetUserChatHistory,
  regenerateLinkCode,
  type AdminUserInfo,
  type ChatHistoryFile,
} from "../lib/tauri-api";
import { cn } from "../lib/utils";
import {
  Shield,
  Users,
  Loader2,
  Ban,
  MessageCircle,
  ArrowLeft,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Search,
  Crown,
  Activity,
  Zap,
  Bug,
  UserX,
  UserCheck,
  Key,
  Copy,
  Check,
  Eye,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type View = "dashboard" | "chat-history";

export function AdminPanel() {
  const isAdmin = useIdentityStore((s) => s.isAdmin);
  const identity = useIdentityStore((s) => s.identity);
  const [users, setUsers] = useState<AdminUserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [selectedUser, setSelectedUser] = useState<AdminUserInfo | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistoryFile | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; action: "ban" | "unban" } | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeCopied, setLinkCodeCopied] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminListUsers();
      list.sort((a, b) => {
        if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
        return b.last_active.localeCompare(a.last_active);
      });
      setUsers(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Stats
  const stats = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const activeRecently = users.filter((u) => {
      try { return now - new Date(u.last_active).getTime() < sevenDays; } catch { return false; }
    }).length;
    const banned = users.filter((u) => u.flags.includes("banned")).length;
    const totalTokens = users.reduce((sum, u) => sum + u.megachat_usage.total_tokens, 0);
    const totalRequests = users.reduce((sum, u) => sum + u.megachat_usage.total_requests, 0);
    const totalTickets = users.reduce((sum, u) => sum + u.megabugs_tickets, 0);
    return { total: users.length, activeRecently, banned, totalTokens, totalRequests, totalTickets };
  }, [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q) ||
        (u.flags.includes("banned") && "banned".includes(q))
    );
  }, [users, searchQuery]);

  const handleBan = async (userId: string) => {
    setActionLoading(userId);
    setConfirmAction(null);
    try {
      await adminBanUser(userId);
      await loadUsers();
      setToast("User banned");
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async (userId: string) => {
    setActionLoading(userId);
    setConfirmAction(null);
    try {
      await adminUnbanUser(userId);
      await loadUsers();
      setToast("User unbanned");
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewChat = async (user: AdminUserInfo) => {
    setSelectedUser(user);
    setChatHistory(null);
    setView("chat-history");
    try {
      const history = await adminGetUserChatHistory(user.user_id);
      setChatHistory(history);
    } catch {
      setChatHistory({ user_id: user.user_id, messages: [], last_updated: "" });
    }
  };

  const handleRegenLinkCode = async () => {
    try {
      const code = await regenerateLinkCode();
      setLinkCode(code);
      setToast("Link code regenerated");
    } catch (e) {
      setToast(`Failed: ${e}`);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-sm text-zinc-400">Authorised personnel only</p>
        </div>
      </div>
    );
  }

  // Chat history view
  if (view === "chat-history" && selectedUser) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Toast */}
        {toast && (
          <div className="fixed top-14 right-6 z-50 px-4 py-2.5 rounded-lg bg-amber-500/90 text-zinc-950 text-sm font-medium shadow-xl animate-in slide-in-from-top-2 duration-300">
            {toast}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("dashboard")}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            title="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-zinc-100">
              Chat History — <span className="text-amber-400">{selectedUser.display_name}</span>
            </h2>
            <p className="text-xs text-zinc-500">
              {chatHistory ? `${chatHistory.messages.length} messages` : "Loading..."}
            </p>
          </div>
        </div>

        <div className="glass rounded-xl border border-zinc-800/50 overflow-hidden">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-4 space-y-3">
            {!chatHistory && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              </div>
            )}
            {chatHistory && chatHistory.messages.length === 0 && (
              <p className="text-center text-sm text-zinc-500 py-12">
                No chat history found for this user.
              </p>
            )}
            {chatHistory?.messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg p-3 text-sm max-w-[85%]",
                  msg.role === "user"
                    ? "bg-brand-500/10 border border-brand-500/20 ml-auto"
                    : "bg-zinc-800/50 border border-zinc-700/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium text-zinc-500 uppercase">
                    {msg.role}
                  </span>
                  <span className="text-[10px] text-zinc-600">{msg.timestamp}</span>
                  {msg.input_tokens != null && (
                    <span className="text-[10px] text-zinc-600">
                      {msg.input_tokens}+{msg.output_tokens} tokens
                    </span>
                  )}
                </div>
                <p className="text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content.length > 2000
                    ? msg.content.slice(0, 2000) + "... (truncated)"
                    : msg.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Main dashboard
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toast */}
      {toast && (
        <div className="fixed top-14 right-6 z-50 px-4 py-2.5 rounded-lg bg-amber-500/90 text-zinc-950 text-sm font-medium shadow-xl animate-in slide-in-from-top-2 duration-300">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center">
            <Crown className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              Command Centre
            </h1>
            <p className="text-sm text-amber-400/70">
              Welcome back, <span className="text-amber-400 font-semibold">{identity?.display_name}</span>
            </p>
          </div>
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 glass border border-zinc-800/50 hover:border-amber-500/30 hover:text-amber-400 transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-6 gap-3">
        <StatCard icon={Users} label="Total Users" value={stats.total} color="text-amber-400" bg="from-amber-500/15 to-amber-600/5" border="border-amber-500/10" />
        <StatCard icon={Activity} label="Active (7d)" value={stats.activeRecently} color="text-emerald-400" bg="from-emerald-500/15 to-emerald-600/5" border="border-emerald-500/10" />
        <StatCard icon={UserX} label="Banned" value={stats.banned} color="text-red-400" bg="from-red-500/15 to-red-600/5" border="border-red-500/10" />
        <StatCard icon={Zap} label="Chat Tokens" value={formatNumber(stats.totalTokens)} color="text-cyan-400" bg="from-cyan-500/15 to-cyan-600/5" border="border-cyan-500/10" />
        <StatCard icon={MessageCircle} label="Chat Requests" value={formatNumber(stats.totalRequests)} color="text-purple-400" bg="from-purple-500/15 to-purple-600/5" border="border-purple-500/10" />
        <StatCard icon={Bug} label="Bug Tickets" value={stats.totalTickets} color="text-orange-400" bg="from-orange-500/15 to-orange-600/5" border="border-orange-500/10" />
      </div>

      {/* Admin Quick Actions */}
      <div className="glass rounded-xl p-5 border border-amber-500/10 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-300">Admin Tools</h2>
        </div>
        <div className="flex items-center gap-3">
          {!linkCode ? (
            <button
              onClick={handleRegenLinkCode}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              Regenerate My Link Code
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-bold tracking-wider text-amber-400 bg-zinc-900/80 border border-amber-500/20 rounded-lg px-4 py-2">
                {linkCode}
              </span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(linkCode);
                  setLinkCodeCopied(true);
                  setTimeout(() => setLinkCodeCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {linkCodeCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {linkCodeCopied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* User Management */}
      <div className="glass rounded-xl border border-zinc-800/50 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-300">User Management</h2>
            <span className="text-[10px] text-zinc-600 bg-zinc-800/50 rounded-full px-2 py-0.5">
              {filteredUsers.length} of {users.length}
            </span>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="bg-zinc-900/50 border border-zinc-700/50 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/30 w-52"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          </div>
        ) : (
          <div className="max-h-[calc(100vh-520px)] overflow-y-auto">
            {filteredUsers.map((user) => {
              const isBanned = user.flags.includes("banned");
              const isExpanded = expandedUser === user.user_id;
              const isConfirming = confirmAction?.userId === user.user_id;

              return (
                <div key={user.user_id} className="border-b border-zinc-800/30 last:border-0">
                  {/* User row */}
                  <div
                    className={cn(
                      "flex items-center gap-4 px-5 py-3 hover:bg-zinc-800/20 transition-colors cursor-pointer",
                      isExpanded && "bg-zinc-800/20"
                    )}
                    onClick={() => setExpandedUser(isExpanded ? null : user.user_id)}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                      user.is_admin
                        ? "bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20"
                        : isBanned
                        ? "bg-red-500/10 border border-red-500/20"
                        : "bg-zinc-800/50 border border-zinc-700/30"
                    )}>
                      {user.is_admin ? (
                        <Crown className="w-4 h-4 text-amber-400" />
                      ) : isBanned ? (
                        <Ban className="w-4 h-4 text-red-400" />
                      ) : (
                        <Users className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>

                    {/* Name + status */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-medium text-sm",
                          user.is_admin ? "text-amber-400" : isBanned ? "text-red-400 line-through" : "text-zinc-200"
                        )}>
                          {user.display_name}
                        </span>
                        {user.is_admin && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            Admin
                          </span>
                        )}
                        {isBanned && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/20">
                            Banned
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-600 font-mono truncate">{user.user_id}</p>
                    </div>

                    {/* Quick stats */}
                    <div className="flex items-center gap-6 text-xs text-zinc-500 shrink-0">
                      <div className="text-right">
                        <div className="text-zinc-400 tabular-nums">{user.megachat_usage.total_tokens.toLocaleString()}</div>
                        <div className="text-[10px]">tokens</div>
                      </div>
                      <div className="text-right">
                        <div className="text-zinc-400 tabular-nums">{user.megabugs_tickets}</div>
                        <div className="text-[10px]">tickets</div>
                      </div>
                      <div className="text-right w-20">
                        <div className="text-zinc-400">{formatDate(user.last_active)}</div>
                        <div className="text-[10px]">last active</div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-600" />
                      )}
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 bg-zinc-900/30 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <DetailItem label="Registered" value={formatDate(user.registered_at)} icon={Clock} />
                        <DetailItem label="Last Active" value={formatDate(user.last_active)} icon={Activity} />
                        <DetailItem label="Chat Requests" value={user.megachat_usage.total_requests.toLocaleString()} icon={MessageCircle} />
                        <DetailItem label="Status" value={user.is_admin ? "Administrator" : isBanned ? "Banned" : "Active"} icon={Shield} />
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/30">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleViewChat(user); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/50 text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Chat History
                        </button>

                        {!user.is_admin && !isConfirming && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmAction({ userId: user.user_id, action: isBanned ? "unban" : "ban" });
                            }}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                              isBanned
                                ? "bg-zinc-800/50 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                                : "bg-zinc-800/50 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                            )}
                          >
                            {isBanned ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                            {isBanned ? "Unban User" : "Ban User"}
                          </button>
                        )}

                        {isConfirming && (
                          <div className="flex items-center gap-2 animate-in fade-in duration-150" onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs text-zinc-500">
                              {confirmAction?.action === "ban" ? "Ban this user?" : "Unban this user?"}
                            </span>
                            <button
                              onClick={() =>
                                confirmAction?.action === "ban"
                                  ? handleBan(user.user_id)
                                  : handleUnban(user.user_id)
                              }
                              disabled={actionLoading === user.user_id}
                              className={cn(
                                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                confirmAction?.action === "ban"
                                  ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                                  : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                              )}
                            >
                              {actionLoading === user.user_id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmAction(null)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, bg, border }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div className={cn("rounded-xl p-4 bg-gradient-to-br border", bg, border)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn("text-xl font-bold tabular-nums", color)}>{value}</div>
    </div>
  );
}

function DetailItem({ label, value, icon: Icon }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
      <div>
        <div className="text-[10px] text-zinc-600 uppercase">{label}</div>
        <div className="text-xs text-zinc-300">{value}</div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
