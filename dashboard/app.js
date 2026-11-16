// Launch Radar's page: renders window.RADAR (written by main.ts as ../data.js) with no framework,
// no fetch and no network. Three views — the ranked board, the live-token market view and the model
// statement — plus a detail view for every protocol, which carries its farm plan.
'use strict';

const RADAR = window.RADAR || { rows: [], live: [], model: {}, model_version: '', watchlist_size: 0, board_size: 0, early_size: 0, live_size: 0, floor_usd: 0, as_of: '', source: '' };
const M = Object.assign({
  base: 0.3, momentum_floor: -60, momentum_cap: 120, momentum_weight: 0.45,
  fresh_bonus: 0.8, fresh_decay_days: 240, unknown_age_days: 420, chain_cap: 6, chain_weight: 0.05,
}, RADAR.model || {});

const $ = (id) => document.getElementById(id);

/* ---------- formatting ---------- */

function usd(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 1 : 2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}
function pct(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}
function pctClass(n) {
  if (n === null || n === undefined || !isFinite(n) || Math.abs(n) < 0.05) return 'flat';
  return n > 0 ? 'up' : 'down';
}
function age(n) {
  if (n === null || n === undefined) return 'unlisted';
  if (n < 45) return n + 'd';
  if (n < 730) return Math.round(n / 30.4) + 'mo';
  return (n / 365).toFixed(1) + 'y';
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- the model, mirrored in the page so the detail view can show the working ---------- */

function momentumMult(row) {
  const raw = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
  const clamped = Math.min(M.momentum_cap, Math.max(M.momentum_floor, raw));
  return { clamped, mult: 1 + (clamped / 100) * M.momentum_weight };
}
function freshMult(row) {
  const d = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
  return 1 + M.fresh_bonus * Math.exp(-Math.max(d, 0) / M.fresh_decay_days);
}
function convictionMult(row) {
  const chains = row.chains && row.chains.length ? row.chains.length : 1;
  return 1 + Math.min(chains, M.chain_cap) * M.chain_weight;
}

/* ---------- farm plan, derived from the row's own record ---------- */

function capitalFor(row) {
  if (row.tvl_usd >= 5e9) return 300;
  if (row.tvl_usd >= 1e9) return 200;
  if (row.tvl_usd >= 1e8) return 120;
  return 60;
}
function holdFor(row) {
  if (row.age_days === null || row.age_days === undefined) return 45;
  if (row.age_days < 120) return 75;
  if (row.age_days < 365) return 50;
  return 30;
}
function actionFor(row, capital, chain) {
  const c = (row.category || '').toLowerCase();
  const n = row.name;
  if (c.includes('liquid restak') || c.includes('restak')) return 'Restake $' + capital + " of the chain's liquid staking receipt through " + n + ' on ' + chain + ', and keep the restaked receipt.';
  if (c.includes('liquid stak') || c.includes('staking')) return "Stake $" + capital + " of the chain's native asset with " + n + ' on ' + chain + ', and keep the liquid receipt.';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) return 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ', and leave the deposit untouched.';
  if (c.includes('dex') || c.includes('liquidity') || c.includes('yield') || c.includes('leveraged farm')) return "Add $" + capital + " of liquidity to " + n + "'s deepest pool on " + chain + ', and hold the LP position.';
  if (c.includes('perp') || c.includes('derivative') || c.includes('option')) return 'Deposit $' + capital + ' of USDC as margin on ' + n + ', and open one small hedged position.';
  if (c.includes('bridge')) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + n + ", and put the funds to work in that chain's apps.";
  if (c.includes('rwa') || c.includes('real world')) return "Mint $" + capital + " of " + n + "'s tokenized yield asset on " + chain + ', and hold it to accrue yield.';
  if (c.includes('stable')) return 'Mint or deposit $' + capital + ' of the stable asset through ' + n + ' on ' + chain + ', and hold the receipt.';
  if (c.includes('insurance') || c.includes('cover')) return 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ', and keep the policy to its term.';
  if (c.includes('prediction') || c.includes('betting')) return 'Fund $' + capital + ' on ' + n + ', and take one position in its deepest market.';
  if (c.includes('vault') || c.includes('curator') || c.includes('allocator')) return 'Deposit $' + capital + ' into a ' + n + ' vault on ' + chain + ', and hold the vault shares.';
  return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ', and keep the position open.';
}
function farmPlan(row) {
  const chain = row.chains && row.chains.length ? row.chains[0] : 'its main chain';
  const capital = capitalFor(row);
  const hold = holdFor(row);
  return [
    'Open a dedicated wallet for ' + row.name + ' that holds only farming funds, and keep its seed phrase offline. Cost: under $3 of gas. Time: 5 minutes.',
    actionFor(row, capital, chain) + ' Cost: $' + capital + ' of capital, about $' + (capital >= 200 ? 10 : 5) + ' of gas. Time: 15 minutes.',
    'Make one real action each week on ' + row.name + ' — a deposit, a swap, a borrow or a vote — so the wallet stays active. Cost: about $2 of gas a week. Time: 10 minutes a week.',
    'Hold the position at least ' + hold + ' days so the wallet appears in more than one activity snapshot. Cost: the $' + capital + ' stays deployed. Time: ' + hold + ' days.',
    'Before withdrawing, claim or register only from pages ' + row.name + ' itself publishes, and pay nothing to claim. Cost: no fee, and never pay to claim. Time: 10 minutes.',
    'Log the wallet, the dates and every transaction, so the position can be repeated or unwound on demand. Cost: nothing but the log. Time: 5 minutes.',
  ];
}

/* ---------- state ---------- */

const state = { query: '', filter: 'all', sort: 'implied', view: 'board' };

function isWatchlist(row) { return row.watchlist === true; }

function matches(row) {
  const q = state.query.trim().toLowerCase();
  if (q) {
    const hay = [row.name, row.slug, row.category || '', (row.chains || []).join(' ')].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  switch (state.filter) {
    case 'watchlist': return isWatchlist(row);
    case 'early': return !isWatchlist(row);
    case 'young': return row.age_days !== null && row.age_days < 365;
    case 'momentum': return (row.change_7d || 0) > 0;
    default: return true;
  }
}

function sorted(rows) {
  const copy = rows.slice();
  switch (state.sort) {
    case 'tvl': copy.sort((a, b) => b.tvl_usd - a.tvl_usd); break;
    case 'momentum': copy.sort((a, b) => (b.change_7d || -999) - (a.change_7d || -999)); break;
    case 'age': copy.sort((a, b) => (a.age_days === null ? 1e9 : a.age_days) - (b.age_days === null ? 1e9 : b.age_days)); break;
    case 'name': copy.sort((a, b) => a.name.localeCompare(b.name)); break;
    default: copy.sort((a, b) => a.rank - b.rank);
  }
  return copy;
}

/* ---------- renderers ---------- */

function renderBoard() {
  const rows = sorted(RADAR.rows.filter(matches));
  const list = $('rows');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = '<li class="empty">No protocol matches this filter. Clear the search or pick All.</li>';
  }
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'row';
    li.tabIndex = 0;
    li.dataset.slug = row.slug;
    li.innerHTML =
      '<span class="r">' + row.rank + '</span>' +
      '<span class="nm"><b>' + esc(row.name) + '</b><span class="slug">' + esc(row.slug) + '</span>' +
      '<span class="badges">' + (isWatchlist(row) ? '<span class="badge wl">watchlist</span>' : '<span class="badge">below floor</span>') +
      (row.age_days !== null && row.age_days < 365 ? '<span class="badge young">young</span>' : '') + '</span></span>' +
      '<span class="cat">' + esc(row.category || '—') + '</span>' +
      '<span class="num">' + usd(row.tvl_usd) + '</span>' +
      '<span class="num ' + pctClass(row.change_7d) + '">' + pct(row.change_7d) + '</span>' +
      '<span class="num">' + age(row.age_days) + '</span>' +
      '<span class="num imp">' + usd(row.implied_value_usd) + '</span>';
    li.addEventListener('click', () => openDetail(row.slug));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDetail(row.slug); });
    list.appendChild(li);
  }
  $('count').textContent = rows.length + ' of ' + RADAR.rows.length + ' rows';
}

function renderLive() {
  const list = $('live-rows');
  list.innerHTML = '';
  for (const r of RADAR.live) {
    const li = document.createElement('li');
    li.className = 'row live';
    const ratio = r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' : '—';
    li.innerHTML =
      '<span class="nm"><b>' + esc(r.name) + '</b><span class="slug">' + esc(r.slug) + '</span></span>' +
      '<span class="cat">' + esc(r.category || '—') + '</span>' +
      '<span class="num">' + usd(r.mcap_usd) + '</span>' +
      '<span class="num">' + usd(r.tvl_usd) + '</span>' +
      '<span class="num">' + ratio + '</span>' +
      '<span class="num ' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</span>';
    list.appendChild(li);
  }
}

function renderModel() {
  const body = $('model-body');
  body.innerHTML =
    '<p class="muted">Every pre-token protocol gets one number, from the snapshot\'s own figures. Nothing is special-cased by name: the same function scores all ' + RADAR.board_size + ' rows.</p>' +
    '<div class="dsec"><h3>The formula</h3><div class="formula">' +
    'base       = tvl_usd × ' + M.base + '\n' +
    'momentum   = clamp(change_7d, ' + M.momentum_floor + ', ' + M.momentum_cap + ')/100\n' +
    'momMult    = 1 + momentum × ' + M.momentum_weight + '\n' +
    'freshMult  = 1 + ' + M.fresh_bonus + ' × exp(−age_days / ' + M.fresh_decay_days + ')\n' +
    'conviction = 1 + min(chains, ' + M.chain_cap + ') × ' + M.chain_weight + '\n' +
    'implied    = max(1, round(base × momMult × freshMult × conviction))' +
    '</div></div>' +
    '<div class="dsec"><h3>What each term claims</h3>' +
    '<p><b>base</b> — the capital already committed, at a ' + (M.base * 100).toFixed(0) + '% multiple: a launch is worth a fraction of the TVL it secures, not a multiple of it.</p>' +
    '<p><b>momentum</b> — seven-day TVL change, clamped to ' + M.momentum_floor + '…' + M.momentum_cap + '% so one odd week cannot dominate, weighted ' + M.momentum_weight + '.</p>' +
    '<p><b>freshness</b> — capital that arrived in the last year is more likely to be mercenary; older, settled TVL earns a smaller premium. Unknown listing date is treated as ' + M.unknown_age_days + ' days.</p>' +
    '<p><b>conviction</b> — each chain a protocol runs on (up to ' + M.chain_cap + ') adds ' + (M.chain_weight * 100).toFixed(0) + '%: multi-chain capital is stickier than one chain\'s.</p>' +
    '</div>' +
    '<div class="dsec"><h3>What it refuses to do</h3><p>It does not predict whether or when a token is issued, and it does not price protocols whose token already trades — those sit in the Live tokens view at the market\'s own market cap.</p></div>' +
    '<div class="dsec"><h3>Coverage</h3><p>' + RADAR.watchlist_size + ' watchlist protocols, ' + RADAR.early_size + ' pre-token protocols below the $' + (RADAR.floor_usd / 1e6).toFixed(0) + 'M floor, ' + RADAR.board_size + ' rows ranked, ' + RADAR.live_size + ' live-token protocols set aside. Model ' + esc(RADAR.model_version) + ', snapshot of ' + esc(RADAR.as_of) + '.</p></div>';
}

/* ---------- detail view ---------- */

function openDetail(slug) {
  const row = RADAR.rows.find((r) => r.slug === slug);
  if (!row) return;
  const mom = momentumMult(row);
  const fresh = freshMult(row);
  const conv = convictionMult(row);
  const base = row.tvl_usd * M.base;
  const plan = farmPlan(row);
  const chains = (row.chains || []).map((c) => '<span class="chain">' + esc(c) + '</span>').join('') || '<span class="chain">none recorded</span>';
  const share = ((row.implied_value_usd / base) || 0);

  $('detail-body').innerHTML =
    '<div class="dhead"><h2>' + esc(row.name) + '</h2><span class="badge ' + (isWatchlist(row) ? 'wl' : '') + '">' + (isWatchlist(row) ? 'watchlist' : 'below floor') + '</span>' +
    '<span class="muted">rank ' + row.rank + ' of ' + RADAR.board_size + ' · ' + esc(row.slug) + '</span>' +
    '<span class="imp">' + usd(row.implied_value_usd) + '</span><span class="muted">implied launch value</span></div>' +
    '<div class="dgrid">' +
    '<div class="stat"><div class="k">TVL</div><div class="v">' + usd(row.tvl_usd) + '</div></div>' +
    '<div class="stat"><div class="k">7-day change</div><div class="v ' + pctClass(row.change_7d) + '">' + pct(row.change_7d) + '</div></div>' +
    '<div class="stat"><div class="k">Tracked since</div><div class="v">' + (row.listed_at ? esc(row.listed_at) : '—') + '</div></div>' +
    '<div class="stat"><div class="k">Age</div><div class="v">' + age(row.age_days) + '</div></div>' +
    '<div class="stat"><div class="k">Category</div><div class="v" style="font-size:13.5px">' + esc(row.category || '—') + '</div></div>' +
    '<div class="stat"><div class="k">Token</div><div class="v" style="font-size:13.5px">none recorded</div></div>' +
    '</div>' +
    '<div class="dsec"><h3>Chains</h3><div class="chains">' + chains + '</div></div>' +
    '<div class="dsec"><h3>How the number was made</h3><div class="formula">' +
    'base       = ' + usd(row.tvl_usd) + ' × ' + M.base + ' = ' + usd(base) + '\n' +
    'momentum   = ' + pct(row.change_7d) + ' → clamped ' + pct(mom.clamped) + ' → ×' + mom.mult.toFixed(3) + '\n' +
    'freshness  = ' + age(row.age_days) + ' → ×' + fresh.toFixed(3) + '\n' +
    'conviction = ' + ((row.chains || []).length || 1) + ' chain(s) → ×' + conv.toFixed(3) + '\n' +
    'implied    = ' + usd(base) + ' × ' + mom.mult.toFixed(3) + ' × ' + fresh.toFixed(3) + ' × ' + conv.toFixed(3) + ' = ' + usd(row.implied_value_usd) +
    (row.momentum_multiplier ? '\n(stored in board.json: ×' + row.momentum_multiplier + ' ×' + row.freshness_multiplier + ' ×' + row.conviction_multiplier + ')' : '') +
    '</div><p class="muted">The implied value is ' + share.toFixed(2) + '× the base capital multiple — the whole model\'s claim about this protocol, using only its own record.</p></div>' +
    '<div class="dsec"><h3>Farm plan — how to be counted before the token</h3><ol>' + plan.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol></div>' +
    '<div class="dsec"><h3>Read it honestly</h3><p>A token may never be issued, and a launch value is not a price. The plan above is about being present and countable in the protocol\'s own activity, which is all a farm can claim before a token exists.</p></div>';

  $('detail').hidden = false;
  $('board').hidden = true;
  $('live').hidden = true;
  $('model').hidden = true;
  $('controls').hidden = true;
  window.scrollTo(0, 0);
}

function closeDetail() {
  $('detail').hidden = true;
  $('controls').hidden = false;
  setView(state.view);
}

/* ---------- view switching ---------- */

function setView(view) {
  state.view = view;
  $('detail').hidden = true;
  $('controls').hidden = view !== 'board';
  $('board').hidden = view !== 'board';
  $('live').hidden = view !== 'live';
  $('model').hidden = view !== 'model';
  for (const b of document.querySelectorAll('.viewbtn')) b.classList.toggle('active', b.dataset.view === view);
}

/* ---------- wiring ---------- */

function boot() {
  $('tagline').textContent = RADAR.board_size + ' pre-token protocols ranked · snapshot ' + RADAR.as_of;
  $('foot-note').textContent = 'Launch Radar · model ' + RADAR.model_version + ' · ' + RADAR.source.replace(/^https?:\/\//, '').split(' ').slice(0, 2).join(' ');
  $('search').addEventListener('input', (e) => { state.query = e.target.value; renderBoard(); });
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      for (const c of document.querySelectorAll('.chip')) c.classList.toggle('active', c === chip);
      renderBoard();
    });
  }
  for (const b of document.querySelectorAll('.viewbtn')) b.addEventListener('click', () => setView(b.dataset.view));
  $('detail-close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('detail').hidden) closeDetail(); });

  renderBoard();
  renderLive();
  renderModel();
  $('board').setAttribute('aria-busy', 'false');

  // Deterministic entry points for the three screenshots: ?shot=board|detail|filtered
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot === 'detail') {
    const pick = RADAR.rows.find((r) => isWatchlist(r)) || RADAR.rows[0];
    if (pick) openDetail(pick.slug);
  } else if (shot === 'filtered') {
    state.filter = 'momentum';
    state.query = '';
    for (const c of document.querySelectorAll('.chip')) c.classList.toggle('active', c.dataset.filter === 'momentum');
    renderBoard();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
