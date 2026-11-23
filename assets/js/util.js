/* Small shared helpers. No dependencies. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

const numberFormat = new Intl.NumberFormat("en-US");
export const num = (value) => numberFormat.format(value);

export function bytes(value) {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1048576).toFixed(2)} MB`;
}

export function date(iso, options = {}) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

export function dateTime(iso) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function debounce(fn, wait = 160) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function ms(value) {
  if (value == null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} s`;
  return `${Math.round(value)} ms`;
}

const LABELS = {
  id: "Registry ID",
  name: "Name",
  kind: "Kind",
  type: "Item type",
  ttb: "Time to break",
  harvestType: "Harvest type",
  harvestLevel: "Harvest level",
  harvests: "Harvests",
  multiplier: "Mining multiplier",
  level: "Tool level",
  damage: "Damage",
  secondaryDamage: "Secondary damage",
  attackCooldownMs: "Attack cooldown",
  cadenceMs: "Cadence",
  attackRange: "Attack range",
  armourReduction: "Armour reduction",
  eatHealAmt: "Heals",
  eatShieldAmt: "Shield",
  eatable: "Edible",
  stackable: "Stackable",
  weight: "Weight",
  drops: "Drops",
  specialToolDrop: "Special tool drop",
  specialToolBonusDrops: "Bonus drops",
  textureInfo: "Texture key",
  textureName: "Texture name",
  texturePerSide: "Texture per side",
  atlasIdx: "Atlas index",
  blockModel: "Block model",
  blockModelItem: "Held block model",
  model: "Model",
  modelScale: "Model scale",
  heldItemScale: "Held scale",
  soundType: "Sound set",
  solid: "Solid",
  unlitStandaloneMesh: "Unlit mesh",
  customModelInfo: "Custom model info",
  displayName: "Display name",
  description: "Description",
  gunType: "Gun type",
  clipSize: "Clip size",
  reloadTime: "Reload time",
  msPerRound: "Fire interval",
  fireInterval: "Fire interval",
  delayBetweenShots: "Delay between shots",
  bulletReloadTime: "Bullet reload",
  requiresArrow: "Requires arrows",
  onMinedAura: "On-mined aura",
  knockbackHorizontalScalar: "Knockback (horizontal)",
  knockbackVerticalScalar: "Knockback (vertical)",
  keepMetaInChest: "Keep meta in chest",
  afterEatenItem: "After eaten",
  transTex: "Transparent texture",
  twoDBlockItem: "2D block item",
  slabFullBlock: "Slab full block",
  canBePlacedOver: "Can be placed over",
  attachedTop: "Attached top",
  rotatableOffsetAmt: "Rotation offset",
  velocityMultiplier: "Velocity multiplier",
  surfaceVelocity: "Surface velocity",
  climbedInside: "Climbable inside",
  climbedableInside: "Climbable inside",
  spotlightRange: "Spotlight range",
  spotlightConeAngle: "Spotlight cone",
  abilityCooldownMs: "Ability cooldown",
  equipDelay: "Equip delay",
  minChargeStateToUse: "Min charge state",
  chargeTime: "Charge time",
  burstCount: "Burst count",
  burstDelay: "Burst delay",
  shotPelletCount: "Pellets per shot",
  bridgeLength: "Bridge length",
  lumberjackHeight: "Lumberjack height",
  onDeathItemDrops: "Death drops",
  maxHealth: "Max health",
  walkingSpeed: "Walking speed",
  runningSpeed: "Running speed",
};

const UNIT_KEYS = new Set(["ttb", "attackCooldownMs", "cadenceMs", "reloadTime", "msPerRound", "fireInterval", "bulletReloadTime", "abilityCooldownMs", "equipDelay", "chargeTime", "burstDelay", "cockTime", "recoveryRate"]);

export function label(key) {
  if (LABELS[key]) return LABELS[key];
  const spaced = String(key)
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatValue(key, value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    const rounded = Number.isInteger(value) ? value : Math.round(value * 1000) / 1000;
    return UNIT_KEYS.has(key) ? `${rounded} ms` : String(rounded);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function copy(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try { document.execCommand("copy"); } catch { /* ignore */ }
  area.remove();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* Run a callback once the document is idle, falling back to a timeout. */
export function whenIdle(fn) {
  if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 1200 });
  else setTimeout(fn, 120);
}

/* Count-up animation for stat numbers. */
export function countUp(element, target, duration = 900) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = num(target);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const progress = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = num(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
