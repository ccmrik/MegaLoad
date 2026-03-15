import { useEffect, useState } from "react";
import { useProfileStore } from "../stores/profileStore";
import {
  Plus,
  Trash2,
  Check,
  Pencil,
  Users,
  FolderOpen,
  Link,
  Loader2,
  Package,
  ExternalLink,
} from "lucide-react";
import { cn } from "../lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import {
  detectR2modmanProfiles,
  getStarterMods,
  installModUpdate,
  openFolder,
  type StarterMod,
} from "../lib/tauri-api";

export function Profiles() {
  const {
    profiles,
    activeProfileId,
    fetchProfiles,
    createProfile,
    createProfileLinked,
    deleteProfile,
    setActiveProfile,
    renameProfile,
  } = useProfileStore();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creating, setCreating] = useState(false);
  const [r2Profiles, setR2Profiles] = useState<[string, string][]>([]);
  const [linkingR2, setLinkingR2] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [starterMods, setStarterMods] = useState<StarterMod[]>([]);
  const [selectedStarters, setSelectedStarters] = useState<Set<string>>(new Set());
  const [installingMods, setInstallingMods] = useState(false);
  const [installProgress, setInstallProgress] = useState("");

  useEffect(() => {
    fetchProfiles();
    detectR2modmanProfiles()
      .then(setR2Profiles)
      .catch(() => {});
    getStarterMods()
      .then((mods) => {
        setStarterMods(mods);
        setSelectedStarters(new Set(mods.map((m) => m.name)));
      })
      .catch(() => {});
  }, [fetchProfiles]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const profile = await createProfile(newName.trim());
      setNewName("");

      // Install selected starter mods
      const selected = starterMods.filter((m) => selectedStarters.has(m.name));
      if (selected.length > 0) {
        setInstallingMods(true);
        for (const mod of selected) {
          setInstallProgress(`Installing ${mod.name}...`);
          try {
            await installModUpdate(
              profile.bepinex_path,
              mod.name,
              mod.download_url,
              mod.version
            );
          } catch (e) {
            console.error(`Failed to install ${mod.name}:`, e);
          }
        }
        setInstallProgress("");
        setInstallingMods(false);
        setToast(`Profile created with ${selected.length} mod${selected.length > 1 ? "s" : ""} installed!`);
      }
    } finally {
      setCreating(false);
    }
  };

  const toggleStarter = (name: string) => {
    setSelectedStarters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllStarters = () => {
    if (selectedStarters.size === starterMods.length) {
      setSelectedStarters(new Set());
    } else {
      setSelectedStarters(new Set(starterMods.map((m) => m.name)));
    }
  };

  const handleLinkFolder = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Select BepInEx folder" });
    if (!selected) return;
    const name = (selected as string).split("\\").filter(Boolean).pop() || "Linked Profile";
    try {
      await createProfileLinked(name, selected as string);
      setToast(`Linked profile "${name}"`);
    } catch (e) {
      setToast(`Failed: ${e}`);
    }
  };

  const handleLinkR2 = async (r2Name: string, r2Path: string) => {
    setLinkingR2(r2Name);
    try {
      const bepinexPath = r2Path + "\\BepInEx";
      await createProfileLinked(r2Name, bepinexPath);
      setToast(`Linked R2Modman profile "${r2Name}"`);
    } catch (e) {
      setToast(`Failed: ${e}`);
    } finally {
      setLinkingR2(null);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await renameProfile(id, editName.trim());
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteProfile(id);
  };

  // Check which R2 profiles are already linked
  const linkedR2Names = new Set(profiles.map((p) => p.name));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toast */}
      {toast && (
        <div className="fixed top-14 right-6 z-50 px-4 py-2.5 rounded-lg bg-brand-500/90 text-zinc-950 text-sm font-medium shadow-xl animate-in slide-in-from-top-2 duration-300">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Profiles</h1>
        <p className="text-zinc-500 mt-1">
          Manage separate mod configurations
        </p>
      </div>

      {/* Saved Profiles */}
      {profiles.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500">
            No profiles yet. Create one to get started!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfileId;
            const isEditing = editingId === profile.id;

            return (
              <div
                key={profile.id}
                className={cn(
                  "glass rounded-xl p-5 transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "border-brand-500/40 bg-brand-500/5 glow-brand"
                    : "border-zinc-800/50 hover:border-zinc-700/50"
                )}
                onClick={() => {
                  if (!isEditing) setActiveProfile(profile.id);
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        isActive ? "bg-brand-500/15" : "bg-zinc-800"
                      )}
                    >
                      <Users
                        className={cn(
                          "w-5 h-5",
                          isActive ? "text-brand-400" : "text-zinc-500"
                        )}
                      />
                    </div>
                    <div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(profile.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => handleRename(profile.id)}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-brand-500/50"
                        />
                      ) : (
                        <h3 className="font-semibold text-zinc-200">
                          {profile.name}
                        </h3>
                      )}
                      {isActive && (
                        <span className="text-[10px] font-semibold text-brand-400 uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openFolder(profile.bepinex_path);
                      }}
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Open folder"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(profile.id);
                        setEditName(profile.name);
                      }}
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(profile.id);
                      }}
                      className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <FolderOpen className="w-3 h-3" />
                  <span className="truncate">{profile.bepinex_path}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Link Options */}
      <div className="grid grid-cols-2 gap-4">
        {/* Create New Profile */}
        <div className="glass rounded-xl p-5 border border-zinc-800/50 col-span-2">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            <Plus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Create New Profile
          </h2>
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              placeholder="Profile name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              className="flex-1 px-4 py-2.5 rounded-lg glass border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25 transition-all"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating || installingMods}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 text-zinc-950 font-semibold text-sm hover:bg-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {creating || installingMods ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {installingMods ? installProgress : "Create"}
            </button>
          </div>

          {/* Starter Mods Selection */}
          {starterMods.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  Include starter mods
                </p>
                <button
                  onClick={toggleAllStarters}
                  className="text-[10px] text-zinc-500 hover:text-brand-400 transition-colors"
                >
                  {selectedStarters.size === starterMods.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {starterMods.map((mod) => {
                  const selected = selectedStarters.has(mod.name);
                  return (
                    <button
                      key={mod.name}
                      onClick={() => toggleStarter(mod.name)}
                      className={cn(
                        "flex items-start gap-2.5 p-3 rounded-lg text-left transition-all border",
                        selected
                          ? "bg-brand-500/10 border-brand-500/30 text-zinc-200"
                          : "bg-zinc-900/50 border-zinc-800/50 text-zinc-500 hover:border-zinc-700"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors",
                          selected
                            ? "bg-brand-500 border-brand-500"
                            : "border-zinc-600"
                        )}
                      >
                        {selected && <Check className="w-3 h-3 text-zinc-950" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{mod.name}</p>
                        {mod.description && (
                          <p className="text-[10px] text-zinc-500 line-clamp-2 mt-0.5 leading-tight">
                            {mod.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Link Existing BepInEx Folder */}
        <div className="glass rounded-xl p-5 border border-zinc-800/50">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            <Link className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Link Existing BepInEx
          </h2>
          <button
            onClick={handleLinkFolder}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg glass border border-dashed border-zinc-700 text-sm text-zinc-400 hover:border-brand-500/50 hover:text-brand-400 transition-all"
          >
            <FolderOpen className="w-4 h-4" />
            Browse for BepInEx folder...
          </button>
          <p className="text-[10px] text-zinc-600 mt-2">Point to an existing BepInEx folder to manage its mods directly.</p>
        </div>

        {/* R2Modman Quick Link */}
        {r2Profiles.length > 0 && (
          <div className="glass rounded-xl p-5 border border-zinc-800/50 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300">
              <Link className="w-4 h-4 inline mr-1.5 -mt-0.5 text-blue-400" />
              Quick Link R2Modman
            </h2>
            <p className="text-xs text-zinc-500">
              Link R2Modman profiles directly. No copying needed.
            </p>
            <div className="flex flex-wrap gap-2">
              {r2Profiles.map(([name, path]) => {
                const alreadyLinked = linkedR2Names.has(name);
                const isLinking = linkingR2 === name;
                return (
                  <button
                    key={path}
                    onClick={() => handleLinkR2(name, path)}
                    disabled={alreadyLinked || isLinking}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                      alreadyLinked
                        ? "bg-emerald-500/10 text-emerald-400 cursor-default"
                        : isLinking
                          ? "bg-zinc-800 text-zinc-500 cursor-wait"
                          : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                    )}
                  >
                    {alreadyLinked ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : isLinking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Link className="w-3.5 h-3.5" />
                    )}
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
