import { loadEntries, loadMeta, findByName } from "../data.js";
import { texHTML } from "../texture.js";
import { mountCombo } from "../combo.js";
import { esc, num, ms } from "../util.js";

const DEFAULT_WEAPON = "Diamond Sword";
const DEFAULT_BLOCK = "Iron Ore";
const DEFAULT_TOOL = "Iron Pickaxe";
const DEFAULT_INTERVAL = 500;

export async function render(root) {
  const [entries, meta] = await Promise.all([loadEntries(), loadMeta()]);

  const blocks = entries.filter((entry) => entry.k === "b" && entry.ttb != null && entry.ttb < 1e9 && entry.ht);
  const tools = entries.filter((entry) => entry.hv && entry.mult != null);
  const weapons = entries.filter((entry) => (entry.dmg ?? 0) > 0).sort((a, b) => b.dmg - a.dmg);

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <div class="head-row">
          <div>
            <p class="kicker">Do the math</p>
            <h1>Lab</h1>
            <p>Two calculators that read the registry directly: break times from <code style="font-family:var(--mono);font-size:13px;color:var(--mint)">ttb × multiplier</code>, knockout times from damage and armour reduction. Every assumption is printed next to the result.</p>
          </div>
          <div class="head-stats">
            <div class="head-stat"><b>${num(blocks.length)}</b><small>Breakable blocks</small></div>
            <div class="head-stat"><b>${num(tools.length)}</b><small>Tools</small></div>
            <div class="head-stat"><b>${num(weapons.length)}</b><small>Weapons</small></div>
          </div>
        </div>
      </div>

      <div class="lab">
        <section class="panel lab-card">
          <p class="kicker">Calculator 01</p>
          <h2>Break time</h2>
          <p>Pick a block and a tool. The result is the block's registry time-to-break divided by the tool's multiplier, gated by harvest class and tool level.</p>
          <div class="calc-form">
            <div class="calc-field"><label>Block</label><div id="blockCombo"></div></div>
            <div class="calc-field"><label>Tool</label><div id="toolCombo"></div></div>
          </div>
          <div id="breakResult"></div>
          <div class="bars-title" id="breakBarsTitle">Every tool for this block</div>
          <div class="bars" id="breakBars"></div>
          <p class="formula" id="breakFormula"></p>
        </section>

        <section class="panel lab-card">
          <p class="kicker">Calculator 02</p>
          <h2>Time to knock out</h2>
          <p>Weapon damage, target health and a damage-reduction slider. Hits are rounded up; the clock starts on the first hit.</p>
          <div class="calc-form">
            <div class="calc-field"><label>Weapon</label><div id="weaponCombo"></div></div>
            <div class="calc-field"><label>Target health</label><input class="number-input" id="targetHp" type="number" min="1" max="10000" step="1" value="100"></div>
            <div class="calc-field" style="grid-column:1/-1">
              <label>Target armour reduction <output id="redValue" class="mono" style="color:var(--text)">40%</output></label>
              <div class="slider-row"><input id="reduction" type="range" min="0" max="80" step="1" value="40" aria-label="Target armour reduction"></div>
              <div class="hero-chips" style="margin-top:6px">
                <span>Presets</span>
                <button type="button" data-red="0">None</button>
                <button type="button" data-red="35">Wood set</button>
                <button type="button" data-red="48">Iron set</button>
                <button type="button" data-red="66">Diamond set</button>
                <button type="button" data-red="75">Nova set</button>
              </div>
            </div>
          </div>
          <div id="damageResult"></div>
          <div class="bars-title">Fastest weapons at this reduction</div>
          <div class="bars" id="damageBars"></div>
          <p class="formula" id="damageFormula"></p>
        </section>

        <section class="panel lab-card" style="grid-column:1/-1">
          <div class="idfind">
            <div>
              <p class="kicker">Calculator 03</p>
              <h2>ID finder</h2>
              <p>Jump straight to any numeric registry ID between 0 and ${num(meta.counts.entries - 1)}.</p>
              <div class="field" style="margin-top:16px;max-width:280px">
                <span class="mono dim" style="font-size:12px">#</span>
                <input id="idInput" type="number" min="0" max="${meta.counts.entries - 1}" placeholder="e.g. 8549" aria-label="Registry ID">
              </div>
            </div>
            <button class="btn primary" id="idGo" type="button">Open entry</button>
          </div>
          <div id="idResult" style="margin-top:14px"></div>
        </section>
      </div>
    </div>`;

  /* ------------------------------------------------------- break time */
  let block = findByName(entries, DEFAULT_BLOCK) ?? blocks[0];
  let tool = findByName(entries, DEFAULT_TOOL) ?? tools.find((candidate) => candidate.hv === block.ht) ?? tools[0];

  const blockCombo = mountCombo(root.querySelector("#blockCombo"), {
    items: blocks,
    getLabel: (entry) => entry.n,
    getMeta: (entry) => `#${entry.i} · ${entry.ht}`,
    placeholder: "Search blocks…",
    initial: block,
    onSelect: (value) => {
      if (!value) return;
      block = value;
      paintBreak();
    },
  });

  const toolCombo = mountCombo(root.querySelector("#toolCombo"), {
    items: tools,
    getLabel: (entry) => entry.n,
    getMeta: (entry) => `#${entry.i} · ×${entry.mult}`,
    placeholder: "Search tools…",
    initial: tool,
    onSelect: (value) => {
      if (!value) return;
      tool = value;
      paintBreak();
    },
  });

  function status(blockEntry, toolEntry) {
    if (!toolEntry) return { time: blockEntry.ttb, reason: null, hand: true };
    if (toolEntry.hv !== blockEntry.ht) {
      return { time: null, reason: `Wrong tool class — ${toolEntry.n} harvests ${toolEntry.hv}, this block needs ${blockEntry.ht}.` };
    }
    if ((blockEntry.hl ?? 0) > (toolEntry.lvl ?? 0)) {
      return { time: null, reason: `Tool level too low — needs level ${blockEntry.hl}, ${toolEntry.n} is level ${toolEntry.lvl ?? 0}.` };
    }
    return { time: blockEntry.ttb / toolEntry.mult, reason: null };
  }

  function paintBreak() {
    const result = status(block, tool);
    const hand = block.ttb;

    root.querySelector("#breakResult").innerHTML = `
      <div class="result-grid">
        <div class="result hero-result">
          <b>${result.time != null ? seconds(result.time) : "—"}<em>${result.time != null ? " s" : ""}</em></b>
          <small>${result.hand ? "Bare hand" : "Time to break"}</small>
        </div>
        <div class="result"><b>×${result.time != null && tool ? tool.mult : 1}</b><small>Tool multiplier</small></div>
        <div class="result"><b>${num(hand)}<em> ms</em></b><small>Base ttb</small></div>
      </div>
      ${result.reason ? `<div class="note"><span>⚠</span><div><b>Cannot harvest.</b> ${esc(result.reason)}</div></div>` : ""}
      <div class="hero-chips" style="margin-top:14px">
        <span>Block</span>
        ${texHTML(block.t, 22)}
        <span class="chip plain">${esc(block.n)}</span>
        <span class="chip plain">${esc(block.ht)}</span>
        <span class="chip plain">level ${block.hl ?? 0}</span>
      </div>`;

    const title = root.querySelector("#breakBarsTitle");
    title.innerHTML = `Every ${esc(block.ht)} tool for ${esc(block.n)}`;

    const candidates = tools
      .filter((candidate) => candidate.hv === block.ht)
      .map((candidate) => ({ entry: candidate, ...status(block, candidate) }))
      .filter((candidate) => candidate.time != null)
      .sort((a, b) => a.time - b.time);

    const top = candidates.slice(0, 6);
    if (tool && !top.some((candidate) => candidate.entry.i === tool.i)) {
      const current = candidates.find((candidate) => candidate.entry.i === tool.i);
      if (current) top.push(current);
    }

    root.querySelector("#breakBars").innerHTML = top.length
      ? top
          .map((candidate) => {
            const width = Math.max(3, Math.min(100, (candidate.time / hand) * 100));
            const selected = tool && candidate.entry.i === tool.i;
            return `
              <div class="bar-row ${selected ? "is-selected" : ""}">
                <span class="bar-name" title="${esc(candidate.entry.n)}">${esc(candidate.entry.n)}</span>
                <span class="bar-track"><span class="bar-fill" style="width:${width.toFixed(1)}%"></span></span>
                <span class="bar-val">${(candidate.time / 1000).toFixed(2)} s</span>
              </div>`;
          })
          .join("")
      : `<p class="dim" style="font-size:12px">No tools in the registry harvest ${esc(block.ht)}.</p>`;

    root.querySelector("#breakFormula").innerHTML = tool
      ? `<code>time = ttb ÷ multiplier</code> → ${num(block.ttb)} ms ÷ ${tool.mult} = ${result.time != null ? seconds(result.time) + " s" : "not possible"}<br>Bare hand: ${num(hand)} ms (${seconds(hand)} s). Time includes no movement or latency.`
      : `<code>time = ttb</code> → ${num(hand)} ms bare-handed.`;
  }

  /* ---------------------------------------------------------- damage */
  let weapon = findByName(entries, DEFAULT_WEAPON) ?? weapons[0];
  const reduction = root.querySelector("#reduction");
  const hpInput = root.querySelector("#targetHp");
  const redValue = root.querySelector("#redValue");

  mountCombo(root.querySelector("#weaponCombo"), {
    items: weapons,
    getLabel: (entry) => entry.n,
    getMeta: (entry) => `#${entry.i} · ${entry.dmg} dmg`,
    placeholder: "Search weapons…",
    initial: weapon,
    onSelect: (value) => {
      if (!value) return;
      weapon = value;
      paintDamage();
    },
  });

  const ttkFor = (entry, hp, red) => {
    const damage = (entry.dmg ?? 0) * (1 - red);
    if (damage <= 0) return { hits: Infinity, time: Infinity, damage: 0 };
    const hits = Math.ceil(hp / damage);
    const interval = entry.ac ?? DEFAULT_INTERVAL;
    return { hits, time: Math.max(0, hits - 1) * interval, damage, interval };
  };

  function paintDamage() {
    const red = Number(reduction.value) / 100;
    const hp = Math.max(1, Number(hpInput.value) || 100);
    redValue.textContent = `${Math.round(red * 100)}%`;

    const result = ttkFor(weapon, hp, red);
    const interval = weapon.ac ?? DEFAULT_INTERVAL;

    root.querySelector("#damageResult").innerHTML = `
      <div class="result-grid">
        <div class="result hero-result">
          <b>${Number.isFinite(result.time) ? seconds(result.time) : "—"}<em>${Number.isFinite(result.time) ? " s" : ""}</em></b>
          <small>Time to KO</small>
        </div>
        <div class="result"><b>${result.damage.toFixed(1)}<em> dmg</em></b><small>After reduction</small></div>
        <div class="result"><b>${Number.isFinite(result.hits) ? result.hits : "—"}<em> hits</em></b><small>To reach ${num(hp)} HP</small></div>
      </div>
      <div class="hero-chips" style="margin-top:14px">
        <span>Weapon</span>
        ${texHTML(weapon.t, 22)}
        <span class="chip plain">${esc(weapon.n)}</span>
        <span class="chip plain">${num(weapon.dmg)} dmg</span>
        <span class="chip plain">${weapon.ac ? `${num(weapon.ac)} ms cooldown` : "assumed 500 ms"}</span>
      </div>`;

    const ranked = weapons
      .map((entry) => ({ entry, ...ttkFor(entry, hp, red) }))
      .filter((candidate) => Number.isFinite(candidate.time))
      .sort((a, b) => a.time - b.time || a.entry.i - b.entry.i)
      .slice(0, 6);

    const fastest = ranked[0]?.time || 1;

    root.querySelector("#damageBars").innerHTML = ranked
      .map((candidate) => {
        const width = Math.max(4, Math.min(100, (fastest / Math.max(candidate.time, 1)) * 100));
        const selected = candidate.entry.i === weapon.i;
        return `
          <div class="bar-row ${selected ? "is-selected" : ""}">
            <span class="bar-name" title="${esc(candidate.entry.n)}">${esc(candidate.entry.n)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${width.toFixed(1)}%"></span></span>
            <span class="bar-val">${candidate.hits} hit${candidate.hits === 1 ? "" : "s"}</span>
          </div>`;
      })
      .join("");

    root.querySelector("#damageFormula").innerHTML = `
      <code>effective = damage × (1 − reduction)</code> → ${weapon.dmg} × (1 − ${red.toFixed(2)}) = ${result.damage.toFixed(1)}<br>
      <code>hits = ⌈HP ÷ effective⌉</code> → ⌈${num(hp)} ÷ ${result.damage.toFixed(1)}⌉ = ${result.hits}<br>
      <code>time = (hits − 1) × interval</code> → ${Number.isFinite(result.time) ? `${seconds(result.time)} s at ${num(interval)} ms per swing` : "—"}.
      ${weapon.ac ? "" : "This weapon has no <code>attackCooldownMs</code>, so 500 ms is assumed."}
      Armour reduction is applied as a flat percentage — the game may combine armour pieces differently.
    `;
  }

  reduction.addEventListener("input", paintDamage);
  hpInput.addEventListener("input", paintDamage);
  root.querySelectorAll("[data-red]").forEach((button) => {
    button.addEventListener("click", () => {
      reduction.value = button.dataset.red;
      paintDamage();
    });
  });

  /* ------------------------------------------------------- ID finder */
  const idInput = root.querySelector("#idInput");
  const idResult = root.querySelector("#idResult");

  const lookup = () => {
    const id = Number(idInput.value);
    const found = entries.find((entry) => entry.i === id);
    if (!idInput.value.trim()) {
      idResult.innerHTML = "";
      return;
    }
    if (!found) {
      idResult.innerHTML = `<div class="note"><span>⚠</span><div>No entry with ID <b>${num(id)}</b>. The registry covers 0–${num(meta.counts.entries - 1)}.</div></div>`;
      return;
    }
    idResult.innerHTML = `
      <a class="entry-card" href="#/entry/${found.i}" style="max-width:340px">
        ${texHTML(found.t, 40)}
        <span class="entry-card-body">
          <span class="entry-name">${esc(found.n)}</span>
          <span class="entry-sub"><span>${found.k === "b" ? "Block" : found.ty || "Item"}</span><i class="dot"></i><span>#${found.i}</span></span>
        </span>
      </a>`;
  };

  idInput.addEventListener("input", lookup);
  idInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const found = entries.find((entry) => entry.i === Number(idInput.value));
      if (found) location.hash = `#/entry/${found.i}`;
    }
  });
  root.querySelector("#idGo").addEventListener("click", () => {
    const found = entries.find((entry) => entry.i === Number(idInput.value));
    if (found) location.hash = `#/entry/${found.i}`;
    else lookup();
  });

  paintBreak();
  paintDamage();
  blockCombo.select(block);
  toolCombo.select(tool);
}

function seconds(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";
  if (milliseconds >= 10000) return (milliseconds / 1000).toFixed(0);
  if (milliseconds >= 1000) return (milliseconds / 1000).toFixed(2);
  if (milliseconds >= 100) return (milliseconds / 1000).toFixed(2);
  return (milliseconds / 1000).toFixed(3);
}
