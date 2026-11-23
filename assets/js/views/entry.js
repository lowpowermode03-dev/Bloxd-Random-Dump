import { loadEntries, loadMeta, loadDetail, data, family } from "../data.js";
import { texHTML, downloadTile } from "../texture.js";
import { esc, num, ms, label, formatValue, date, nameHTML } from "../util.js";

const GROUPS = [
  {
    title: "Mining",
    keys: ["ttb", "harvestType", "harvestLevel", "drops", "specialToolDrop", "specialToolBonusDrops", "onMinedAura"],
  },
  {
    title: "Tool",
    keys: ["harvests", "multiplier", "level", "weight", "specialToolDrop"],
  },
  {
    title: "Combat",
    keys: [
      "damage", "secondaryDamage", "attackCooldownMs", "cadenceMs", "attackRange",
      "knockbackHorizontalScalar", "knockbackVerticalScalar", "knockbackReduction",
      "gunType", "clipSize", "reloadTime", "msPerRound", "fireInterval", "bulletReloadTime",
      "shotPelletCount", "burstCount", "burstDelay", "requiresArrow", "maxKickback",
      "recoveryRate", "kickbackRate", "aimZoomFactor",
    ],
  },
  {
    title: "Armour",
    keys: ["armourReduction", "weight", "equipDelay"],
  },
  {
    title: "Food",
    keys: ["eatable", "eatHealAmt", "eatShieldAmt", "afterEatenItem"],
  },
  {
    title: "Registry",
    keys: ["id", "type", "stackable", "showInCreativeInven", "keepMetaInChest", "transTex", "twoDBlockItem"],
  },
  {
    title: "Model & texture",
    keys: [
      "textureInfo", "textureName", "texturePerSide", "atlasIdx", "model", "blockModel",
      "blockModelItem", "modelScale", "heldItemScale", "customModelInfo", "customPlanesInfo",
      "unlitStandaloneMesh", "solid", "canBePlacedOver", "attachedTop", "slabFullBlock",
      "soundType", "meshEntityBones", "heldItemGlb",
    ],
  },
];

const IDENTITY = new Set(["name", "kind", "displayName", "description", "note"]);

export async function render(root, ctx) {
  const id = Number(ctx.params[0]);
  const [entries, meta] = await Promise.all([loadEntries(), loadMeta()]);
  const compact = data.byId.get(id);

  if (!compact) {
    root.innerHTML = `
      <div class="container" style="padding:120px 0;text-align:center">
        <p class="kicker" style="justify-content:center">Missing entry</p>
        <h1 style="font-size:clamp(34px,6vw,60px);margin:16px 0 12px">ID ${num(id)} is not in the registry.</h1>
        <p class="muted" style="max-width:50ch;margin:0 auto 26px">The registry covers IDs 0–${num(meta.counts.entries - 1)}. Older or removed records may only appear in the changelog history.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a class="btn primary" href="#/codex">Search the codex</a>
          <a class="btn" href="#/archive">Read the changelog</a>
        </div>
      </div>`;
    return;
  }

  const record = (await loadDetail(id).catch(() => null)) ?? { ...compact };
  const description = record.description?.text ?? record.note ?? "";
  const kindLabel = compact.k === "b" ? "Block" : compact.ty || "Item";

  document.title = `${compact.n} — Bloxd Codex`;

  const index = entries.findIndex((candidate) => candidate.i === id);
  const previous = index > 0 ? entries[index - 1] : null;
  const next = index >= 0 && index < entries.length - 1 ? entries[index + 1] : null;
  const relatives = family(entries, compact, 12);

  const groups = buildGroups(record);
  const badges = [];
  badges.push(`<span class="chip lime">${esc(kindLabel)}</span>`);
  if (compact.ht) badges.push(`<span class="chip">${esc(compact.ht)}</span>`);
  if (compact.ttb != null) badges.push(`<span class="chip">${ms(compact.ttb)} to break</span>`);
  if (compact.dmg) badges.push(`<span class="chip amber">${num(compact.dmg)} damage</span>`);
  if (compact.ar != null) badges.push(`<span class="chip blue">${Math.round(compact.ar * 100)}% armour</span>`);
  if (compact.heal) badges.push(`<span class="chip mint">+${compact.heal} HP</span>`);
  if (compact.st) badges.push(`<span class="chip">Stackable</span>`);
  if (compact.var) badges.push(`<span class="chip amber">Meta variant</span>`);

  root.innerHTML = `
    <div class="container entry-page">
      <div class="breadcrumb">
        <a href="#/codex">Codex</a><span>/</span>
        <a href="#/codex?q=${encodeURIComponent(compact.n.split("|")[0])}">${esc(compact.n.split("|")[0])}</a><span>/</span>
        <b>#${compact.i}</b>
      </div>

      <div class="entry-hero">
        <div class="entry-art">${texHTML(compact.t, 172)}</div>
        <div class="entry-info">
          <p class="kicker">${esc(kindLabel)} · registry #${compact.i}</p>
          <h1 class="entry-title">${nameHTML(compact.n)}</h1>
          ${description ? `<p class="entry-desc">${esc(description)}</p>` : ""}
          <div class="entry-badges">${badges.join("")}</div>
          <div class="entry-actions">
            <button class="btn primary small" type="button" data-copy="${compact.i}" data-copy-toast="Registry ID ${compact.i} copied">Copy ID</button>
            <button class="btn small" type="button" data-copy="${location.origin}${location.pathname}#/entry/${compact.i}" data-copy-toast="Entry link copied">Copy link</button>
            ${compact.t ? `<button class="btn small" type="button" id="downloadTex">↓ Download texture</button>` : ""}
            <a class="btn small ghost" href="#/codex?q=${encodeURIComponent(compact.n.split("|")[0])}">Find similar →</a>
          </div>
        </div>
      </div>

      ${record.note ? `<div class="note" style="margin-bottom:14px"><span>ⓘ</span><div>${esc(record.note)}</div></div>` : ""}

      <div class="prop-grid">
        ${groups
          .map(
            (group) => `
          <section class="panel prop-card">
            <h3>${esc(group.title)} <span>${String(group.keys.length).padStart(2, "0")}</span></h3>
            <dl class="dl">
              ${group.keys.map((key) => `<dt>${esc(label(key))}</dt>${renderValue(key, record[key])}`).join("")}
            </dl>
          </section>`,
          )
          .join("")}
      </div>

      <details class="panel raw-panel">
        <summary>Raw registry record · JSON</summary>
        <pre>${esc(JSON.stringify(record, null, 2))}</pre>
      </details>

      <div class="entry-nav">
        ${previous ? `<a href="#/entry/${previous.i}">${texHTML(previous.t, 30)}<span><small>← Previous</small><b>${esc(previous.n)}</b></span></a>` : `<span></span>`}
        ${next ? `<a class="next" href="#/entry/${next.i}"><span><small>Next →</small><b>${esc(next.n)}</b></span>${texHTML(next.t, 30)}</a>` : `<span></span>`}
      </div>

      ${
        relatives.length
          ? `<section class="family">
              <p class="kicker">Same family</p>
              <h2>Related entries</h2>
              <div class="family-row">
                ${relatives
                  .map(
                    (relative) =>
                      `<a href="#/entry/${relative.i}">${texHTML(relative.t, 24)}${esc(relative.n)}</a>`,
                  )
                  .join("")}
              </div>
            </section>`
          : ""
      }

      <p class="dim mono" style="margin-top:36px;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase">
        Snapshot checked ${esc(date(meta.snapshot?.latestCheck))} · values are read from the extracted registry, not from live gameplay
      </p>
    </div>`;

  root.querySelector("#downloadTex")?.addEventListener("click", () => {
    downloadTile(compact.t, compact.n);
  });
}

function buildGroups(record) {
  const used = new Set(IDENTITY);
  const groups = [];
  for (const group of GROUPS) {
    const keys = group.keys.filter((key) => record[key] !== undefined && !used.has(key));
    if (!keys.length) continue;
    keys.forEach((key) => used.add(key));
    groups.push({ title: group.title, keys });
  }
  const leftovers = Object.keys(record).filter((key) => !used.has(key));
  if (leftovers.length) groups.push({ title: "Other properties", keys: leftovers });
  return groups;
}

function renderValue(key, value) {
  if (value === null || value === undefined) return `<dd class="no">—</dd>`;
  if (typeof value === "boolean") {
    return `<dd class="${value ? "ok" : "no"}">${value ? "Yes" : "No"}</dd>`;
  }
  if (typeof value === "number" || typeof value === "string") {
    return `<dd>${esc(formatValue(key, value))}</dd>`;
  }
  const json = JSON.stringify(value);
  const primitiveArray = Array.isArray(value) && value.every((item) => typeof item !== "object");
  if (primitiveArray && json.length <= 48) return `<dd><code>${esc(json)}</code></dd>`;
  const summary = Array.isArray(value)
    ? `${value.length} item${value.length === 1 ? "" : "s"}`
    : `${Object.keys(value).length} key${Object.keys(value).length === 1 ? "" : "s"}`;
  return `<dd class="wide"><details class="json-details"><summary>{ ${esc(summary)} }</summary><pre>${esc(JSON.stringify(value, null, 2))}</pre></details></dd>`;
}
