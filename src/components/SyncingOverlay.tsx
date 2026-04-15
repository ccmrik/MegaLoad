import { Loader2, CloudUpload } from "lucide-react";
import { useSyncStore } from "../stores/syncStore";

/**
 * Shown on mod-related pages (Mods, Browse, ConfigEditor) while a profile sync
 * is in progress. Prevents concurrent edits to mod state while remote pull/push
 * is mid-flight. Other pages remain fully usable.
 */
export function SyncingOverlay() {
  const syncing = useSyncStore((s) => s.syncing);
  const syncProgress = useSyncStore((s) => s.syncProgress);

  if (!syncing) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm rounded-lg">
      <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-xl bg-zinc-900/80 border border-zinc-700/50 shadow-2xl">
        <div className="relative">
          <CloudUpload className="w-8 h-8 text-brand-400" />
          <Loader2 className="absolute -top-1 -right-1 w-4 h-4 text-brand-400 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-100">Cloud sync in progress</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {syncProgress ?? "Syncing profiles with cloud..."}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">
            Other tabs are available while this runs
          </p>
        </div>
      </div>
    </div>
  );
}
