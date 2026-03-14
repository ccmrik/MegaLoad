import { useEffect, useState } from "react";
import {
  detectValheimPath,
  detectR2modmanProfiles,
  importR2modmanProfile,
  ensureDoorstop,
  downloadBepinex,
  readAppLog,
  clearAppLog,
  getAppLogPath,
  openDataDir,
} from "../lib/tauri-api";
import { useProfileStore } from "../stores/profileStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAppUpdateStore } from "../stores/appUpdateStore";
import {
  FolderOpen,
  RefreshCw,
  Check,
  Download,
  Loader2,
  Info,
  Shield,
  AlertTriangle,
  ScrollText,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "../lib/utils";

export function Settings() {
  const { fetchProfiles } = useProfileStore();
  const { loggingEnabled, loaded: settingsLoaded, fetchSettings, setLoggingEnabled } = useSettingsStore();
  const { currentVersion } = useAppUpdateStore();
  const [valheimPath, setValheimPath] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [r2Profiles, setR2Profiles] = useState<[string, string][]>([]);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [doorstopOk, setDoorstopOk] = useState<boolean | null>(null);
  const [installingDoorstop, setInstallingDoorstop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [logPreview, setLogPreview] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchSettings();
    detectValheimPath()
      .then((p) => {
        setValheimPath(p);
        ensureDoorstop(p).then(setDoorstopOk).catch(() => setDoorstopOk(false));
      })
      .catch(() => {});
    // R2Modman detection — completely optional, silent failure
    detectR2modmanProfiles()
      .then(setR2Profiles)
      .catch(() => setR2Profiles([]));
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const path = await detectValheimPath();
      setValheimPath(path);
      // Check doorstop after detecting
      const ok = await ensureDoorstop(path);
      setDoorstopOk(ok);
    } catch {
      // Leave as is
    } finally {
      setDetecting(false);
    }
  };

  const handleSetupDoorstop = async () => {
    if (!valheimPath) return;
    setInstallingDoorstop(true);
    try {
      // First try to install from existing local sources
      let ok = await ensureDoorstop(valheimPath);
      if (!ok) {
        // No local doorstop source — download BepInEx from GitHub
        // (this installs doorstop to game dir as a side effect)
        setToast("Downloading BepInEx from GitHub...");
        // Use a temp profile path just for the doorstop extraction
        const tempPath = valheimPath + "\\BepInEx";
        await downloadBepinex(valheimPath, tempPath);
        ok = true;
      }
      setDoorstopOk(ok);
      if (ok) {
        setToast("Doorstop installed successfully!");
      }
    } catch (e) {
      setToast(`Failed: ${e}`);
    } finally {
      setInstallingDoorstop(false);
    }
  };

  const handleImport = async (name: string, path: string) => {
    setImporting(name);
    try {
      await importR2modmanProfile(name, path);
      setImported((prev) => new Set([...prev, name]));
      await fetchProfiles();
      setToast(`Imported "${name}" successfully!`);
    } catch (e) {
      setToast(`Failed to import: ${e}`);
    } finally {
      setImporting(null);
    }
  };

  const handleToggleLogging = async () => {
    await setLoggingEnabled(!loggingEnabled);
    setToast(loggingEnabled ? "Logging disabled" : "Logging enabled");
  };

  const handleDownloadLog = async () => {
    setDownloading(true);
    try {
      const content = await readAppLog(10000);
      if (!content) {
        setToast("Log file is empty");
        return;
      }
      const logPath = await getAppLogPath();
      const fileName = logPath.split("\\").pop() || "megaload.log";
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setToast("Log downloaded");
    } catch (e) {
      setToast(`Failed: ${e}`);
    } finally {
      setDownloading(false);
    }
  };

  const handlePreviewLog = async () => {
    try {
      const content = await readAppLog(50);
      setLogPreview(content || "(empty)");
    } catch {
      setLogPreview("(failed to read log)");
    }
  };

  const handleClearLog = async () => {
    await clearAppLog();
    setLogPreview(null);
    setToast("Log cleared");
  };

  return (
    <div className="space-y-8 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toast */}
      {toast && (
        <div className="fixed top-14 right-6 z-50 px-4 py-2.5 rounded-lg bg-brand-500/90 text-zinc-950 text-sm font-medium shadow-xl animate-in slide-in-from-top-2 duration-300">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Settings</h1>
        <p className="text-zinc-500 mt-1">Configure MegaLoad</p>
      </div>

      {/* Valheim Path */}
      <div className="glass rounded-xl p-5 border border-zinc-800/50 space-y-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-zinc-300">
            Valheim Installation
          </h2>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={valheimPath}
              onChange={(e) => setValheimPath(e.target.value)}
              placeholder="C:\Program Files (x86)\Steam\steamapps\common\Valheim"
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50 transition-all font-mono"
            />
          </div>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg glass border border-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <RefreshCw
              className={cn("w-4 h-4", detecting && "animate-spin")}
            />
            Auto-detect
          </button>
        </div>
        {valheimPath && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <Check className="w-3.5 h-3.5" />
            Valheim found
          </div>
        )}
      </div>

      {/* Doorstop / BepInEx Loader Status */}
      {valheimPath && (
        <div className="glass rounded-xl p-5 border border-zinc-800/50 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-zinc-300">
              BepInEx Loader (Doorstop)
            </h2>
          </div>
          {doorstopOk === true ? (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              Doorstop is installed — BepInEx can bootstrap when launching Valheim
            </div>
          ) : doorstopOk === false ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Doorstop not found — BepInEx cannot load mods without it
              </div>
              <button
                onClick={handleSetupDoorstop}
                disabled={installingDoorstop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/15 text-purple-400 text-xs font-medium hover:bg-purple-500/25 transition-colors disabled:opacity-50"
              >
                {installingDoorstop ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Shield className="w-3.5 h-3.5" />
                )}
                Install Doorstop
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Checking...</p>
          )}
        </div>
      )}

      {/* R2Modman Import — only shown when R2Modman is detected */}
      {r2Profiles.length > 0 && (
        <div className="glass rounded-xl p-5 border border-zinc-800/50 space-y-4">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-zinc-300">
              Import from R2Modman
            </h2>
          </div>
          <p className="text-xs text-zinc-500">
            We detected {r2Profiles.length} R2Modman profile
            {r2Profiles.length > 1 ? "s" : ""} on this machine. You can import them to MegaLoad — this is optional.
          </p>
          <div className="space-y-2">
            {r2Profiles.map(([name, path]) => {
              const isImported = imported.has(name);
              const isImporting = importing === name;

              return (
                <div
                  key={path}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/50 border border-zinc-800/30"
                >
                  <div className="flex items-center gap-3">
                    {isImported ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <FolderOpen className="w-4 h-4 text-zinc-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-zinc-300">
                        {name}
                      </p>
                      <p className="text-[10px] text-zinc-600 font-mono truncate max-w-sm">
                        {path}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleImport(name, path)}
                    disabled={isImported || isImporting}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      isImported
                        ? "bg-emerald-500/10 text-emerald-400 cursor-default"
                        : isImporting
                          ? "bg-zinc-800 text-zinc-500 cursor-wait"
                          : "bg-brand-500/10 text-brand-400 hover:bg-brand-500/20"
                    )}
                  >
                    {isImported ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Imported
                      </>
                    ) : isImporting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Import
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* App Logging */}
      <div className="glass rounded-xl p-5 border border-zinc-800/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-zinc-300">App Logging</h2>
          </div>
          {settingsLoaded && (
            <button onClick={handleToggleLogging} className="shrink-0">
              {loggingEnabled ? (
                <ToggleRight className="w-8 h-8 text-brand-400" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-zinc-600" />
              )}
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          {loggingEnabled
            ? "MegaLoad logs all operations (mods, updates, launches, config changes) to a local file."
            : "Enable to record all MegaLoad operations for debugging and troubleshooting."}
        </p>
        {loggingEnabled && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadLog}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Download Log
              </button>
              <button
                onClick={handlePreviewLog}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors"
              >
                <ScrollText className="w-3.5 h-3.5" />
                Preview
              </button>
              <button
                onClick={handleClearLog}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/50 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
            {logPreview !== null && (
              <div className="max-h-48 overflow-y-auto rounded-lg bg-zinc-950 border border-zinc-800/50 p-3">
                <pre className="text-[11px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">
                  {logPreview}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Location */}
      <div className="glass rounded-xl p-5 border border-zinc-800/50 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-300">Data Location</h2>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-zinc-500 font-mono">
            %APPDATA%\MegaLoad\
          </p>
          <button
            onClick={() => openDataDir()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            title="Open in Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Open
          </button>
        </div>
        <p className="text-xs text-zinc-600">
          Profiles, settings, and configuration data are stored here.
        </p>
      </div>

      {/* About */}
      <div className="glass rounded-xl p-5 border border-zinc-800/50">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">About</h2>
        <div className="space-y-2 text-sm text-zinc-500">
          <p>
            <span className="text-zinc-300 font-semibold">MegaLoad</span>{" "}
            <span className="text-brand-400">v{currentVersion}</span>
          </p>
          <p>A modern Valheim mod manager built with Tauri + React</p>
          <p className="text-xs text-zinc-600">
            Rust backend &middot; React frontend &middot; Tailwind CSS
          </p>
        </div>
      </div>
    </div>
  );
}
