const fs = require("fs");
const path = require("path");

const c = fs.readFileSync(path.join(__dirname, "..", "src", "data", "valheim-items.ts"), "utf8");

// Parse JSON entries from the TS file
const arrayStart = c.indexOf("[\n");
const arrayEnd = c.lastIndexOf("]");
const jsonStr = c.slice(arrayStart, arrayEnd + 1);
const items = JSON.parse(jsonStr);

console.log("=== CHITIN / ABYSSAL / OCEAN items ===");
for (const i of items) {
  const t = (i.id + " " + i.name + " " + i.description).toLowerCase();
  if (t.includes("chitin") || t.includes("abyssal") || t.includes("leviathan") || t.includes("kraken")) {
    console.log(`  ${i.id} | ${i.name} | biomes: [${i.biomes.join(", ")}] | type: ${i.type}`);
  }
}

console.log("\n=== Items tagged Ocean ===");
for (const i of items) {
  if (i.biomes.includes("Ocean")) {
    console.log(`  ${i.id} | ${i.name} | type: ${i.type}`);
  }
}

console.log("\n=== Items with EMPTY biomes (non-Material, non-BuildPiece, non-Misc) ===");
const important = items.filter(i =>
  i.biomes.length === 0 &&
  !["BuildPiece", "Misc"].includes(i.type)
);
for (const i of important) {
  console.log(`  ${i.id} | ${i.name} | type: ${i.type} | sub: ${i.subcategory} | station: ${i.station}`);
}

console.log("\n=== KEY ITEMS CHECK ===");
const keyItems = ["Chitin", "SpearChitin", "KnifeChitin", "TrinketChitinSwim", "BoneFragments", "FreezeGland", "Honey", "Raspberry", "Amber", "ElderBark"];
for (const id of keyItems) {
  const item = items.find(i => i.id === id);
  if (item) {
    console.log(`  ${item.id} | ${item.name} | biomes: [${item.biomes.join(", ")}]`);
  } else {
    console.log(`  ${id} | NOT FOUND`);
  }
}
