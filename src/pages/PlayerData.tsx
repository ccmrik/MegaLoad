import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import {
  User,
  Skull,
  Hammer,
  Wrench,
  Swords,
  Shield,
  ChevronDown,
  Search,
  Eye,
  EyeOff,
  Crown,
  Heart,
  Zap,
  Flame,
  MapPin,
  Trophy,
  Package,
  Utensils,
  Loader2,
  AlertCircle,
  Sparkles,
  Cloud,
  CloudDownload,
} from "lucide-react";
import { cn } from "../lib/utils";
import { usePlayerDataStore } from "../stores/playerDataStore";
import {
  useValheimDataStore,
  BIOME_ORDER,
  TOTAL_TROPHIES,
} from "../stores/valheimDataStore";
import { useToastStore } from "../stores/toastStore";
import { Copy } from "lucide-react";
import {
  VALHEIM_ITEMS,
  itemMap,
  tokenMap,
  type ValheimItem,
} from "../data/valheim-items";
import type { InventoryItem, SkillData } from "../lib/tauri-api";
import { startPlayerDataWatcher, stopPlayerDataWatcher, syncPushPlayerData, syncPullPlayerData } from "../lib/tauri-api";
import { useSyncStore } from "../stores/syncStore";

// ── Guardian power display names ───────────────────────────
const GUARDIAN_NAMES: Record<string, string> = {
  GP_Eikthyr: "Eikthyr",
  GP_TheElder: "The Elder",
  GP_Bonemass: "Bonemass",
  GP_Moder: "Moder",
  GP_Yagluth: "Yagluth",
  GP_Queen: "The Queen",
  GP_Fader: "Fader",
};

/** The 7 Valheim boss trophies — used to derive bosses-defeated (save-file boss_kills is unreliable). */
const BOSS_TROPHY_IDS = new Set([
  "TrophyEikthyr",
  "TrophyTheElder",
  "TrophyBonemass",
  "TrophyDragonQueen",
  "TrophyGoblinKing",
  "TrophySeekerQueen",
  "TrophyFader",
]);
const TOTAL_BOSSES = BOSS_TROPHY_IDS.size;

// ── Equipment slot definitions ─────────────────────────────
const EQUIP_SLOTS = [
  { key: "helmet", label: "Head", types: ["Armor"], subcats: ["Helmet"] },
  { key: "chest", label: "Chest", types: ["Armor"], subcats: ["Chest"] },
  { key: "legs", label: "Legs", types: ["Armor"], subcats: ["Legs"] },
  { key: "cape", label: "Cape", types: ["Armor"], subcats: ["Cape", "Shoulder"] },
  { key: "utility", label: "Utility", types: ["Armor", "Tool"], subcats: ["Utility"] },
  { key: "weapon", label: "Weapon", types: ["Weapon"], subcats: [] },
  { key: "shield", label: "Shield", types: ["Armor"], subcats: ["Shield"] },
  { key: "ammo", label: "Ammo", types: ["Ammo"], subcats: [] },
];

// ── Skill icon colors ──────────────────────────────────────
const SKILL_COLORS: Record<string, string> = {
  Swords: "text-red-400",
  Knives: "text-rose-300",
  Clubs: "text-orange-400",
  Polearms: "text-amber-400",
  Spears: "text-yellow-400",
  Blocking: "text-blue-400",
  Axes: "text-emerald-400",
  Bows: "text-lime-400",
  "Elemental Magic": "text-cyan-400",
  "Blood Magic": "text-red-500",
  Unarmed: "text-zinc-300",
  Pickaxes: "text-stone-400",
  "Wood Cutting": "text-green-500",
  Crossbows: "text-violet-400",
  Jump: "text-sky-400",
  Sneak: "text-purple-400",
  Run: "text-teal-400",
  Swim: "text-blue-300",
  Fishing: "text-cyan-300",
  Ride: "text-amber-300",
};

// ── Item Lookup Helpers ────────────────────────────────────
function getItem(prefabId: string): ValheimItem | undefined {
  return itemMap.get(prefabId);
}

function getItemName(prefabId: string): string {
  return itemMap.get(prefabId)?.name ?? prefabId;
}

// ── Biome badge colors ─────────────────────────────────────
const BIOME_COLORS: Record<string, string> = {
  Meadows: "bg-lime-500/20 text-lime-400",
  "Black Forest": "bg-teal-500/20 text-teal-400",
  Swamp: "bg-green-600/20 text-green-400",
  Mountain: "bg-slate-400/20 text-slate-300",
  Plains: "bg-yellow-500/20 text-yellow-400",
  Ocean: "bg-blue-500/20 text-blue-400",
  Mistlands: "bg-purple-500/20 text-purple-400",
  Ashlands: "bg-red-500/20 text-red-400",
  "Deep North": "bg-cyan-500/20 text-cyan-300",
};

// ── Item Icon Component ────────────────────────────────────
function ItemIcon({ id, size = 32, className = "" }: { id: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Package className={cn("text-zinc-500", className)} style={{ width: size * 0.6, height: size * 0.6 }} />;
  return (
    <img
      src={`/icons/${id}.png`}
      alt=""
      width={size}
      height={size}
      className={cn("object-contain", className)}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

// ── Main Page ──────────────────────────────────────────────
export function PlayerData() {
  const navigate = useNavigate();
  const setSelectedItem = useValheimDataStore((s) => s.setSelectedItem);
  const setActiveBiome = useValheimDataStore((s) => s.setActiveBiome);
  const setReturnPath = useValheimDataStore((s) => s.setReturnPath);
  const addToast = useToastStore((s) => s.addToast);
  const {
    characters,
    selectedPath,
    character,
    loading,
    error,
    fetchCharacters,
    selectCharacter,
    refreshSelected,
  } = usePlayerDataStore();

  const goToItem = (prefabId: string) => {
    const item = itemMap.get(prefabId);
    if (item) {
      setReturnPath("/player-data");
      setSelectedItem(item);
      navigate("/valheim-data");
    }
  };

  const openBiome = (biome: string) => {
    setReturnPath("/player-data");
    setSelectedItem(null);
    setActiveBiome(biome);
    navigate("/valheim-data");
  };

  const copyItemName = (item: ValheimItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    navigator.clipboard.writeText(item.name).then(
      () => addToast({ type: "success", title: "Copied", message: item.name, duration: 1500 }),
      () => addToast({ type: "warning", title: "Copy failed", duration: 2000 })
    );
  };

  const [showDropdown, setShowDropdown] = useState(false);
  const [knowledgeTab, setKnowledgeTab] = useState<"discovered" | "undiscovered" | "all">("discovered");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeFilter, setKnowledgeFilter] = useState<string>("all");
  const [knowledgeTypeFilter, setKnowledgeTypeFilter] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const syncEnabled = useSyncStore((s) => s.enabled);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  // File watcher: live-update when .fch files change (game saves, cloud sync, etc.)
  useEffect(() => {
    startPlayerDataWatcher().catch((e) => console.warn("[MegaLoad]", e));

    const unlistenPromise = listen("player-data-changed", () => {
      refreshSelected();
    });

    return () => {
      stopPlayerDataWatcher().catch((e) => console.warn("[MegaLoad]", e));
      unlistenPromise.then((fn) => fn());
    };
  }, [refreshSelected]);

  // Auto-select first character
  useEffect(() => {
    if (characters.length > 0 && !selectedPath) {
      selectCharacter(characters[0].path);
    }
  }, [characters, selectedPath, selectCharacter]);

  const selectedName = characters.find((c) => c.path === selectedPath)?.name ?? "Select Character";

  // ── Knowledge data ─────────────────────────────────────
  const knowledgeData = useMemo(() => {
    if (!character) return { discovered: [], undiscovered: [], all: [] };

    // Build a set of known prefab IDs by resolving tokens to prefabs
    const knownPrefabs = new Set<string>();
    for (const token of [...character.known_materials, ...character.known_recipes]) {
      // Try direct prefab match first (trophies use prefab names)
      if (itemMap.has(token)) {
        knownPrefabs.add(token);
      } else {
        // Resolve $item_xxx / $piece_xxx token to prefab via tokenMap
        const item = tokenMap.get(token.toLowerCase());
        if (item) knownPrefabs.add(item.id);
      }
    }

    // Filter to items that are discoverable (not creatures)
    const discoverableItems = VALHEIM_ITEMS.filter(
      (i) => i.type !== "Creature"
    );

    const discovered = discoverableItems.filter((i) => knownPrefabs.has(i.id));
    const undiscovered = discoverableItems.filter((i) => !knownPrefabs.has(i.id));

    return { discovered, undiscovered, all: discoverableItems };
  }, [character]);

  const filteredKnowledge = useMemo(() => {
    const items =
      knowledgeTab === "discovered"
        ? knowledgeData.discovered
        : knowledgeTab === "undiscovered"
          ? knowledgeData.undiscovered
          : knowledgeData.all;
    let filtered = items;

    if (knowledgeFilter !== "all") {
      filtered = filtered.filter((i) => i.biomes.includes(knowledgeFilter));
    }

    if (knowledgeTypeFilter !== "all") {
      filtered = filtered.filter((i) => i.type === knowledgeTypeFilter);
    }

    if (knowledgeSearch) {
      const q = knowledgeSearch.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q) ||
          i.type.toLowerCase().includes(q) ||
          i.subcategory.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [knowledgeTab, knowledgeData, knowledgeSearch, knowledgeFilter, knowledgeTypeFilter]);

  const knownPrefabSet = useMemo(() => {
    if (!character) return new Set<string>();
    const set = new Set<string>();
    for (const token of [...character.known_materials, ...character.known_recipes]) {
      if (itemMap.has(token)) {
        set.add(token);
      } else {
        const item = tokenMap.get(token.toLowerCase());
        if (item) set.add(item.id);
      }
    }
    return set;
  }, [character]);

  // Trophy-derived boss count (save-file boss_kills is unreliable)
  const bossesDefeated = useMemo(() => {
    if (!character) return 0;
    return character.trophies.filter((t) => BOSS_TROPHY_IDS.has(t)).length;
  }, [character]);

  // ── Equipped items ─────────────────────────────────────
  const equippedItems = useMemo(() => {
    if (!character) return [];
    return character.inventory.filter((i) => i.equipped && i.name);
  }, [character]);

  const getEquippedForSlot = (slot: typeof EQUIP_SLOTS[number]): InventoryItem | undefined => {
    return equippedItems.find((inv) => {
      const item = getItem(inv.name);
      if (!item) return false;
      if (!slot.types.includes(item.type)) return false;
      if (slot.subcats.length > 0) {
        return slot.subcats.some((sc) =>
          item.subcategory.toLowerCase().includes(sc.toLowerCase())
        );
      }
      return true;
    });
  };

  // ── Inventory Grid ─────────────────────────────────────
  const inventoryGrid = useMemo(() => {
    if (!character) return [];
    // Build a 8-column grid from inventory items
    const items = character.inventory.filter((i) => i.name);
    // Find max row
    const maxRow = Math.max(0, ...items.map((i) => i.grid_y));
    const grid: (InventoryItem | null)[][] = [];
    for (let row = 0; row <= maxRow; row++) {
      const rowItems: (InventoryItem | null)[] = [];
      for (let col = 0; col < 8; col++) {
        const item = items.find((i) => i.grid_x === col && i.grid_y === row);
        rowItems.push(item ?? null);
      }
      grid.push(rowItems);
    }
    return grid;
  }, [character]);

  // ── Loading / Error States ─────────────────────────────
  if (loading && !character) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  if (error && !character) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-red-400">
        <AlertCircle className="w-6 h-6" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Sync toast */}
      {syncToast && (
        <div className="fixed top-14 right-6 z-50 px-4 py-2.5 rounded-lg bg-cyan-500/90 text-zinc-950 text-sm font-medium shadow-xl animate-in slide-in-from-top-2 duration-300">
          {syncToast}
        </div>
      )}

      {/* ── Header + Character Selector ─────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-norse font-bold text-4xl text-zinc-100 tracking-wide">Player Data</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Character stats, skills, inventory & knowledge
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Sync buttons */}
          {syncEnabled && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const count = await syncPushPlayerData();
                    setSyncToast(`Pushed ${count} character${count !== 1 ? "s" : ""} to cloud`);
                  } catch (e) {
                    setSyncToast(`Push failed: ${e}`);
                  } finally {
                    setSyncing(false);
                    setTimeout(() => setSyncToast(null), 3000);
                  }
                }}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
                title="Push character data to cloud"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                Push
              </button>
              <button
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const chars = await syncPullPlayerData();
                    setSyncToast(`Pulled ${chars.length} character${chars.length !== 1 ? "s" : ""} from cloud`);
                  } catch (e) {
                    setSyncToast(`Pull failed: ${e}`);
                  } finally {
                    setSyncing(false);
                    setTimeout(() => setSyncToast(null), 3000);
                  }
                }}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
                title="Pull character data from cloud"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
                Pull
              </button>
            </div>
          )}

          {/* Character Dropdown */}
          <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-3 px-4 py-2.5 glass rounded-xl hover:border-brand-500/30 transition-all min-w-[200px]"
          >
            <User className="w-4.5 h-4.5 text-brand-400" />
            <span className="font-medium text-zinc-200">{selectedName}</span>
            <ChevronDown className={cn("w-4 h-4 text-zinc-500 ml-auto transition-transform", showDropdown && "rotate-180")} />
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-2 w-72 glass rounded-xl border border-zinc-700/50 shadow-2xl z-50 overflow-hidden">
              {characters.map((c) => (
                <button
                  key={c.path}
                  onClick={() => {
                    selectCharacter(c.path);
                    setShowDropdown(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/60 transition-colors",
                    c.path === selectedPath && "bg-brand-500/10 border-l-2 border-brand-400"
                  )}
                >
                  <User className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-200 truncate">{c.name}</div>
                    <div className="text-xs text-zinc-500">
                      {(c.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {character && (
        <>
          {/* ── Stats Row ──────────────────────────────────── */}
          <div className="grid grid-cols-7 gap-3 stagger-children">
            <StatCard icon={Skull} label="Deaths" value={character.deaths} color="text-red-400" bg="bg-red-500/10" />
            <StatCard icon={Swords} label="Kills" value={character.kills.toLocaleString()} color="text-orange-400" bg="bg-orange-500/10" />
            <StatCard icon={Crown} label="Forsaken" value={bossesDefeated} outOf={TOTAL_BOSSES} color="text-purple-400" bg="bg-purple-500/10" />
            <StatCard icon={Wrench} label="Crafts" value={character.crafts.toLocaleString()} color="text-brand-400" bg="bg-brand-500/10" />
            <StatCard icon={Hammer} label="Builds" value={character.builds.toLocaleString()} color="text-blue-400" bg="bg-blue-500/10" />
            <StatCard icon={Trophy} label="Trophies" value={character.trophies.length} outOf={TOTAL_TROPHIES} color="text-yellow-400" bg="bg-yellow-500/10" />
            <StatCard icon={MapPin} label="Worlds" value={character.world_count} color="text-emerald-400" bg="bg-emerald-500/10" />
          </div>

          {/* ── Main 3-Column Layout ──────────────────────── */}
          <div className="grid grid-cols-12 gap-4">
            {/* LEFT: Portrait + Equipment Paper Doll */}
            <div className="col-span-3 space-y-3">
              <CharacterPortrait
                model={character.model}
                beard={character.beard}
                hair={character.hair}
                skinColor={character.skin_color}
                hairColor={character.hair_color}
                name={character.name}
              />
              <EquipmentPanel
                getEquippedForSlot={getEquippedForSlot}
                character={character}
                onItemClick={goToItem}
              />

              {/* Active Foods */}
              {character.active_foods.length > 0 && (
                <div className="glass rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Utensils className="w-3.5 h-3.5" /> Active Foods
                  </h3>
                  <div className="space-y-2">
                    {character.active_foods.map((food, i) => (
                      <div
                        key={i}
                        className={cn("flex items-center gap-2", itemMap.has(food.name) && "cursor-pointer hover:bg-zinc-800/40 rounded-lg px-1 -mx-1")}
                        onClick={() => goToItem(food.name)}
                      >
                        <ItemIcon id={food.name} size={24} />
                        <span className="text-sm text-zinc-300 truncate">{getItemName(food.name)}</span>
                        <div className="flex gap-2 ml-auto text-xs">
                          {food.health > 0 && <span className="text-red-400">♥{Math.round(food.health)}</span>}
                          {food.stamina > 0 && <span className="text-yellow-400">⚡{Math.round(food.stamina)}</span>}
                          {food.time > 0 && <span className="text-zinc-400">{Math.round(food.time)}s</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Known Biomes */}
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" /> Biomes Discovered
                  <span className="ml-auto text-[10px] text-zinc-600 font-normal normal-case">
                    {character.known_biomes.filter((b) => BIOME_ORDER.includes(b as any)).length} / {BIOME_ORDER.length}
                  </span>
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {character.known_biomes
                    .filter((b) => BIOME_ORDER.includes(b as any))
                    .map((biome) => (
                      <button
                        key={biome}
                        type="button"
                        onClick={() => openBiome(biome)}
                        title={`Filter Valheim Data to ${biome}`}
                        className={cn(
                          "px-2 py-0.5 rounded-md text-xs font-medium transition-all hover:brightness-125 cursor-pointer",
                          BIOME_COLORS[biome] ?? "bg-zinc-700/50 text-zinc-400"
                        )}
                      >
                        {biome}
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {/* CENTER: Inventory Grid */}
            <div className="col-span-5">
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Package className="w-3.5 h-3.5" /> Inventory
                  <span className="text-zinc-600 ml-auto font-normal normal-case">
                    {character.inventory.filter((i) => i.name).length} items
                  </span>
                </h3>
                <div className="space-y-0.5">
                  {inventoryGrid.map((row, rowIdx) => (
                    <div key={rowIdx} className="flex gap-0.5">
                      {row.map((item, colIdx) => (
                        <InventorySlot
                          key={`${rowIdx}-${colIdx}`}
                          item={item}
                          isHotbar={rowIdx === 0}
                          onItemClick={goToItem}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT: Skills */}
            <div className="col-span-4">
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" /> Skills
                </h3>
                <div className="space-y-2">
                  {character.skills
                    .filter((s) => s.level > 0)
                    .map((skill) => (
                      <SkillBar key={skill.id} skill={skill} />
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Knowledge / Discovery Panel ────────────────── */}
          <div className="glass rounded-xl p-5">
            {/* Title Row */}
            <h3 className="text-lg font-semibold text-zinc-200 flex items-center gap-2 mb-3">
              <Eye className="w-5 h-5 text-brand-400" /> Knowledge
            </h3>

            {/* Controls Row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                {/* Tab Toggle */}
                <div className="flex bg-zinc-800/60 rounded-lg p-0.5">
                  <button
                    onClick={() => setKnowledgeTab("discovered")}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      knowledgeTab === "discovered"
                        ? "bg-brand-500/20 text-brand-400"
                        : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    Discovered ({knowledgeData.discovered.length})
                  </button>
                  <button
                    onClick={() => setKnowledgeTab("undiscovered")}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      knowledgeTab === "undiscovered"
                        ? "bg-brand-500/20 text-brand-400"
                        : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    Undiscovered ({knowledgeData.undiscovered.length})
                  </button>
                  <button
                    onClick={() => setKnowledgeTab("all")}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      knowledgeTab === "all"
                        ? "bg-brand-500/20 text-brand-400"
                        : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    All ({knowledgeData.all.length})
                  </button>
                </div>

                {/* Discovery Progress */}
                <div className="flex items-center gap-2">
                  <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-400 rounded-full transition-all duration-500"
                      style={{
                        width: `${knowledgeData.all.length ? (knowledgeData.discovered.length / knowledgeData.all.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500">
                    {knowledgeData.all.length
                      ? Math.round((knowledgeData.discovered.length / knowledgeData.all.length) * 100)
                      : 0}
                    %
                  </span>
                </div>
              </div>

              {/* Search + Filter */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    value={knowledgeSearch}
                    onChange={(e) => setKnowledgeSearch(e.target.value)}
                    placeholder="Search items..."
                    className="w-48 pl-9 pr-3 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500/50"
                  />
                </div>

                <select
                  value={knowledgeFilter}
                  onChange={(e) => setKnowledgeFilter(e.target.value)}
                  className="px-3 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-brand-500/50"
                >
                  <option value="all">All Biomes</option>
                  {["Meadows", "Black Forest", "Swamp", "Mountain", "Plains", "Ocean", "Mistlands", "Ashlands", "Deep North"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                <select
                  value={knowledgeTypeFilter}
                  onChange={(e) => setKnowledgeTypeFilter(e.target.value)}
                  className="px-3 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-brand-500/50"
                >
                  <option value="all">All Types</option>
                  {["Material", "Weapon", "Armor", "Food", "Potion", "Tool", "Ammo", "BuildPiece", "WorldObject", "Misc"].map((t) => (
                    <option key={t} value={t}>{t === "BuildPiece" ? "Build Piece" : t === "WorldObject" ? "World Object" : t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Knowledge Item List */}
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur z-10">
                  <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                    <th className="py-2 px-2 w-10"></th>
                    <th className="py-2 px-2">Item</th>
                    <th className="py-2 px-2">Type</th>
                    <th className="py-2 px-2">Biome</th>
                    <th className="py-2 px-2">Source</th>
                    {knowledgeTab === "all" && <th className="py-2 px-2 w-16 text-center">Status</th>}
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKnowledge.slice(0, 200).map((item) => {
                    const isKnown = knownPrefabSet.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => goToItem(item.id)}
                        className={cn(
                          "border-t border-zinc-800/30 hover:bg-zinc-800/30 transition-colors cursor-pointer",
                          knowledgeTab === "all" && !isKnown && "opacity-50"
                        )}
                      >
                        <td className="py-1.5 px-2">
                          <ItemIcon id={item.id} size={28} />
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="text-sm text-zinc-200 font-medium">{item.name}</span>
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="text-xs text-zinc-400">{item.subcategory || item.type}</span>
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="flex flex-wrap gap-1">
                            {item.biomes.slice(0, 2).map((b) => (
                              <span
                                key={b}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-medium",
                                  BIOME_COLORS[b] ?? "bg-zinc-700/50 text-zinc-400"
                                )}
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-xs text-zinc-400">
                          {item.source.slice(0, 2).join(", ")}
                          {item.station && (
                            <span className="text-zinc-500"> • {item.station}</span>
                          )}
                        </td>
                        {knowledgeTab === "all" && (
                          <td className="py-1.5 px-2 text-center">
                            {isKnown ? (
                              <Eye className="w-4 h-4 text-brand-400 mx-auto" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-zinc-600 mx-auto" />
                            )}
                          </td>
                        )}
                        <td className="py-1.5 px-2">
                          <button
                            type="button"
                            onClick={(e) => copyItemName(item, e)}
                            title={`Copy "${item.name}"`}
                            className="p-1 rounded text-zinc-500 hover:text-brand-400 hover:bg-zinc-800/60 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredKnowledge.length > 200 && (
                <div className="text-center text-xs text-zinc-500 py-3">
                  Showing 200 of {filteredKnowledge.length} items — use search to narrow
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Character Portrait ─────────────────────────────────────
/**
 * Stylised Norse viking portrait. Valheim doesn't export character renders,
 * so we build an SVG bust from save-file features: model (0=male, 1=female),
 * skin_color / hair_color (0-1 RGB), hair/beard style names.
 *
 * Aims for a weathered Norse warrior look — leather armour shoulders, fur
 * trim, war paint stripes, strong brow + cheekbones. Not pretty, not cute.
 */
function CharacterPortrait({
  model,
  beard,
  hair,
  skinColor,
  hairColor,
  name,
}: {
  model: number;
  beard: string;
  hair: string;
  skinColor: [number, number, number];
  hairColor: [number, number, number];
  name: string;
}) {
  // Colour helpers — weather the base skin tone with shadow/highlight so it
  // reads as a real face rather than a flat fill.
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const toRgb = ([r, g, b]: [number, number, number], mul = 1) =>
    `rgb(${Math.round(clamp(r * mul) * 255)}, ${Math.round(clamp(g * mul) * 255)}, ${Math.round(clamp(b * mul) * 255)})`;
  const skin = toRgb(skinColor);
  const skinDark = toRgb(skinColor, 0.7);
  const skinDarker = toRgb(skinColor, 0.45);
  const hairRgb = toRgb(hairColor);
  const hairDark = toRgb(hairColor, 0.55);

  const isMale = model === 0;
  const hasBeard = isMale && beard && beard !== "No beard" && beard !== "BeardNone";
  const hairIdx = parseInt((hair.match(/\d+/)?.[0]) ?? "1", 10) || 1;
  const beardIdx = parseInt((beard.match(/\d+/)?.[0]) ?? "1", 10) || 1;

  const prettyHair = hair ? hair.replace(/Hair/, "Hair ") : "—";
  const prettyBeard = beard && hasBeard ? beard.replace(/Beard/, "Beard ") : "Clean-shaven";

  // Deterministic seed — picks war-paint colour per-character so the same
  // save always renders the same.
  const seed = (name.charCodeAt(0) + name.length) % 3;
  const paintColor = ["#7a1c1c", "#1c3a7a", "#1a1a1a"][seed];

  return (
    <div className="glass rounded-xl p-4 overflow-hidden relative">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <User className="w-3.5 h-3.5" /> Portrait
      </h3>
      <div className="flex flex-col items-center">
        <div className="relative w-36 h-36 rounded-full overflow-hidden ring-2 ring-brand-500/50 shadow-lg shadow-brand-500/20 bg-gradient-to-b from-zinc-900 to-black">
          <svg viewBox="0 0 120 120" className="w-full h-full">
            <defs>
              <radialGradient id="portrait-sky" cx="50%" cy="20%" r="85%">
                <stop offset="0%" stopColor="#2a3148" />
                <stop offset="60%" stopColor="#131a2c" />
                <stop offset="100%" stopColor="#050813" />
              </radialGradient>
              <linearGradient id="leather-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3d2a18" />
                <stop offset="100%" stopColor="#1a1008" />
              </linearGradient>
              <linearGradient id="fur-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6a553c" />
                <stop offset="100%" stopColor="#3a2d1e" />
              </linearGradient>
            </defs>

            {/* Moody sky background */}
            <rect width="120" height="120" fill="url(#portrait-sky)" />
            {/* Cold horizon band */}
            <rect x="0" y="85" width="120" height="35" fill="rgba(20,30,50,0.5)" />

            {/* ─── Leather + fur shoulders ─── */}
            <path
              d="M 0 120 L 0 105 C 8 98, 22 94, 35 92 L 48 88 Q 60 86, 72 88 L 85 92 C 98 94, 112 98, 120 105 L 120 120 Z"
              fill="url(#leather-grad)"
            />
            {/* Fur trim along the collar */}
            <path
              d="M 18 94 Q 30 84, 48 86 Q 60 82, 72 86 Q 90 84, 102 94 Q 90 90, 72 92 Q 60 88, 48 92 Q 30 90, 18 94 Z"
              fill="url(#fur-grad)"
              opacity="0.95"
            />
            {/* Fur texture flecks */}
            {[22, 30, 38, 48, 60, 72, 82, 90, 98].map((x, i) => (
              <circle key={i} cx={x} cy={89 + (i % 2) * 2} r="1.1" fill="#8b7355" opacity="0.7" />
            ))}

            {/* ─── Neck ─── */}
            <path d="M 52 76 L 52 88 L 68 88 L 68 76 Z" fill={skin} />
            <path d="M 52 86 L 52 88 L 68 88 L 68 86 Z" fill={skinDark} />

            {/* ─── Head — angular jaw, broader for male, softer for female ─── */}
            {isMale ? (
              <path
                d="M 38 50 C 38 34, 46 26, 60 26 C 74 26, 82 34, 82 50 L 81 62 Q 80 72, 72 78 L 60 82 L 48 78 Q 40 72, 39 62 Z"
                fill={skin}
              />
            ) : (
              <path
                d="M 40 50 C 40 34, 48 26, 60 26 C 72 26, 80 34, 80 50 L 79 62 Q 77 70, 70 76 L 60 80 L 50 76 Q 43 70, 41 62 Z"
                fill={skin}
              />
            )}

            {/* Cheekbone + jaw shading */}
            <path d="M 40 58 Q 42 70, 48 76 L 44 68 Q 41 63, 41 58 Z" fill={skinDark} opacity="0.5" />
            <path d="M 80 58 Q 78 70, 72 76 L 76 68 Q 79 63, 79 58 Z" fill={skinDark} opacity="0.5" />
            {/* Forehead / temple shadow */}
            <path d="M 40 50 Q 44 42, 52 40 L 52 46 Q 46 50, 42 54 Z" fill={skinDark} opacity="0.35" />
            <path d="M 80 50 Q 76 42, 68 40 L 68 46 Q 74 50, 78 54 Z" fill={skinDark} opacity="0.35" />

            {/* ─── War paint stripes across the eyes ─── */}
            <rect x="42" y="52" width="36" height="3" fill={paintColor} opacity="0.85" />
            <rect x="42" y="52" width="36" height="3" fill={paintColor} opacity="0.6" transform="translate(0,3)" />

            {/* ─── Strong brow ridge (over paint) ─── */}
            <path d="M 44 51 L 54 50 L 56 52 Z" fill={hairDark} />
            <path d="M 76 51 L 66 50 L 64 52 Z" fill={hairDark} />

            {/* ─── Eyes — narrow, piercing ─── */}
            <ellipse cx="51" cy="56" rx="2.2" ry="1.6" fill="#fff" opacity="0.85" />
            <ellipse cx="69" cy="56" rx="2.2" ry="1.6" fill="#fff" opacity="0.85" />
            <circle cx="51" cy="56" r="1.2" fill="#1a2030" />
            <circle cx="69" cy="56" r="1.2" fill="#1a2030" />
            <circle cx="51.3" cy="55.6" r="0.4" fill="#fff" />
            <circle cx="69.3" cy="55.6" r="0.4" fill="#fff" />

            {/* ─── Nose — angular bridge ─── */}
            <path d="M 60 56 L 57 66 L 60 68 L 63 66 Z" fill={skinDark} opacity="0.45" />
            <path d="M 60 56 L 59 64" stroke={skinDarker} strokeWidth="0.7" opacity="0.6" />

            {/* ─── Mouth (hidden by beard for males with beards) ─── */}
            {!hasBeard && (
              <>
                <path d="M 54 72 Q 60 74, 66 72" stroke={skinDarker} strokeWidth="1.3" fill="none" strokeLinecap="round" />
                <path d="M 54 72 Q 60 76, 66 72" stroke={skinDarker} strokeWidth="0.6" fill="none" opacity="0.4" />
              </>
            )}

            {/* ─── Scar across cheek (male only, for that seasoned-warrior look) ─── */}
            {isMale && (
              <path d="M 68 58 L 74 66" stroke={skinDarker} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
            )}

            {/* ─── Hair — style index drives shape ─── */}
            {(() => {
              if (hairIdx >= 7) {
                // Long — swept back, drapes past shoulders with visible braid strands
                return (
                  <>
                    {/* Base long flow */}
                    <path
                      d="M 36 46 C 34 26, 48 20, 60 20 C 72 20, 86 26, 84 46 L 90 100 L 86 105 L 82 70 Q 84 55, 80 48 C 72 44, 60 44, 48 48 Q 42 55, 40 70 L 34 105 L 30 100 Z"
                      fill={hairRgb}
                    />
                    {/* Braid strands */}
                    <path d="M 34 70 L 30 100" stroke={hairDark} strokeWidth="1" opacity="0.7" />
                    <path d="M 40 65 L 36 100" stroke={hairDark} strokeWidth="1" opacity="0.7" />
                    <path d="M 86 70 L 90 100" stroke={hairDark} strokeWidth="1" opacity="0.7" />
                    <path d="M 80 65 L 84 100" stroke={hairDark} strokeWidth="1" opacity="0.7" />
                    {/* Highlights */}
                    <path d="M 46 30 Q 60 26, 74 30" stroke={toRgb(hairColor, 1.25)} strokeWidth="1" fill="none" opacity="0.5" />
                  </>
                );
              } else if (hairIdx >= 4) {
                // Medium — falls to jaw, swept to one side
                return (
                  <>
                    <path
                      d="M 36 48 C 34 28, 48 22, 60 22 C 72 22, 86 28, 84 48 L 84 70 L 78 72 L 78 52 C 78 42, 72 38, 60 38 C 48 38, 42 42, 42 52 L 42 72 L 36 70 Z"
                      fill={hairRgb}
                    />
                    {/* Fringe strands across forehead */}
                    <path d="M 48 38 L 52 48" stroke={hairDark} strokeWidth="1" opacity="0.7" />
                    <path d="M 60 38 L 58 48" stroke={hairDark} strokeWidth="1" opacity="0.7" />
                    <path d="M 72 38 L 68 48" stroke={hairDark} strokeWidth="1" opacity="0.7" />
                  </>
                );
              } else {
                // Short — tight to the skull, shaved sides hint
                return (
                  <>
                    <path
                      d="M 40 50 C 38 32, 50 26, 60 26 C 70 26, 82 32, 80 50 C 78 46, 70 42, 60 42 C 50 42, 42 46, 40 50 Z"
                      fill={hairRgb}
                    />
                    {/* Faint shave lines on the sides */}
                    <path d="M 42 52 L 44 58" stroke={hairDark} strokeWidth="0.6" opacity="0.5" />
                    <path d="M 78 52 L 76 58" stroke={hairDark} strokeWidth="0.6" opacity="0.5" />
                  </>
                );
              }
            })()}

            {/* ─── Beard ─── */}
            {hasBeard && (() => {
              if (beardIdx >= 4) {
                // Long / forked — drapes down the chest
                return (
                  <>
                    <path
                      d="M 42 68 Q 46 82, 52 92 L 58 98 L 60 95 L 62 98 L 68 92 Q 74 82, 78 68 Q 70 76, 60 76 Q 50 76, 42 68 Z"
                      fill={hairRgb}
                    />
                    {/* Braid cord across beard */}
                    <path d="M 50 86 Q 60 89, 70 86" stroke={hairDark} strokeWidth="0.8" fill="none" />
                    <circle cx="60" cy="88" r="1.2" fill={hairDark} />
                    {/* Highlight down centre */}
                    <path d="M 60 78 L 60 96" stroke={toRgb(hairColor, 1.2)} strokeWidth="0.5" opacity="0.5" />
                  </>
                );
              } else {
                // Short / full stubble-to-medium
                return (
                  <>
                    <path
                      d="M 44 66 Q 46 78, 52 84 Q 56 88, 60 88 Q 64 88, 68 84 Q 74 78, 76 66 Q 70 72, 60 72 Q 50 72, 44 66 Z"
                      fill={hairRgb}
                    />
                    <path d="M 48 74 L 50 82" stroke={hairDark} strokeWidth="0.7" opacity="0.6" />
                    <path d="M 72 74 L 70 82" stroke={hairDark} strokeWidth="0.7" opacity="0.6" />
                  </>
                );
              }
            })()}

            {/* ─── Metal clasp / brooch at the throat ─── */}
            <circle cx="60" cy="88" r="2" fill="#c08a26" opacity="0.9" />
            <circle cx="60" cy="88" r="1" fill="#5f381d" />

            {/* ─── Subtle vignette ─── */}
            <rect width="120" height="120" fill="url(#portrait-sky)" opacity="0.15" />
          </svg>
        </div>
        <div className="mt-3 text-center">
          <div className="font-norse font-bold text-xl text-zinc-100 tracking-wide leading-none">
            {name}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            {isMale ? "Male" : "Female"} · {prettyHair} · {prettyBeard}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card Component ────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  outOf,
  color,
  bg,
}: {
  icon: typeof Skull;
  label: string;
  value: string | number;
  outOf?: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="glass rounded-xl p-4 hover:border-zinc-700/50 transition-all duration-300">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={cn("p-1.5 rounded-lg", bg)}>
          <Icon className={cn("w-4 h-4", color)} />
        </div>
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-xl font-bold", color)}>
        {value}
        {outOf != null && <span className="text-sm text-zinc-600 ml-1">/ {outOf}</span>}
      </p>
    </div>
  );
}

// ── Equipment Panel ────────────────────────────────────────
function EquipmentPanel({
  getEquippedForSlot,
  character,
  onItemClick,
}: {
  getEquippedForSlot: (slot: typeof EQUIP_SLOTS[number]) => InventoryItem | undefined;
  character: any;
  onItemClick: (prefabId: string) => void;
}) {
  const guardianName = GUARDIAN_NAMES[character.guardian_power] ?? character.guardian_power ?? "None";

  return (
    <div className="glass rounded-xl p-4">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Shield className="w-3.5 h-3.5" /> Equipment
      </h3>

      {/* Vital bars */}
      <div className="space-y-2 mb-4">
        <VitalBar label="HP" current={character.hp} max={character.max_hp} color="bg-red-500" icon={Heart} iconColor="text-red-400" />
        <VitalBar label="Stamina" current={character.stamina} max={character.stamina} color="bg-yellow-500" icon={Zap} iconColor="text-yellow-400" />
        {character.max_eitr > 0 && (
          <VitalBar label="Eitr" current={character.max_eitr} max={character.max_eitr} color="bg-cyan-500" icon={Flame} iconColor="text-cyan-400" />
        )}
      </div>

      {/* Guardian Power */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 mb-4">
        <Crown className="w-4 h-4 text-purple-400" />
        <span className="text-xs text-zinc-400">Forsaken Power</span>
        <span className="text-sm font-medium text-purple-300 ml-auto">{guardianName || "None"}</span>
      </div>

      {/* Equipment Slots */}
      <div className="grid grid-cols-2 gap-1.5">
        {EQUIP_SLOTS.map((slot) => {
          const inv = getEquippedForSlot(slot);
          const item = inv ? getItem(inv.name) : undefined;
          return (
            <div
              key={slot.key}
              onClick={() => inv && onItemClick(inv.name)}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors",
                inv
                  ? "border-brand-500/20 bg-brand-500/5 cursor-pointer hover:border-brand-500/40"
                  : "border-zinc-800/50 bg-zinc-900/40"
              )}
            >
              {inv ? (
                <ItemIcon id={inv.name} size={24} />
              ) : (
                <div className="w-6 h-6 rounded bg-zinc-800/60 flex items-center justify-center">
                  <div className="w-3 h-3 border border-zinc-700 rounded-sm" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-zinc-500 uppercase">{slot.label}</div>
                <div className="text-xs text-zinc-300 truncate">
                  {item ? item.name : "—"}
                </div>
              </div>
              {inv && inv.quality > 1 && (
                <span className="text-[10px] text-brand-400 font-medium">★{inv.quality}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vital Bar ──────────────────────────────────────────────
function VitalBar({
  label: _label,
  current,
  max,
  color,
  icon: Icon,
  iconColor,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
  icon: typeof Heart;
  iconColor: string;
}) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("w-3.5 h-3.5 shrink-0", iconColor)} />
      <div className="flex-1">
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-[11px] text-zinc-400 w-14 text-right shrink-0">
        {Math.round(current)}/{Math.round(max)}
      </span>
    </div>
  );
}

// ── Inventory Slot ─────────────────────────────────────────
function InventorySlot({ item, isHotbar, onItemClick }: { item: InventoryItem | null; isHotbar: boolean; onItemClick: (prefabId: string) => void }) {
  const valheimItem = item ? getItem(item.name) : undefined;

  return (
    <div
      onClick={() => item && onItemClick(item.name)}
      className={cn(
        "w-[52px] h-[52px] rounded-lg flex items-center justify-center relative group transition-colors",
        isHotbar
          ? "bg-zinc-800/80 border border-zinc-700/60"
          : "bg-zinc-900/60 border border-zinc-800/40",
        item?.equipped && "ring-1 ring-brand-400/50 bg-brand-500/5",
        item && "cursor-pointer hover:border-brand-500/30"
      )}
      title={
        item
          ? `${valheimItem?.name ?? item.name}${item.stack > 1 ? ` x${item.stack}` : ""}${item.quality > 1 ? ` ★${item.quality}` : ""}${item.equipped ? " [Equipped]" : ""}`
          : ""
      }
    >
      {item && (
        <>
          <ItemIcon id={item.name} size={36} />
          {item.stack > 1 && (
            <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-zinc-200 leading-none drop-shadow-md">
              {item.stack}
            </span>
          )}
          {item.quality > 1 && (
            <span className="absolute top-0 right-0.5 text-[9px] font-bold text-brand-400 leading-none">
              ★{item.quality}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ── Skill Bar ──────────────────────────────────────────────
function SkillBar({ skill }: { skill: SkillData }) {
  const pct = Math.min(100, skill.level);
  const color = SKILL_COLORS[skill.name] ?? "text-zinc-300";

  return (
    <div className="flex items-center gap-3">
      <span className={cn("text-sm font-medium w-28 truncate", color)}>{skill.name}</span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500/80 to-brand-400 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-bold text-zinc-300 w-10 text-right">{Math.floor(skill.level)}</span>
    </div>
  );
}
