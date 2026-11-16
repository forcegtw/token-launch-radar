// The radar's value model. One sealed snapshot in, one ranked board out.
//
// A protocol is pre-token when the snapshot records no token for it: no market cap, no CoinGecko id,
// no symbol. Pre-token protocols are scored with the launch model below; protocols that already trade
// are kept in a separate live set and shown at the market's own prices, never mixed into the ranked
// board. Nothing is special-cased by name: one function scores every protocol.
//
// The implied value of a launch, from the snapshot's own figures only:
//
//   base       = tvl_usd x BASE (capital already committed decides a launch's floor)
//   momentum   = clamp(change_7d, MOMENTUM_FLOOR, MOMENTUM_CAP) / 100
//   momMult    = 1 + momentum x MOMENTUM_WEIGHT
//   ageDays    = whole days from listed_at to the snapshot's as_of; UNKNOWN_AGE_DAYS when unlisted date
//   freshMult  = 1 + FRESH_BONUS x exp(-ageDays / FRESH_DECAY_DAYS)   (young capital is worth more)
//   conviction = 1 + min(chains, CHAIN_CAP) x CHAIN_WEIGHT            (multi-chain capital is stickier)
//   implied    = max(1, round(base x momMult x freshMult x conviction))
//
// The farm plan is derived from the row's own category, chains, TVL and age with a template table —
// no hand-written list of protocol names anywhere in this file.

/** The sealed snapshot's protocol record: exactly the ten fields the house fetched. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and its sandbox may vary. */
export interface ModelConstants {
  base: number;
  momentum_floor: number;
  momentum_cap: number;
  momentum_weight: number;
  fresh_bonus: number;
  fresh_decay_days: number;
  unknown_age_days: number;
  chain_cap: number;
  chain_weight: number;
}

export const MODEL: ModelConstants = {
  base: 0.3,
  momentum_floor: -60,
  momentum_cap: 120,
  momentum_weight: 0.45,
  fresh_bonus: 0.8,
  fresh_decay_days: 240,
  unknown_age_days: 420,
  chain_cap: 6,
  chain_weight: 0.05,
};

/** The model's label: the dashboard names it and the dossier carries it. */
export const MODEL_VERSION = 'radar-tr-2';

/** Pre-token protocols below the watchlist floor the board carries, by TVL: the early radar. */
export const EARLY_ROWS = 150;

/** Live-token protocols shown in the dashboard's live view, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step as the board stores it: one string a reader can act on. */
export interface FarmStep {
  action: string;
  cost: string;
  time: string;
}

/** One ranked row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    momentum_pct: number;
    momentum_multiplier: number;
    freshness_multiplier: number;
    conviction_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact row: the numbers the page renders, farm plans composed in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  momentum_multiplier: number;
  freshness_multiplier: number;
  conviction_multiplier: number;
  /** Whether the house's watchlist kept this protocol: the board's floor, not a ceiling. */
  watchlist: boolean;
}

/** A protocol whose token already trades: the market's own value, kept off the ranked board. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders, plus the model that produced it. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the input is not a snapshot this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else the fallback. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from listed_at to as_of, never negative; null when either date is absent or unparsable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const to = Date.parse(`${asOf}T00:00:00Z`);
  const from = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(to) || !Number.isFinite(from)) return null;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

/** The multipliers and implied value one protocol scores under `model`. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; momentumPct: number; momentumMult: number; freshMult: number; convictionMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const momentumPct = Math.min(model.momentum_cap, Math.max(model.momentum_floor, finite(p.change_7d, 0)));
  const momentumMult = 1 + (momentumPct / 100) * model.momentum_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const freshMult = 1 + model.fresh_bonus * Math.exp(-Math.max(ageForModel, 0) / model.fresh_decay_days);
  const convictionMult = 1 + Math.min(Math.max(p.chains.length, 1), model.chain_cap) * model.chain_weight;
  const base = p.tvl_usd * model.base;
  const implied = Math.max(1, Math.round(base * momentumMult * freshMult * convictionMult));
  return { implied, momentumPct, momentumMult, freshMult, convictionMult, age };
}

/** DefiLlama's version-marker convention: a trailing release number names a pool of another protocol. */
const VERSIONED = /\s(v\d+(?:\.\d+)*|V\d+(?:\.\d+)*)$/;

/** A protocol that records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether the board may rank it: pre-token, not a CEX record, not a versioned pool of another protocol. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

const bySlugAsc = (a: SnapshotProtocol, b: SnapshotProtocol) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** The ranked board: the whole watchlist first, then the strongest pre-token protocols below the floor. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || bySlugAsc(a, b))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || bySlugAsc(a.p, b.p));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base,
      momentum_pct: s.momentumPct,
      momentum_multiplier: round4(s.momentumMult),
      freshness_multiplier: round4(s.freshMult),
      conviction_multiplier: round4(s.convictionMult),
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One step as a single string, held inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.action} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Then keep the position open and watch the protocol's own page.`;
  return s;
}

/** The first chain the record names, or a neutral phrase when it names none. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Position size the plan suggests, scaled by the capital already committed to the protocol. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 120;
  return 60;
}

/** How long to hold: a younger protocol gives a longer window to be counted in several snapshots. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 120) return 75;
  if (age < 365) return 50;
  return 30;
}

/** The category's core action, in words a reader can follow without guessing. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('liquid restak') || c.includes('restak')) return `Restake $${capital} of the chain's liquid staking receipt through ${n} on ${chain} and keep the restaked receipt.`;
  if (c.includes('liquid stak') || c.includes('staking')) return `Stake $${capital} of the chain's native asset with ${n} on ${chain} and keep the liquid receipt.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) return `Supply $${capital} of USDC to ${n} on ${chain} and leave the deposit untouched.`;
  if (c.includes('dex') || c.includes('liquidity') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${n}'s deepest pool on ${chain} and hold the LP position.`;
  if (c.includes('perp') || c.includes('derivative') || c.includes('option')) return `Deposit $${capital} of USDC as margin on ${n} and open one small, hedged position.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${n} and put the funds to work in that chain's apps.`;
  if (c.includes('rwa') || c.includes('real world')) return `Mint $${capital} of ${n}'s tokenized yield asset on ${chain} and hold it to accrue yield.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold the receipt.`;
  if (c.includes('insurance') || c.includes('cover')) return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy to its term.`;
  if (c.includes('prediction') || c.includes('betting')) return `Fund $${capital} on ${n} and take one position in its deepest market.`;
  if (c.includes('vault') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${n} vault on ${chain} and hold the vault shares.`;
  if (c.includes('nft') || c.includes('collect')) return `Use $${capital} of volume on ${n}'s marketplace on ${chain}, one trade a week.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`;
}

/**
 * A farm plan: six steps derived from the record's own category, chains, TVL and age. The steps cover
 * wallet hygiene, the core position, weekly activity, holding time, claim safety and record keeping.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      action: `Open a dedicated wallet for ${p.name} that holds only farming funds, seed phrase kept offline.`,
      cost: 'under $3 of gas for setup',
      time: '5 minutes',
    },
    { action, cost: `$${capital} of capital, about $${capital >= 200 ? 10 : 5} of gas`, time: '15 minutes' },
    {
      action: `Make one real action each week on ${p.name} — a deposit, a swap, a borrow or a vote — so the wallet stays active.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      action: `Hold the position at least ${hold} days so the wallet appears in more than one activity snapshot.`,
      cost: `the $${capital} stays deployed`,
      time: `${hold} days`,
    },
    {
      action: `Before withdrawing, claim or register only from pages ${p.name} itself publishes, and pay nothing to claim.`,
      cost: 'no fee, and never pay to claim',
      time: '10 minutes',
    },
    {
      action: `Log the wallet, dates and every transaction so the position can be repeated or unwound on demand.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, strongest market cap first, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The dashboard's compact form of one board row. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    momentum_multiplier: row.model.momentum_multiplier,
    freshness_multiplier: row.model.freshness_multiplier,
    conviction_multiplier: row.model.conviction_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const wlSet = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, wlSet)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape this model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why the gate would refuse this board, or null: watchlist coverage, ranks, order, steps, values. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is ${board[i]!.rank}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
