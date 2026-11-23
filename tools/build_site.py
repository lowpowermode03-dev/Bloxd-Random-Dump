#!/usr/bin/env python3
"""
Bloxd Codex — static data builder.

Reads the archived Bloxd-Developer-Hub zip in the repository root and produces
the compact datasets, packed texture atlases and changelog copies used by the
website.

Usage:
    python3 tools/build_site.py

Outputs:
    data/entries.json        compact searchable registry (10,080 records)
    data/details/*.json      full records, sharded by id % 8
    data/mobs.json           mobs, variations and their texture tiles
    data/meta.json           snapshot, counts, changelog digests, atlas manifest
    data/changelogs/*.md     raw extracted changelogs
    media/atlas/*.png        packed pixel-art atlases
    media/tex/*.png          one-off textures with a unique canvas size

Requires Pillow (`pip install pillow`). The website itself has no dependencies.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ZIP_PATH = ROOT / "Bloxd-Developer-Hub 9.zip"
PREFIX = "Bloxd-Developer-Hub/"
DATA_DIR = ROOT / "data"
MEDIA_DIR = ROOT / "media"
ATLAS_DIR = MEDIA_DIR / "atlas"
TEX_DIR = MEDIA_DIR / "tex"
CHANGELOG_DIR = DATA_DIR / "changelogs"

SHEET_MAX = 2048
GUTTER = 2
DETAIL_SHARDS = 8

# Compact entry fields: registry key -> short key. Deliberately small because
# every record is shipped to the browser in a single request.
COMPACT_FIELDS = {
    "ttb": "ttb",
    "harvestLevel": "hl",
    "damage": "dmg",
    "secondaryDamage": "dmg2",
    "armourReduction": "ar",
    "eatHealAmt": "heal",
    "eatShieldAmt": "shield",
    "stackable": "st",
    "type": "ty",
    "multiplier": "mult",
    "harvests": "hv",
    "level": "lvl",
    "weight": "wt",
    "attackRange": "range",
    "clipSize": "clip",
    "reloadTime": "reload",
    "gunType": "gun",
}

HARVEST_LEVELS = {0: "None", 1: "Wood", 2: "Stone", 3: "Iron", 4: "Gold", 5: "Diamond+"}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def norm(text) -> str:
    """Lowercase and strip everything that is not alphanumeric."""
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "texture"


def write_json(path: Path, payload) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"), ensure_ascii=False)
    return path.stat().st_size


# ---------------------------------------------------------------------------
# atlas packing
# ---------------------------------------------------------------------------

class Atlas:
    """Packs textures into sheets.

    Every sheet holds one native canvas size, which keeps its cells uniform so
    the frontend can scale a whole sheet by a single factor without blurring.
    Identical images are deduplicated by pixel hash.
    """

    def __init__(self) -> None:
        self.images: dict[int, Image.Image] = {}
        self.tile_keys: dict[int, list[str]] = {}
        self.by_hash: dict[str, int] = {}
        self.tiles: dict[str, list] = {}
        self.sheets: list[dict] = []
        self.singletons: list[dict] = []

    def add(self, key: str, path: str, zf: zipfile.ZipFile) -> None:
        with zf.open(path) as fh:
            raw = fh.read()
        img = Image.open(io.BytesIO(raw))
        img.load()
        img = img.convert("RGBA")
        digest = hashlib.sha1(f"{img.width}x{img.height}:".encode() + img.tobytes()).hexdigest()
        tile_id = self.by_hash.get(digest)
        if tile_id is None:
            tile_id = len(self.images)
            self.images[tile_id] = img
            self.tile_keys[tile_id] = []
            self.by_hash[digest] = tile_id
        self.tile_keys[tile_id].append(key)

    def pack(self) -> None:
        ATLAS_DIR.mkdir(parents=True, exist_ok=True)
        TEX_DIR.mkdir(parents=True, exist_ok=True)
        by_size: dict[tuple[int, int], list[int]] = defaultdict(list)
        for tile_id, img in self.images.items():
            by_size[(img.width, img.height)].append(tile_id)

        for (w, h), ids in sorted(by_size.items(), key=lambda kv: (-len(kv[1]), kv[0])):
            ids.sort()
            if len(ids) == 1:
                tile_id = ids[0]
                filename = f"{slugify(self.tile_keys[tile_id][0])}.png"
                self.images[tile_id].save(TEX_DIR / filename, optimize=True)
                self.singletons.append({"file": f"media/tex/{filename}", "w": w, "h": h})
                for name in self.tile_keys[tile_id]:
                    self.tiles[name] = [-1, f"media/tex/{filename}", w, h]
                continue

            cell_w, cell_h = w + GUTTER, h + GUTTER
            cols = max(1, SHEET_MAX // cell_w)
            rows = (len(ids) + cols - 1) // cols
            # Keep sheets square-ish where it helps, but never above the limit.
            while rows * cell_h > SHEET_MAX and cols < len(ids):
                cols += 1
                rows = (len(ids) + cols - 1) // cols
            sheet_w, sheet_h = cols * cell_w, rows * cell_h
            sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
            for index, tile_id in enumerate(ids):
                sheet.paste(self.images[tile_id], ((index % cols) * cell_w, (index // cols) * cell_h))

            sheet_index = len(self.sheets)
            filename = f"atlas-{sheet_index:02d}.png"
            sheet.save(ATLAS_DIR / filename, optimize=True)
            self.sheets.append(
                {
                    "file": f"media/atlas/{filename}",
                    "w": sheet_w,
                    "h": sheet_h,
                    "tileW": w,
                    "tileH": h,
                    "cols": cols,
                    "count": len(ids),
                }
            )
            for index, tile_id in enumerate(ids):
                tile = [
                    sheet_index,
                    (index % cols) * cell_w,
                    (index // cols) * cell_h,
                    w,
                    h,
                ]
                for name in self.tile_keys[tile_id]:
                    self.tiles[name] = tile

    def tile(self, key: str):
        return self.tiles.get(key)


# ---------------------------------------------------------------------------
# changelog digest
# ---------------------------------------------------------------------------

def parse_counts(text: str) -> dict:
    counts = {}
    for label, value in re.findall(r"\|\s*(Added|Removed|ID changed)\s*\|\s*(\d+)\s*\|", text):
        counts[label] = int(value)
    return counts


def parse_changelog(text: str) -> list[dict]:
    """Split a changelog into update sections with headline numbers."""
    parts = re.split(r"\n(?=- Run at:)", text)
    sections = []
    for part in parts:
        run = re.search(r"- Run at:\s*(\S+)", part)
        bundle = re.search(r"- Bundle:\s*(\S+)", part)
        entries = re.search(r"- Entries:\s*(\d+)\s*->\s*(\d+)", part)
        if not run and not entries:
            continue
        sections.append(
            {
                "runAt": run.group(1) if run else None,
                "bundle": bundle.group(1) if bundle else None,
                "from": int(entries.group(1)) if entries else None,
                "to": int(entries.group(2)) if entries else None,
                "counts": parse_counts(part),
            }
        )
    return sections


def parse_additions(text: str, limit: int = 48) -> list[dict]:
    block = re.search(r"<summary>Added \((\d+)\)</summary>(.*?)</details>", text, re.S)
    if not block:
        return []
    additions = []
    for line in block.group(2).splitlines():
        match = re.match(
            r"-\s*(?:!\[[^\]]*\]\([^)]*\)\s*)?(.+?)\s*\((block|item)\):\s*\*\*(\d+)\*\*",
            line.strip(),
        )
        if match:
            additions.append(
                {"name": match.group(1), "kind": match.group(2), "id": int(match.group(3))}
            )
        if len(additions) >= limit:
            break
    return additions


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> None:
    if not ZIP_PATH.exists():
        raise SystemExit(f"archive not found: {ZIP_PATH}")

    for directory in (DATA_DIR, MEDIA_DIR):
        if directory.exists():
            shutil.rmtree(directory)

    with zipfile.ZipFile(ZIP_PATH) as zf:
        names = zf.namelist()
        catalog = json.loads(zf.read(PREFIX + "public/data/catalog.json"))
        mobs_raw = json.loads(zf.read(PREFIX + "public/data/mobs.json"))
        build_state = json.loads(zf.read(PREFIX + "public/data/build-state.json"))

        texture_paths = {
            n.split("/")[-1]: n
            for n in names
            if "/public/textures/" in n and n.lower().endswith(".png")
        }
        # Texture filenames are prefixed with the numeric id (`09314_Caught Mob
        # Cow Default.png`); strip it so mobs can be matched by their own names.
        texture_index: dict[str, tuple[str, str]] = {}
        for filename, path in texture_paths.items():
            stem = re.sub(r"^\d+_", "", os.path.splitext(filename)[0])
            texture_index.setdefault(norm(stem), (filename, path))

        atlas = Atlas()

        # --- entry textures -------------------------------------------------
        for entry in catalog:
            rel = entry.get("_texture")
            if not rel:
                continue
            filename = os.path.basename(rel)
            path = texture_paths.get(filename)
            if path:
                atlas.add(f"{entry['id']:05d}-{entry['name']}", path, zf)

        def find_texture(*candidates: str):
            for candidate in candidates:
                hit = texture_index.get(norm(candidate))
                if hit:
                    return hit
            return None

        # --- mobs: resolve caught / spawner / orb textures ------------------
        mob_records = []
        variation_total = 0
        for mob in mobs_raw.get("mobs", []):
            name = mob.get("name", "Unknown")
            variations = []
            for variation in mob.get("variations") or ["default"]:
                variation_total += 1
                found = find_texture(
                    f"Caught Mob {name} {variation}",
                    f"Caught Mob {name.replace(' ', '_')} {variation}",
                )
                key = f"mob-{name}-{variation}"
                if found:
                    atlas.add(key, found[1], zf)
                variations.append({"name": variation, "key": key if found else None})

            spawner = find_texture(f"{name} Spawner Block")
            orb = find_texture(f"{name} Spawn Orb")
            if spawner:
                atlas.add(f"spawner-{name}", spawner[1], zf)
            if orb:
                atlas.add(f"orb-{name}", orb[1], zf)
            mob_records.append(
                {
                    "name": name,
                    "slug": slugify(name),
                    "variations": variations,
                    "spawnerKey": f"spawner-{name}" if spawner else None,
                    "orbKey": f"orb-{name}" if orb else None,
                }
            )

        atlas.pack()

        # Resolve mob keys into atlas tiles now that packing is complete.
        for mob in mob_records:
            for variation in mob["variations"]:
                key = variation.pop("key")
                variation["tile"] = atlas.tile(key) if key else None
            mob["spawner"] = atlas.tile(mob.pop("spawnerKey")) if mob["spawnerKey"] else None
            mob["orb"] = atlas.tile(mob.pop("orbKey")) if mob["orbKey"] else None

        # --- entries --------------------------------------------------------
        entries = []
        details: dict[int, dict] = defaultdict(dict)
        variant_count = 0
        for entry in catalog:
            eid = int(entry["id"])
            name = entry.get("name") or f"Entry {eid}"
            kind = entry.get("kind", "block")
            is_variant = "|meta|" in name
            variant_count += int(is_variant)

            compact: dict = {"i": eid, "n": name, "k": "b" if kind == "block" else "i"}
            tile = atlas.tile(f"{eid:05d}-{name}")
            if tile:
                compact["t"] = tile

            for long_key, short_key in COMPACT_FIELDS.items():
                value = entry.get(long_key)
                if value is not None:
                    compact[short_key] = value

            harvest_type = entry.get("harvestType")
            if harvest_type:
                compact["ht"] = harvest_type

            cooldown = entry.get("attackCooldownMs")
            if cooldown is None:
                cooldown = entry.get("cadenceMs")
            if cooldown is not None:
                compact["ac"] = cooldown

            if entry.get("eatable"):
                compact["eat"] = True
            if is_variant:
                compact["var"] = True

            entries.append(compact)
            details[eid % DETAIL_SHARDS][str(eid)] = {
                k: v for k, v in entry.items() if k != "_texture"
            }

        entries.sort(key=lambda item: item["i"])
        size_entries = write_json(DATA_DIR / "entries.json", entries)

        detail_sizes = []
        for shard in range(DETAIL_SHARDS):
            payload = dict(sorted(details.get(shard, {}).items(), key=lambda kv: int(kv[0])))
            detail_sizes.append(write_json(DATA_DIR / f"details/{shard}.json", payload))

        size_mobs = write_json(
            DATA_DIR / "mobs.json",
            {
                "total": len(mob_records),
                "variations": variation_total,
                "mobs": mob_records,
            },
        )

        # --- changelogs -----------------------------------------------------
        CHANGELOG_DIR.mkdir(parents=True, exist_ok=True)
        changelogs = []
        updates: list[dict] = []
        latest: dict = {}
        latest_additions: list[dict] = []
        for name in sorted(n for n in names if "/public/changelogs/" in n and n.endswith(".md")):
            short = name.split("/")[-1]
            text = zf.read(name).decode("utf-8")
            (CHANGELOG_DIR / short).write_text(text, encoding="utf-8")
            changelogs.append(
                {
                    "file": f"data/changelogs/{short}",
                    "name": short,
                    "bytes": len(text.encode()),
                }
            )
            parsed = parse_changelog(text)
            if short == "entries-history.md":
                updates = parsed
            if short == "entries-changes.md" and parsed:
                latest = parsed[0]
                latest_additions = parse_additions(text)

        # --- snapshot metadata ----------------------------------------------
        environments = []
        for env_name, env in build_state.items():
            environments.append(
                {
                    "name": env_name,
                    "build": env.get("build"),
                    "buildName": env.get("build_name"),
                    "checkedAt": env.get("checked_at"),
                    "bundleSize": env.get("bundle_size"),
                    "bundleSha256": env.get("bundle_sha256"),
                    "cssSize": env.get("css_size"),
                }
            )

        meta = {
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": {
                "archive": ZIP_PATH.name,
                "registry": "Bloxd-Entries-Data snapshot",
                "monitor": "Bloxd-Build-Monitor snapshot",
            },
            "counts": {
                "entries": len(entries),
                "blocks": sum(1 for e in entries if e["k"] == "b"),
                "items": sum(1 for e in entries if e["k"] == "i"),
                "variants": variant_count,
                "textures": sum(1 for e in entries if e.get("t")),
                "mobs": len(mob_records),
                "variations": variation_total,
                "buildFiles": len(build_state.get("bloxd.io", {}).get("files", [])),
            },
            "snapshot": {
                "latestCheck": max(
                    (env["checkedAt"] for env in environments if env.get("checkedAt")),
                    default=None,
                ),
                "environments": environments,
            },
            "latestUpdate": latest,
            "updates": updates,
            "additions": latest_additions,
            "changelogs": changelogs,
            "atlases": atlas.sheets,
            "singletons": atlas.singletons,
            "harvestLevels": HARVEST_LEVELS,
            "data": {
                "entries": size_entries,
                "details": detail_sizes,
                "mobs": size_mobs,
                "total": size_entries + sum(detail_sizes) + size_mobs,
            },
        }
        write_json(DATA_DIR / "meta.json", meta)

    # --- report --------------------------------------------------------------
    def mb(value: int) -> str:
        return f"{value / 1_048_576:.2f} MB"

    print(f"entries      {len(entries):>6}  {mb(size_entries)}")
    print(f"details      {sum(detail_sizes):>6}  {mb(sum(detail_sizes))} across {DETAIL_SHARDS} shards")
    print(f"mobs         {len(mob_records):>6}  {mb(size_mobs)} ({variation_total} variations)")
    print(f"atlases      {len(atlas.sheets):>6} sheets, {len(atlas.singletons)} one-off textures")
    atlas_bytes = sum(p.stat().st_size for p in ATLAS_DIR.glob("*.png"))
    print(f"atlas bytes  {mb(atlas_bytes)}")
    print(f"total data   {mb(meta['data']['total'])}")


if __name__ == "__main__":
    main()
