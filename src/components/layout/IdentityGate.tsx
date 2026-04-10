import { useState, useEffect, useCallback } from "react";
import { User, Loader2, AlertCircle, CheckCircle2, Link, Copy, Check } from "lucide-react";
import { useIdentityStore } from "../../stores/identityStore";

export function IdentityGate({ children }: { children: React.ReactNode }) {
  const { identity, loading, error, linkCode, loadIdentity, saveIdentity, linkAccount, checkAvailable, clearLinkCode, loadAdminStatus, loadBanStatus } =
    useIdentityStore();
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [mode, setMode] = useState<"new" | "link">("new");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const init = async () => {
      await loadIdentity();
      await loadAdminStatus();
      setInitialized(true);
    };
    init();
  }, [loadIdentity, loadAdminStatus]);

  // Load ban status once identity is known
  useEffect(() => {
    if (identity) {
      loadBanStatus();
    }
  }, [identity, loadBanStatus]);

  // Debounced availability check
  const checkName = useCallback(
    async (name: string) => {
      if (name.trim().length < 2) {
        setAvailable(null);
        return;
      }
      setChecking(true);
      try {
        const ok = await checkAvailable(name.trim());
        setAvailable(ok);
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    },
    [checkAvailable]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (nameInput.trim().length >= 2) {
        checkName(nameInput);
      } else {
        setAvailable(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [nameInput, checkName]);

  // Reset state when switching modes
  useEffect(() => {
    setNameInput("");
    setCodeInput("");
    setAvailable(null);
  }, [mode]);

  const handleSubmit = async () => {
    if (!nameInput.trim() || loading) return;

    if (mode === "link") {
      if (available !== false || !codeInput.trim()) return;
      try {
        await linkAccount(nameInput.trim(), codeInput.trim());
      } catch {
        // Error is set in the store
      }
    } else {
      if (available === false) return;
      try {
        await saveIdentity(nameInput.trim());
        // linkCode will be set in the store — the "link code reveal" screen will show
      } catch {
        // Error is set in the store
      }
    }
  };

  const handleCopyCode = async () => {
    if (!linkCode) return;
    await navigator.clipboard.writeText(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // In link mode: name found = good (available === false means it exists on server)
  const linkNameFound = mode === "link" && available === false;
  const linkNameNotFound = mode === "link" && available === true;

  // Can submit?
  const canSubmit = mode === "new"
    ? nameInput.trim() && !loading && available !== false && !checking
    : nameInput.trim() && !loading && linkNameFound && !checking && codeInput.trim().length >= 4;

  // Still loading initial state
  if (!initialized) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
      </div>
    );
  }

  // Identity set AND no link code to show — render children
  if (identity && !linkCode) {
    return <>{children}</>;
  }

  // Link code reveal screen — shown after new account creation
  if (identity && linkCode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
        <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 space-y-6 animate-in">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Account Created!</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Save this <strong className="text-zinc-200">link code</strong> — you'll need it to link MegaLoad on other devices to this account.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <div className="px-6 py-4 rounded-xl bg-zinc-900/80 border border-zinc-700/50">
              <span className="text-2xl font-mono font-bold tracking-widest text-brand-400">
                {linkCode}
              </span>
            </div>
            <button
              onClick={handleCopyCode}
              className="p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
            <p className="text-xs text-amber-400">
              This code is shown only once. You can regenerate it later from Settings, but only from a device already linked to this account.
            </p>
          </div>

          <button
            className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white text-sm font-bold transition-all duration-200 shadow-lg"
            onClick={() => clearLinkCode()}
          >
            I've saved it — Continue
          </button>
        </div>
      </div>
    );
  }

  // Identity setup / link modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 space-y-6 animate-in">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-brand-500/15 flex items-center justify-center mx-auto">
            {mode === "new" ? (
              <User className="w-8 h-8 text-brand-400" />
            ) : (
              <Link className="w-8 h-8 text-cyan-400" />
            )}
          </div>
          <h2 className="text-xl font-bold text-zinc-100">
            {mode === "new" ? "Welcome to MegaLoad" : "Link Existing Account"}
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {mode === "new"
              ? "Choose a display name to get started. This is your identity across MegaChat, MegaBugs, and all MegaLoad features."
              : "Enter your display name and link code from your other device."}
          </p>
        </div>

        <div className="space-y-3">
          {/* Display name input */}
          <div className="space-y-1">
            <div className="relative">
              <input
                className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 pr-10"
                placeholder={mode === "new" ? "Your display name" : "Your existing display name"}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && mode === "new" && canSubmit) handleSubmit();
                }}
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checking && <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />}
                {!checking && mode === "new" && available === true && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                {!checking && mode === "new" && available === false && (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
                {!checking && linkNameFound && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                {!checking && linkNameNotFound && (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
              </div>
            </div>
            {mode === "new" && available === false && (
              <p className="text-xs text-red-400">That name is already taken. Try another.</p>
            )}
            {linkNameFound && (
              <p className="text-xs text-emerald-400">Account found — enter your link code below.</p>
            )}
            {linkNameNotFound && (
              <p className="text-xs text-red-400">No account found with that name.</p>
            )}
          </div>

          {/* Link code input — only in link mode */}
          {mode === "link" && (
            <div className="space-y-1">
              <input
                className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 font-mono tracking-wider uppercase"
                placeholder="XXXX-XXXX"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                maxLength={9}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) handleSubmit();
                }}
              />
              <p className="text-xs text-zinc-500">
                Enter the link code shown when you created your account (or regenerated in Settings).
              </p>
            </div>
          )}

          {mode === "new" && (
            <p className="text-xs text-zinc-500">
              Letters, numbers, spaces, hyphens and underscores only. Max 50 characters.
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white text-sm font-bold transition-all duration-200 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {mode === "new" ? "Setting up..." : "Verifying..."}
            </span>
          ) : mode === "new" ? (
            "Get Started"
          ) : (
            "Link Device"
          )}
        </button>

        <div className="text-center">
          <button
            onClick={() => setMode(mode === "new" ? "link" : "new")}
            className="text-xs text-zinc-500 hover:text-brand-400 transition-colors"
          >
            {mode === "new"
              ? "I already have an account on another device"
              : "Create a new account instead"}
          </button>
        </div>
      </div>
    </div>
  );
}
