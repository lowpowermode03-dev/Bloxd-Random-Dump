/* Data access + derived indexes for the codex. */

const BASE = new URL(".", document.baseURI).href;

export const data = {
  entries: null,
  byId: null,
  meta: null,
  mobs: null,
  details: new Map(),
  categoryCounts: null,
};

const promises = {};

async function fetchJSON(path) {
  const response = await fetch(new URL(path, BASE));
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return response.json();
}

export function loadEntries() {
  if (data.entries) return Promise.resolve(data.entries);
  promises.entries ??= fetchJSON("data/entries.json").then((list) => {
    data.entries = list;
    data.byId = new Map(list.map((entry) => [entry.i, entry]));
    for (const entry of list) entry._h = haystack(entry);
    return list;
  });
  return promises.entries;
}

export function loadMeta() {
  if (data.meta) return Promise.resolve(data.meta);
  promises.meta ??= fetchJSON("data/meta.json").then((meta) => {
    data.meta = meta;
    document.getElementById("snapBuild").textContent = snapshotName(meta);
    document.getElementById("footStamp").textContent = `Snapshot ${meta.snapshot?.latestCheck ? new Date(meta.snapshot.latestCheck).toISOString().slice(0, 10) : "—"} · ${new Intl.NumberFormat("en-US").format(meta.counts.entries)} entries`;
    return meta;
  });
  return promises.meta;
}

export function loadMobs() {
  if (data.mobs) return Promise.resolve(data.mobs);
  promises.mobs ??= fetchJSON("data/mobs.json").then((mobs) => {
    data.mobs = mobs;
    return mobs;
  });
  return promises.mobs;
}

export function snapshotName(meta) {
  const build = meta.snapshot?.environments?.find((env) => env.name === "bloxd.io")?.build;
  return build ? build : "snapshot";
}

export async function loadDetail(id) {
  const shard = id % 8;
  let bucket = data.details.get(shard);
  if (!bucket) {
    bucket = fetchJSON(`data/details/${shard}.json`).then((records) => {
      data.details.set(shard, records);
      return records;
    });
    data.details.set(shard, bucket);
  }
  if (bucket instanceof Promise) bucket = await bucket;
  return bucket[String(id)] ?? null;
}

export function atlas(index) {
  return data.meta?.atlases?.[index] ?? null;
}

/* ---------------------------------------------------------------- search */

function haystack(entry) {
  return [
    entry.n,
    entry.ty,
    entry.ht,
    entry.hv,
    entry.k === "b" ? "block" : "item",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function searchEntries(source, query) {
  const q = query.trim().toLowerCase();
  if (!q) return source;
  const tokens = q.split(/\s+/).filter(Boolean);
  const exactId = /^\d+$/.test(q) ? Number(q) : null;
  const scored = [];
  for (const entry of source) {
    if (exactId !== null && entry.i === exactId) {
      scored.push([0, entry]);
      continue;
    }
    let ok = true;
    for (const token of tokens) {
      if (!entry._h.includes(token)) { ok = false; break; }
    }
    if (!ok) continue;
    const name = entry.n.toLowerCase();
    let score = 4;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.split(/[\s|]/)[0] === tokens[0]) score = 2;
    else if (name.includes(q)) score = 3;
    scored.push([score, entry]);
  }
  if (!scored.length) return [];
  scored.sort((a, b) => a[0] - b[0] || a[1].i - b[1].i);
  return scored.map((pair) => pair[1]);
}

/* ------------------------------------------------------------ categories */

const MATERIAL = /\b(ore|ores|deposit|deposits|gem|gems|shard|shards|fragment|fragments|ingot|ingots|crystal|crystals|nugget|nuggets|raw)\b/i;

export const CATEGORIES = [
  {
    id: "all",
    label: "All entries",
    hint: "Everything in the registry",
    accent: "",
    test: () => true,
  },
  {
    id: "blocks",
    label: "Blocks",
    hint: "Placeable world blocks",
    accent: "lime",
    test: (entry) => entry.k === "b",
  },
  {
    id: "items",
    label: "Items",
    hint: "Anything held or carried",
    accent: "mint",
    test: (entry) => entry.k === "i",
  },
  {
    id: "ores",
    label: "Ores & materials",
    hint: "Ores, deposits and smithing stock",
    accent: "amber",
    test: (entry) => MATERIAL.test(entry.n),
  },
  {
    id: "tools",
    label: "Tools",
    hint: "Pickaxes, axes, spades, hoes, shears",
    accent: "blue",
    test: (entry) => entry.ty === "Tool",
  },
  {
    id: "weapons",
    label: "Weapons",
    hint: "Swords, axes, bows and firearms",
    accent: "pink",
    test: (entry) =>
      entry.dmg > 0 ||
      ["Gun", "FullAuto", "Chargeable"].includes(entry.ty),
  },
  {
    id: "armour",
    label: "Armour",
    hint: "Helmets, chestplates and boots",
    accent: "lime",
    test: (entry) => entry.ar != null,
  },
  {
    id: "food",
    label: "Food",
    hint: "Edibles, healing and shields",
    accent: "amber",
    test: (entry) => Boolean(entry.eat),
  },
  {
    id: "spawners",
    label: "Spawners",
    hint: "Mob spawning blocks",
    accent: "mint",
    test: (entry) => /spawner/i.test(entry.n),
  },
  {
    id: "building",
    label: "Building",
    hint: "Stackable, non-variant blocks",
    accent: "blue",
    test: (entry) => entry.k === "b" && !entry.var && entry.st && (entry.ht === "rock" || entry.ht === "wood"),
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

export function categoryCounts(entries) {
  if (data.categoryCounts) return data.categoryCounts;
  const counts = {};
  for (const category of CATEGORIES) {
    counts[category.id] = entries.reduce((total, entry) => total + (category.test(entry) ? 1 : 0), 0);
  }
  data.categoryCounts = counts;
  return counts;
}

export const HARVEST_LABELS = {
  rock: "Rock",
  wood: "Wood",
  granule: "Granule",
  cuttable: "Cuttable",
};

export const HARVEST_LEVEL_LABELS = {
  0: "Any",
  1: "Wood",
  2: "Stone",
  3: "Iron",
  4: "Gold",
  5: "Diamond+",
};

/* -------------------------------------------------------------- sorting */

export const SORTS = [
  ["id", "Sort: ID"],
  ["name", "Sort: Name"],
  ["break", "Sort: Break time"],
  ["damage", "Sort: Damage"],
  ["armour", "Sort: Armour"],
];

const nullsLast = (a, b, key) => {
  const av = a[key], bv = b[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return 0;
};

export function sortEntries(list, sort) {
  const copy = [...list];
  switch (sort) {
    case "name":
      copy.sort((a, b) => a.n.localeCompare(b.n));
      break;
    case "break":
      copy.sort((a, b) => nullsLast(a, b, "ttb") || (a.ttb ?? 0) - (b.ttb ?? 0));
      break;
    case "damage":
      copy.sort((a, b) => nullsLast(a, b, "dmg") || (b.dmg ?? 0) - (a.dmg ?? 0));
      break;
    case "armour":
      copy.sort((a, b) => nullsLast(a, b, "ar") || (b.ar ?? 0) - (a.ar ?? 0));
      break;
    default:
      copy.sort((a, b) => a.i - b.i);
  }
  return copy;
}

/* -------------------------------------------------------------- filters */

export function filterEntries(entries, filters) {
  const {
    kind = "all",
    category = "all",
    harvest = "all",
    level = "all",
    flags = {},
  } = filters;

  const predicate = CATEGORY_BY_ID.get(category)?.test ?? (() => true);

  return entries.filter((entry) => {
    if (kind !== "all" && entry.k !== kind) return false;
    if (category !== "all" && !predicate(entry)) return false;
    if (harvest !== "all" && entry.ht !== harvest) return false;
    if (level !== "all" && String(entry.hl ?? "") !== String(level)) return false;
    if (flags.hideVariants && entry.var) return false;
    if (flags.stackable && !entry.st) return false;
    if (flags.damage && !(entry.dmg > 0)) return false;
    if (flags.edible && !entry.eat) return false;
    if (flags.wearable && entry.ar == null) return false;
    if (flags.combat && !(entry.dmg > 0 || entry.ty === "Gun" || entry.ty === "FullAuto")) return false;
    return true;
  });
}

/* ------------------------------------------------------------- helpers */

export function toolEntries(entries) {
  return entries.filter((entry) => entry.hv && entry.mult != null);
}

export function weaponEntries(entries) {
  return entries
    .filter((entry) => entry.dmg > 0)
    .sort((a, b) => (b.dmg ?? 0) - (a.dmg ?? 0));
}

export function armourEntries(entries) {
  return entries
    .filter((entry) => entry.ar != null)
    .sort((a, b) => (b.ar ?? 0) - (a.ar ?? 0));
}

export function findByName(entries, name) {
  return entries.find((entry) => entry.n.toLowerCase() === name.toLowerCase());
}

export function family(entries, entry, limit = 12) {
  const stem = entry.n.split("|")[0].split(" ").slice(0, -1).join(" ").trim();
  if (!stem) return [];
  return entries
    .filter((candidate) =>
      candidate.i !== entry.i &&
      candidate.n.startsWith(stem) &&
      Math.abs(candidate.i - entry.i) < 4000)
    .slice(0, limit);
}
