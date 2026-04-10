import { useEffect, useRef } from "react";
import { useAppUpdateStore } from "../stores/appUpdateStore";
import { useUpdateStore } from "../stores/updateStore";
import { useProfileStore } from "../stores/profileStore";
import { useToastStore } from "../stores/toastStore";
import { checkThunderstoreUpdates, updateThunderstoreMod } from "../lib/tauri-api";

/**
 * Starts live polling for both app and mod updates.
 * Fires toast notifications when new updates are detected.
 * Mount once in AppShell.
 */
export function useLiveUpdateChecks() {
  const { startLiveCheck: startAppPoll, stopLiveCheck: stopAppPoll } =
    useAppUpdateStore();
  const { startLiveCheck: startModPoll, stopLiveCheck: stopModPoll } =
    useUpdateStore();
  const profile = useProfileStore((s) => s.activeProfile());
  const addToast = useToastStore((s) => s.addToast);

  // Track what we've already notified about to avoid spam
  const notifiedAppVersion = useRef<string | null>(null);
  const prevModUpdateCount = useRef<number | null>(null);

  // --- App update polling ---
  useEffect(() => {
    startAppPoll();
    return () => stopAppPoll();
  }, [startAppPoll, stopAppPoll]);

  // --- Mod update polling (needs active profile) ---
  useEffect(() => {
    if (profile?.bepinex_path) {
      startModPoll(profile.bepinex_path);
    }
    return () => stopModPoll();
  }, [profile?.bepinex_path, startModPoll, stopModPoll]);

  // --- Toast: new app update detected ---
  const appStatus = useAppUpdateStore((s) => s.status);
  const newVersion = useAppUpdateStore((s) => s.newVersion);

  useEffect(() => {
    if (
      appStatus === "update-available" &&
      newVersion &&
      newVersion !== notifiedAppVersion.current
    ) {
      notifiedAppVersion.current = newVersion;
      addToast({
        type: "update",
        title: `MegaLoad v${newVersion} available`,
        message: "A new version is ready to install.",
        action: {
          label: "Update Now",
          onClick: () =>
            useAppUpdateStore.getState().installAndRelaunch(),
        },
        duration: 0, // sticky until dismissed or clicked
      });
    }
  }, [appStatus, newVersion, addToast]);

  // --- Thunderstore update check (once per profile activation) ---
  const tsChecked = useRef<string | null>(null);

  useEffect(() => {
    if (!profile?.bepinex_path || tsChecked.current === profile.bepinex_path) return;
    tsChecked.current = profile.bepinex_path;

    checkThunderstoreUpdates(profile.bepinex_path).then((updates) => {
      if (updates.length > 0) {
        const names = updates.map((u) => `${u.full_name.split("-").pop()} ${u.installed_version} → ${u.latest_version}`).join(", ");
        addToast({
          type: "update",
          title: `${updates.length} Thunderstore update${updates.length > 1 ? "s" : ""} available`,
          message: names,
          action: {
            label: "Update All",
            onClick: async () => {
              for (const u of updates) {
                try {
                  await updateThunderstoreMod(profile!.bepinex_path, u.full_name, u.download_url, u.latest_version, u.folder_name);
                } catch { /* skip failed */ }
              }
              addToast({ type: "success", title: "Thunderstore mods updated", message: `${updates.length} mod${updates.length > 1 ? "s" : ""} updated`, duration: 5000 });
            },
          },
          duration: 0, // sticky
        });
      }
    }).catch((e) => console.warn("[MegaLoad]", e));
  }, [profile?.bepinex_path, addToast]);

  // --- Toast: new mod updates detected ---
  const modResult = useUpdateStore((s) => s.updateResult);
  const startupCheckDone = useUpdateStore((s) => s.startupCheckDone);

  useEffect(() => {
    if (!modResult || !startupCheckDone) return;

    const available = modResult.mods.filter(
      (m) => m.status === "update-available"
    ).length;

    // Only toast if there are new updates we haven't notified about
    if (available > 0 && available !== prevModUpdateCount.current) {
      const names = modResult.mods
        .filter((m) => m.status === "update-available")
        .map((m) => m.latest_version ? `${m.name} v${m.latest_version}` : m.name)
        .join(", ");

      addToast({
        type: "update",
        title: `${available} mod update${available > 1 ? "s" : ""} available`,
        message: names,
        duration: 15000, // auto-dismiss after 15s
      });
    }

    prevModUpdateCount.current = available;
  }, [modResult, startupCheckDone, addToast]);
}
