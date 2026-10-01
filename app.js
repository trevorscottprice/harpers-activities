'use strict';

// ---------- constants ----------
const KEY = 'harpers-activities:v1';
// Monday-first, matching how the week is usually said out loud (M T W Th F Sa Su).
const DAYS = [[1, 'M'], [2, 'T'], [3, 'W'], [4, 'Th'], [5, 'F'], [6, 'Sa'], [0, 'Su']];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const COLORS = ['#6c5ce7', '#00b894', '#e17055', '#0984e3', '#e84393', '#f0a500', '#00a8a8', '#636e72'];
const PRESETS = [
  { name: 'Tennis Lessons', emoji: '🎾', items: ['Dressed for tennis', 'Tennis shoes on', 'Tennis racquet', 'Water bottle filled', 'Hair tie'] },
  { name: 'Piano Lessons', emoji: '🎹', items: ['Piano books in bag', 'Practice log / assignment book', 'Pencil'] },
  { name: 'Soccer Practice', emoji: '⚽', items: ['Uniform on', 'Shin guards', 'Cleats', 'Water bottle filled', 'Soccer ball'] },
  { name: 'Swim', emoji: '🏊', items: ['Swimsuit on', 'Towel', 'Goggles', 'Swim cap', 'Change of clothes'] },
  { name: 'Dance', emoji: '💃', items: ['Dance clothes', 'Dance shoes', 'Hair up', 'Water bottle filled'] },
];
// The weekly look-ahead: a short planning routine for the coming week.
const REVIEW = [
  { id: 'look', text: 'Look at every day this week' },
  { id: 'changes', text: 'Anything different? Skip cancelled days or add one-time events' },
  { id: 'bring', text: 'Anything new to bring? Add it to that day' },
  { id: 'busy', text: 'Check busy days. Is there still time for homework and dinner?' },
];
// Reminder levels. Harper earns fewer reminders as leaving on time becomes a habit.
const SUPPORT = {
  1: { name: 'Lots of reminders', alerts: 'wrap up, get ready, and leave' },
  2: { name: 'Fewer reminders', alerts: 'get ready and leave' },
  3: { name: 'On my own 💪', alerts: 'just time to leave' },
};
const LEVEL_UP_RUN = 5;
const NUM_FIELDS = ['readyMins', 'durationMins', 'travelMins', 'bufferMins'];
// A "getting ready" time longer than this is probably a forgotten timer, not real data.
const MAX_READY_MINS = 180;

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const nowHHMM = () => fromMin(nowMin());
const num = (v) => Number(v) || 0;
function fmt(t) {
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}
function dur(mins) {
  mins = Math.round(Math.abs(mins));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------- state ----------
function blank() {
  return { version: 2, activities: [], checks: {}, extras: {}, skips: {}, started: {}, log: {}, review: {}, settings: { name: 'Harper', wrapMins: 5 } };
}
// Version 1 stored only a leave-by time; split it into trip time + a little extra.
function migrate(s) {
  s = { ...blank(), ...s, settings: { ...blank().settings, ...s.settings } };
  for (const a of s.activities) {
    if (a.travelMins == null) {
      const gap = Math.max(0, toMin(a.time) - toMin(a.leaveBy));
      a.bufferMins = gap >= 10 ? 5 : 0;
      a.travelMins = gap - a.bufferMins;
    }
    a.support ??= 1;
    a.supportSince ??= dkey(new Date());
  }
  s.version = 2;
  return s;
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.activities)) return migrate(s);
  } catch { /* fall through */ }
  return blank();
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { alert('Could not save: ' + e.message); }
}
// Per-day check marks only matter for a little while; drop ones older than two weeks.
function prune() {
  const cutoff = dkey(addDays(new Date(), -14));
  for (const bag of [state.checks, state.extras, state.skips, state.started]) {
    for (const k of Object.keys(bag)) if (k.split('|')[1] < cutoff) delete bag[k];
  }
}
prune();
save();
navigator.storage?.persist?.();

// ---------- activity logic ----------
const occKey = (id, k) => `${id}|${k}`;
const byId = (id) => state.activities.find((a) => a.id === id);
const happensOn = (a, d) => (a.recurring ? a.days.includes(d.getDay()) : a.date === dkey(d));
function occurrences(d) {
  const k = dkey(d);
  return state.activities
    .filter((a) => happensOn(a, d))
    .sort((x, y) => toMin(x.time) - toMin(y.time))
    .map((a) => ({ a, k, key: occKey(a.id, k) }));
}
function occFromKey(key) {
  const [id, k] = key.split('|');
  return { a: byId(id), k, key };
}
// Planning backward: start time − trip − extra = leave by; leave by − getting ready = start getting ready.
const leaveMin = (a) => toMin(a.time) - num(a.travelMins) - num(a.bufferMins);
const readyAt = (a) => toMin(a.leaveBy) - num(a.readyMins);
const itemsFor = (o) => [...o.a.checklist, ...(state.extras[o.key] || []).map((x) => ({ ...x, extra: true }))];
const checkedFor = (o) => new Set(state.checks[o.key] || []);
const weekStart = (d = new Date()) => dkey(addDays(d, -d.getDay())); // weeks are planned Sunday → Saturday
const reviewDone = (wk) => REVIEW.every((r) => (state.review[wk] || []).includes(r.id));
const level = (a) => a.support || 1;
// The wrap-up warning only exists at the "lots of reminders" level.
const wrapAt = (a) => readyAt(a) - (level(a) === 1 ? num(state.settings.wrapMins) : 0);

function scheduleText(a) {
  if (!a.recurring) return fromKey(a.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const d = DAYS.map(([n]) => n).filter((n) => a.days.includes(n));
  if (d.length === 7) return 'Every day';
  if (d.length === 5 && !d.includes(0) && !d.includes(6)) return 'Weekdays';
  return 'Every ' + d.map((n) => DAY_SHORT[n]).join(', ');
}

// Most recent departures first.
function logEntries(id) {
  return Object.entries(state.log)
    .map(([key, v]) => ({ key, id: key.split('|')[0], date: key.split('|')[1], ...v }))
    .filter((e) => !id || e.id === id)
    .sort((x, y) => (y.date + y.at).localeCompare(x.date + x.at));
}
// Progress over the last 10 rather than a streak that drops to zero, plus current and best runs.
function statsFor(id) {
  const e = logEntries(id);
  const last = e.slice(0, 10);
  let cur = 0;
  for (const x of e) { if (x.onTime) cur++; else break; }
  let best = 0, run = 0;
  for (const x of [...e].reverse()) { run = x.onTime ? run + 1 : 0; best = Math.max(best, run); }
  return { count: e.length, last: last.length, onTime: last.filter((x) => x.onTime).length, packed: last.filter((x) => x.allReady).length, cur, best };
}
// If the last few real getting-ready times differ from the guess, suggest a new guess.
function suggestion(a) {
  const recent = logEntries(a.id).filter((e) => e.took != null).slice(0, 3).map((e) => e.took);
  if (recent.length < 2) return null;
  const avg = Math.round(recent.reduce((x, y) => x + y, 0) / recent.length);
  return Math.abs(avg - num(a.readyMins)) >= 3 ? { avg, recent } : null;
}
// Offer fewer reminders after a run of on-time departures at this level, or more after a rough patch.
// Only departures after the last level change (or "not yet") count.
function levelOffer(a) {
  const e = logEntries(a.id).filter((x) => x.date > (a.supportSince || ''));
  if (level(a) < 3 && e.length >= LEVEL_UP_RUN && e.slice(0, LEVEL_UP_RUN).every((x) => x.onTime)) return 'up';
  if (level(a) > 1 && e.length >= 3 && e.slice(0, 3).filter((x) => !x.onTime).length >= 2) return 'down';
  return null;
}
// Two activities clash if one's getting-ready-to-back-home window overlaps the other's.
function dayWarnings(occs) {
  const live = occs.filter((o) => !state.skips[o.key]);
  const span = (a) => [readyAt(a), toMin(a.time) + num(a.durationMins) + num(a.travelMins)];
  const out = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const [as, ae] = span(live[i].a), [bs, be] = span(live[j].a);
      if (as < be && bs < ae) out.push(`⚠️ ${live[i].a.name} and ${live[j].a.name} overlap. Check the plan with a parent.`);
    }
  }
  if (!out.length && live.length >= 2) out.push(`Busy day: ${live.length} activities`);
  return out;
}
function nextUpcoming() {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(new Date(), i);
    const o = occurrences(d).find((o) => !state.skips[o.key]);
    if (o) return { ...o, d };
  }
  return null;
}

// ---------- big countdown ----------
const atTime = (d, hhmm) => { const x = new Date(d); const [h, m] = hhmm.split(':').map(Number); x.setHours(h, m, 0, 0); return x; };
function clock(secs) {
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
// The next activity today that Harper hasn't left for yet and that hasn't started.
function countdownTarget() {
  const now = new Date();
  return occurrences(now).find((o) => !state.log[o.key] && !state.skips[o.key] && now < atTime(now, o.a.time)
    // "On my own" means remembering when to start; the countdown only appears once it's getting-ready time.
    && (level(o.a) < 3 || now >= atTime(now, fromMin(readyAt(o.a)))));
}
function countdownPhase(o) {
  const now = new Date();
  const leave = atTime(now, o.a.leaveBy);
  const ready = new Date(leave - num(o.a.readyMins) * 60000);
  const wrap = atTime(now, fromMin(wrapAt(o.a)));
  const name = `${o.a.emoji} ${o.a.name}`;
  if (now < wrap) return { cls: '', label: `Start getting ready for ${name} in`, time: clock((ready - now) / 1000) };
  if (now < ready) return { cls: 'wrap', label: `🧩 Wrap up what you're doing! Getting ready for ${name} in`, time: clock((ready - now) / 1000) };
  if (now < leave) return { cls: 'urgent', label: `Leave for ${name} in`, time: clock((leave - now) / 1000) };
  return { cls: 'late', label: `Time to go! Leave now for ${name}`, time: 'Go now!' };
}
function countdownHtml() {
  const o = countdownTarget();
  if (!o) return '';
  const p = countdownPhase(o);
  const items = itemsFor(o), ch = checkedFor(o);
  const done = items.filter((i) => ch.has(i.id)).length;
  return `<section class="countdown ${p.cls}" id="countdown" data-key="${o.key}">
    <p class="cd-label">${esc(p.label)}</p>
    <p class="cd-time">${p.time}</p>
    <p class="cd-sub">Leave by ${fmt(o.a.leaveBy)}${items.length ? ` · ${done === items.length ? '🎒 all packed' : `${done} of ${items.length} packed`}` : ''}</p>
  </section>`;
}
// Runs every second: updates the numbers in place, re-rendering only if the target changed.
function tickCountdown() {
  if (tab !== 'today' || dlg.open) return;
  const el = $('#countdown');
  const o = countdownTarget();
  if ((o?.key ?? null) !== (el?.dataset.key ?? null)) {
    if (!document.activeElement?.matches('input, textarea')) render();
    return;
  }
  if (!o) return;
  const p = countdownPhase(o);
  el.className = `countdown ${p.cls}`;
  $('.cd-label', el).textContent = p.label;
  $('.cd-time', el).textContent = p.time;
}

// ---------- rendering ----------
const view = $('#view');
let tab = 'today';

function render() {
  tab = (location.hash.slice(1) || 'today');
  if (!['today', 'week', 'activities', 'more'].includes(tab)) tab = 'today';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  view.innerHTML = { today: renderToday, week: renderWeek, activities: renderActivities, more: renderMore }[tab]();
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function badgesHtml() {
  const s = statsFor();
  if (!s.count) return '';
  return `<div class="badges">
    <span class="badge">⭐ On time ${s.onTime} of last ${s.last}</span>
    <span class="badge">🎒 All packed ${s.packed} of last ${s.last}</span>
    ${s.cur >= 2 ? `<span class="badge">🔥 ${s.cur} in a row</span>` : ''}
    ${s.best >= 3 && s.best > s.cur ? `<span class="badge quiet">Best run: ${s.best}</span>` : ''}
  </div>`;
}

function renderToday() {
  const today = new Date();
  let html = `<section class="hero">
    <h1>${greeting()}, ${esc(state.settings.name)}</h1>
    <p class="date">${today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    ${badgesHtml()}
  </section>`;

  html += countdownHtml();

  if (isIOS() && !isStandalone()) {
    html += `<div class="banner">📲 <b>Install this app:</b> tap the Share button, then <b>Add to Home Screen</b>.</div>`;
  }
  const stale = state.activities.filter((a) => a.calendarStale);
  if (stale.length) {
    html += `<div class="banner">📆 Reminders changed for ${stale.map((a) => esc(a.name)).join(', ')}.
      Delete the old event in Calendar, then <button class="link" data-act="ics-stale">add the new one</button>.</div>`;
  }
  if ([0, 1].includes(today.getDay()) && state.activities.length && !reviewDone(weekStart())) {
    html += `<a class="banner link-banner" href="#week">🗓️ <b>Plan your week:</b> take 2 minutes to look ahead →</a>`;
  }

  if (!state.activities.length) {
    return html + `<div class="empty"><span class="big">🎒</span>No activities yet.<br><br>
      <button class="btn primary" data-act="new">+ Add your first activity</button></div>`;
  }

  const occs = occurrences(today);
  if (occs.length) {
    html += occs.map((o) => card(o, true)).join('');
  } else {
    const n = nextUpcoming();
    html += `<div class="empty"><span class="big">🎉</span>Nothing today!${n ? `<br>Next up: ${esc(n.a.emoji)} <b>${esc(n.a.name)}</b> on ${DAY_SHORT[n.d.getDay()]} at ${fmt(n.a.time)}` : ''}</div>`;
  }

  const tomorrow = occurrences(addDays(today, 1));
  if (tomorrow.length) {
    html += `<h2 class="section">Tomorrow · get a head start</h2>` + tomorrow.map((o) => card(o, false)).join('');
  }
  return html;
}

function estimateHtml(log) {
  if (log.took == null) return '';
  const diff = log.took - log.guess;
  const verdict = Math.abs(diff) <= 2 ? '🎯 Great guess!'
    : diff > 0 ? `It took ${dur(diff)} longer than you guessed.` : `${dur(-diff)} faster than you guessed!`;
  return `<p class="estimate">You guessed <b>${log.guess} min</b> to get ready. It took <b>${log.took} min</b>. ${verdict}</p>`;
}
function suggestHtml(a) {
  const s = suggestion(a);
  if (!s) return '';
  return `<div class="suggest">Lately getting ready has taken about <b>${s.avg} min</b> (${s.recent.join(', ')} min).
    Your plan says ${num(a.readyMins)} min.
    <button class="btn" data-act="use-est" data-id="${a.id}" data-v="${s.avg}">Plan for ${s.avg} min</button></div>`;
}

function offerHtml(a) {
  const o = levelOffer(a);
  if (!o) return '';
  const next = level(a) + (o === 'up' ? 1 : -1);
  return o === 'up'
    ? `<div class="offer up">🏆 <b>${LEVEL_UP_RUN} times in a row on time</b> for ${esc(a.name)}! Ready for fewer reminders?
        <small>${SUPPORT[next].name}: alerts for ${SUPPORT[next].alerts}.</small>
        <div class="offer-btns"><button class="btn primary" data-act="level" data-id="${a.id}" data-v="${next}">Yes, level up</button>
        <button class="btn" data-act="level-no" data-id="${a.id}">Not yet</button></div></div>`
    : `<div class="offer">Getting out the door for ${esc(a.name)} has been tricky lately. Want more reminders for a while? That's what they're for.
        <small>${SUPPORT[next].name}: alerts for ${SUPPORT[next].alerts}.</small>
        <div class="offer-btns"><button class="btn primary" data-act="level" data-id="${a.id}" data-v="${next}">Yes, more reminders</button>
        <button class="btn" data-act="level-no" data-id="${a.id}">I've got this</button></div></div>`;
}

function card(o, isToday) {
  const { a, key } = o;
  const items = itemsFor(o);
  const checked = checkedFor(o);
  const done = items.filter((i) => checked.has(i.id)).length;
  const log = state.log[key];
  const skipped = state.skips[key];
  const started = state.started[key];
  const active = isToday && !log && !skipped;

  let status, cls = '';
  if (skipped) {
    status = 'Not happening this time'; cls = 'muted';
  } else if (log) {
    const late = toMin(log.at) - toMin(a.leaveBy);
    status = log.onTime ? `✅ Left at ${fmt(log.at)}. On time!` : `Left at ${fmt(log.at)}, ${dur(late)} after leave time`;
    if (log.onTime && log.allReady) status += ' ⭐';
    cls = log.onTime ? 'good' : 'warn';
  } else if (isToday) {
    const n = nowMin(), w = wrapAt(a), r = readyAt(a), l = toMin(a.leaveBy), end = toMin(a.time) + (num(a.durationMins) || 60);
    if (n < w) status = level(a) === 3 ? `💪 On your own. Plan: start getting ready at ${fmt(fromMin(r))}` : `Start getting ready at ${fmt(fromMin(r))} (in ${dur(r - n)})`;
    else if (n < r) { status = `🧩 Wrap up what you're doing. Getting ready starts in ${dur(r - n)}`; cls = 'wrap'; }
    else if (n < l) { status = `⏰ Getting-ready time! Leave in ${dur(l - n)}`; cls = 'urgent'; }
    else if (n < end) { status = `🚪 Time to go! Leave time was ${fmt(a.leaveBy)}`; cls = 'late'; }
    else { status = 'All done for today'; cls = 'muted'; }
  } else {
    status = `Start getting ready at ${fmt(fromMin(readyAt(a)))}`;
  }

  const timer = active && started
    ? `<p class="timer">⏱️ Getting ready for ${dur((Date.now() - started) / 60000)} · you guessed ${num(a.readyMins)} min</p>` : '';
  const startBtn = active && !started
    ? `<button class="btn block start" data-act="start" data-key="${key}">▶ I'm starting to get ready</button>` : '';

  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const checklist = skipped || !items.length ? '' : `
    <div class="progress"><div style="width:${pct}%"></div></div>
    <p class="count">${done === items.length ? '🎒 All packed!' : `${done} of ${items.length} ready`}</p>
    <ul class="checklist">${items.map((i) => `
      <li><label><input type="checkbox" data-act="check" data-key="${key}" data-item="${i.id}" ${checked.has(i.id) ? 'checked' : ''}>
        <span>${esc(i.text)}${i.extra ? '<em>just this time</em>' : ''}</span></label>
        ${i.extra ? `<button class="x" data-act="rmextra" data-key="${key}" data-item="${i.id}" aria-label="Remove">×</button>` : ''}
      </li>`).join('')}
    </ul>`;

  const extraForm = skipped || log ? '' : `
    <form class="inline-add" data-form="extra" data-key="${key}">
      <input type="text" name="text" placeholder="+ Something extra, just this time" enterkeyhint="done" autocomplete="off">
    </form>`;

  const goBtn = active ? `<button class="btn primary block go" data-act="go" data-key="${key}">🚪 I'm out the door!</button>` : '';

  const after = log ? `${estimateHtml(log)}${suggestHtml(a)}${offerHtml(a)}
    <form class="inline-add" data-form="forgot" data-id="${a.id}">
      <input type="text" name="text" placeholder="Forgot something? Add it for next time" enterkeyhint="done" autocomplete="off">
    </form>` : '';

  const link = log
    ? `<button class="link" data-act="undo" data-key="${key}">Undo “out the door”</button>`
    : `<button class="link" data-act="skip" data-key="${key}">${skipped ? 'Actually, it’s happening' : 'Not happening this time'}</button>`;

  return `<article class="card ${cls}" style="--c:${esc(a.color)}">
    <header><span class="emoji">${esc(a.emoji)}</span><div>
      <h3>${esc(a.name)}</h3>
      <p class="when">Starts ${fmt(a.time)} · Leave by <b>${fmt(a.leaveBy)}</b></p>
    </div><span class="level l${level(a)}">${SUPPORT[level(a)].name}</span></header>
    <p class="status">${status}</p>
    ${timer}
    ${a.notes ? `<p class="notes">📝 ${esc(a.notes)}</p>` : ''}
    ${startBtn}${checklist}${extraForm}${goBtn}${after}
    <div class="row-links">${link}</div>
  </article>`;
}

function renderWeek() {
  const wk = weekStart();
  const done = new Set(state.review[wk] || []);
  const all = reviewDone(wk);
  let html = `<section class="hero"><h1>This week</h1><p class="date">The next 7 days</p></section>
  <section class="panel review ${all ? 'done' : ''}">
    <h3>${all ? '✅ Week planned. Nice work!' : '🗓️ Weekly look-ahead'}</h3>
    ${all ? '' : `<p>Take 2 minutes to check what's coming up.</p>`}
    <ul class="checklist">${REVIEW.map((r) => `
      <li><label><input type="checkbox" data-act="review" data-week="${wk}" data-item="${r.id}" ${done.has(r.id) ? 'checked' : ''}>
        <span>${esc(r.text)}</span></label></li>`).join('')}
    </ul>
    <button class="btn block" data-act="new-once">+ Add a one-time event</button>
  </section>`;

  for (let i = 0; i < 7; i++) {
    const d = addDays(new Date(), i);
    const occs = occurrences(d);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' });
    html += `<div class="day"><h3>${label} <small>${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></h3>`;
    if (!occs.length) html += `<p class="none">Free day</p>`;
    for (const w of dayWarnings(occs)) html += `<p class="${w.startsWith('⚠️') ? 'clash' : 'busy'}">${esc(w)}</p>`;
    for (const o of occs) {
      const items = itemsFor(o), ch = checkedFor(o);
      const doneN = items.filter((x) => ch.has(x.id)).length;
      const log = state.log[o.key];
      const skipped = state.skips[o.key];
      const extras = state.extras[o.key] || [];
      const pill = log ? `<span class="pill done">${log.onTime ? 'On time ✓' : 'Went ✓'}</span>`
        : items.length && !skipped ? `<span class="pill ${doneN === items.length ? 'done' : ''}">${doneN}/${items.length}</span>` : '';
      html += `<div class="wrow ${skipped ? 'skipped' : ''}">
        <span class="emoji">${esc(o.a.emoji)}</span>
        <div><b>${esc(o.a.name)}</b><div class="meta">${fmt(o.a.time)} · leave by ${fmt(o.a.leaveBy)}</div>
          ${extras.length && !skipped ? `<div class="meta extra">+ ${extras.map((x) => esc(x.text)).join(', ')}</div>` : ''}
          ${log ? '' : `<div class="wactions">
            <button class="link sm" data-act="skip" data-key="${o.key}">${skipped ? 'Undo skip' : 'Skip'}</button>
            ${skipped ? '' : `<button class="link sm" data-act="bring" data-key="${o.key}">+ Bring something</button>`}
          </div>`}
        </div>
        ${pill}</div>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderActivities() {
  let html = `<section class="hero"><h1>Activities</h1></section>`;
  for (const a of state.activities) {
    const s = statsFor(a.id);
    html += `<div class="card act" style="--c:${esc(a.color)}" data-act="edit" data-id="${a.id}" role="button" tabindex="0">
      <div class="act-main"><span class="emoji">${esc(a.emoji)}</span>
        <div><h3>${esc(a.name)}</h3>
          <p class="when">${scheduleText(a)} · ${fmt(a.time)} · leave by ${fmt(a.leaveBy)}</p>
          <p class="when">${a.checklist.length} getting-ready step${a.checklist.length === 1 ? '' : 's'} · about ${num(a.readyMins)} min</p>
          <p class="when">🔔 ${SUPPORT[level(a)].name}</p>
          ${s.count ? `<p class="stat">On time ${s.onTime} of last ${s.last}</p>` : ''}
        </div><span class="chev">›</span></div>
      ${suggestHtml(a)}${offerHtml(a)}
    </div>`;
  }
  if (!state.activities.length) html += `<div class="empty"><span class="big">🎒</span>Add things like tennis or piano lessons.</div>`;
  return html + `<button class="btn primary block" data-act="new">+ Add activity</button>`;
}

function renderMore() {
  return `<section class="hero"><h1>More</h1></section>
  <div class="panel"><h3>Whose activities?</h3>
    <form data-form="name"><input type="text" name="name" value="${esc(state.settings.name)}" enterkeyhint="done"></form>
  </div>
  <div class="panel"><h3>🧩 Wrap-up warning</h3>
    <p>How many minutes before getting-ready time to say “wrap up what you're doing”. Only for activities on <b>${SUPPORT[1].name}</b>.</p>
    <input type="number" data-setting="wrapMins" value="${num(state.settings.wrapMins)}" min="0" max="30" inputmode="numeric" aria-label="Wrap-up minutes">
  </div>
  <div class="panel"><h3>📆 Add to Calendar</h3>
    <p>Puts all activities in the iPhone Calendar with alerts that match each activity's reminder level: wrap up, start getting ready, and leave.
      If you change an activity, add it to the calendar again and delete the old event.</p>
    <button class="btn primary block" data-act="ics-all" ${state.activities.length ? '' : 'disabled'}>Add all activities to Calendar</button>
  </div>
  <div class="panel"><h3>💾 Backup</h3>
    <p>Everything is saved on this phone only. iPhones can clear app data that hasn't been used in a while, so save a backup now and then.</p>
    <button class="btn block" data-act="backup">Save backup file</button>
    <button class="btn block" data-act="restore">Restore from backup…</button>
    <input type="file" id="restore-file" accept="application/json,.json" hidden>
  </div>`;
}

// ---------- editor ----------
const dlg = $('#editor');
let draft = null, isNew = false;

function openEditor(id, defaults = {}) {
  const a = id && byId(id);
  isNew = !a;
  draft = a ? structuredClone(a) : {
    id: uid(), name: '', emoji: '⭐', color: COLORS[state.activities.length % COLORS.length],
    recurring: true, days: [], date: dkey(new Date()),
    time: '16:00', durationMins: 60, travelMins: 15, bufferMins: 5, readyMins: 15,
    checklist: [], notes: '', support: 1, supportSince: dkey(new Date()), ...defaults,
  };
  renderEditor();
  dlg.showModal();
  dlg.scrollTop = 0;
}

function timelineHtml(d) {
  if (!d.time) return '';
  const start = toMin(d.time), arrive = start - num(d.bufferMins), leave = arrive - num(d.travelMins), ready = leave - num(d.readyMins);
  const steps = [
    [ready, 'Start getting ready', `${num(d.readyMins)} min to get ready`],
    [leave, 'Leave home', `${num(d.travelMins)} min trip`],
    [arrive, 'Arrive', `${num(d.bufferMins)} min extra`],
    [start, `${esc(d.name.trim() || 'Activity')} starts`, ''],
  ];
  return `<ol class="timeline">${steps.map(([m, what, gap]) => `
      <li><b>${fmt(fromMin(m))}</b><span>${what}</span>${gap ? `<small>${gap}</small>` : ''}</li>`).join('')}</ol>
    <p class="math">${fmt(d.time)} start − ${num(d.travelMins)} min trip − ${num(d.bufferMins)} min extra = <b>leave by ${fmt(fromMin(leave))}</b></p>`;
}

function renderEditor(focus) {
  const d = draft;
  const past = isNew ? [] : logEntries(d.id).filter((e) => e.took != null).slice(0, 5).map((e) => e.took);
  dlg.innerHTML = `
  <div class="ed-head">
    <button class="link" data-ed="cancel">Cancel</button>
    <h2>${isNew ? 'New activity' : 'Edit activity'}</h2>
    <button class="link" data-ed="save"><b>Save</b></button>
  </div>
  <div class="ed-body">
    ${isNew ? `<div class="field"><span class="lbl">Quick start</span><div class="chips">
      ${PRESETS.map((p, i) => `<button class="chip" data-ed="preset" data-i="${i}">${p.emoji} ${esc(p.name)}</button>`).join('')}
    </div></div>` : ''}

    <div class="field"><label for="ed-name">Name</label>
      <div class="name-row">
        <input type="text" id="ed-emoji" data-f="emoji" value="${esc(d.emoji)}" maxlength="4" aria-label="Emoji">
        <input type="text" id="ed-name" data-f="name" value="${esc(d.name)}" placeholder="Tennis Lessons">
      </div>
    </div>

    <div class="field"><span class="lbl">Color</span><div class="swatches">
      ${COLORS.map((c) => `<button class="swatch ${c === d.color ? 'on' : ''}" style="--s:${c}" data-ed="color" data-c="${c}" aria-label="Color"></button>`).join('')}
    </div></div>

    <div class="field"><span class="lbl">How often?</span>
      <div class="toggle">
        <button data-ed="recurring" data-v="1" class="${d.recurring ? 'on' : ''}">Every week</button>
        <button data-ed="recurring" data-v="0" class="${d.recurring ? '' : 'on'}">Just once</button>
      </div>
    </div>
    ${d.recurring ? `<div class="field"><span class="lbl">Which days?</span><div class="chips days">
      ${DAYS.map(([n, l]) => `<button class="chip ${d.days.includes(n) ? 'on' : ''}" data-ed="day" data-n="${n}">${l}</button>`).join('')}
    </div></div>` : `<div class="field"><label for="ed-date">Date</label>
      <input type="date" id="ed-date" data-f="date" value="${d.date}"></div>`}

    <div class="two">
      <div class="field"><label for="ed-time">Starts at</label><input type="time" id="ed-time" data-f="time" value="${d.time}"></div>
      <div class="field"><label for="ed-dur">Lasts</label>
        <input type="number" id="ed-dur" data-f="durationMins" value="${d.durationMins}" min="5" max="600" inputmode="numeric">
        <p class="hint">minutes</p></div>
    </div>

    <div class="plan">
      <h3>Plan backward ⏪</h3>
      <div class="two">
        <div class="field"><label for="ed-travel">Trip there</label>
          <input type="number" id="ed-travel" data-f="travelMins" value="${d.travelMins}" min="0" max="240" inputmode="numeric">
          <p class="hint">minutes of driving or walking</p></div>
        <div class="field"><label for="ed-buffer">Extra time</label>
          <input type="number" id="ed-buffer" data-f="bufferMins" value="${d.bufferMins}" min="0" max="60" inputmode="numeric">
          <p class="hint">for traffic, parking, finding the room</p></div>
      </div>
      <div class="field"><label for="ed-ready">How long does getting ready take?</label>
        <input type="number" id="ed-ready" data-f="readyMins" value="${d.readyMins}" min="0" max="${MAX_READY_MINS}" inputmode="numeric">
        <p class="hint">Your best guess, in minutes. The app will time it and tell you how close you were.</p>
        ${past.length ? `<p class="hint">Real times lately: <b>${past.join(', ')} min</b></p>` : ''}
      </div>
      <div id="ed-timeline">${timelineHtml(d)}</div>
    </div>

    <div class="field"><span class="lbl">Reminders</span>
      <div class="toggle three">${[1, 2, 3].map((n) => `<button data-ed="support" data-v="${n}" class="${level(d) === n ? 'on' : ''}">${SUPPORT[n].name}</button>`).join('')}</div>
      <p class="hint">Alerts for ${SUPPORT[level(d)].alerts}. The app offers fewer reminders after ${LEVEL_UP_RUN} on-time departures in a row.</p>
    </div>

    <div class="field"><span class="lbl">Getting ready means…</span>
      <ul class="ed-list">${d.checklist.map((it, i) => `<li><span>${esc(it.text)}</span>
        <button class="x" data-ed="up" data-i="${i}" aria-label="Move up" ${i ? '' : 'disabled'}>↑</button>
        <button class="x" data-ed="rm" data-i="${i}" aria-label="Remove">×</button></li>`).join('')}</ul>
      <form class="inline-add" data-form="ed-item">
        <input type="text" id="ed-item" name="text" placeholder="e.g. Water bottle filled" enterkeyhint="done" autocomplete="off">
        <button class="btn">Add</button>
      </form>
    </div>

    <div class="field"><label for="ed-notes">Notes</label>
      <textarea id="ed-notes" data-f="notes" rows="3" placeholder="Where it is, coach's name, what to practice…">${esc(d.notes)}</textarea></div>

    ${isNew ? '' : `<button class="btn block" data-ed="ics">📆 Add to Calendar</button><br>
      <button class="btn danger block" data-ed="delete">Delete activity</button>`}
  </div>`;
  if (focus) $(focus, dlg)?.focus();
}

dlg.addEventListener('input', (e) => {
  const f = e.target.dataset.f;
  if (!f) return;
  const v = e.target.value;
  draft[f] = NUM_FIELDS.includes(f) ? Math.max(0, Math.min(600, parseInt(v, 10) || 0)) : v;
  // Update the timeline in place so typing in a number box doesn't lose focus.
  if (['time', 'name', 'travelMins', 'bufferMins', 'readyMins'].includes(f)) $('#ed-timeline', dlg).innerHTML = timelineHtml(draft);
});
dlg.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = e.target.elements.text;
  const text = input.value.trim();
  if (!text) return;
  draft.checklist.push({ id: uid(), text });
  renderEditor('#ed-item');
});
dlg.addEventListener('cancel', () => { draft = null; });
dlg.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ed]');
  if (!b) return;
  e.preventDefault();
  const d = draft;
  switch (b.dataset.ed) {
    case 'cancel': dlg.close(); draft = null; return;
    case 'preset': {
      const p = PRESETS[b.dataset.i];
      d.name = p.name; d.emoji = p.emoji;
      d.checklist = p.items.map((text) => ({ id: uid(), text }));
      break;
    }
    case 'color': d.color = b.dataset.c; break;
    case 'recurring': d.recurring = b.dataset.v === '1'; break;
    case 'support': setLevel(d, Number(b.dataset.v)); break;
    case 'day': {
      const n = Number(b.dataset.n);
      d.days = d.days.includes(n) ? d.days.filter((x) => x !== n) : [...d.days, n];
      break;
    }
    case 'up': {
      const i = Number(b.dataset.i);
      [d.checklist[i - 1], d.checklist[i]] = [d.checklist[i], d.checklist[i - 1]];
      break;
    }
    case 'rm': d.checklist.splice(Number(b.dataset.i), 1); break;
    case 'ics':
      if (d.time) d.leaveBy = fromMin(leaveMin(d));
      exportIcs([d], `${d.name || 'activity'}.ics`);
      return;
    case 'delete':
      if (!confirm(`Delete “${d.name}”?`)) return;
      state.activities = state.activities.filter((a) => a.id !== d.id);
      for (const bag of [state.checks, state.extras, state.skips, state.started, state.log]) {
        for (const k of Object.keys(bag)) if (k.startsWith(d.id + '|')) delete bag[k];
      }
      save(); dlg.close(); draft = null; render();
      return;
    case 'save': {
      d.name = d.name.trim();
      d.emoji = d.emoji.trim() || '⭐';
      if (!d.name) { alert('Give the activity a name.'); return; }
      if (d.recurring && !d.days.length) { alert('Pick at least one day.'); return; }
      if (!d.recurring && !d.date) { alert('Pick a date.'); return; }
      if (!d.time) { alert('Set the start time.'); return; }
      if (leaveMin(d) - num(d.readyMins) < 0) { alert('That plan starts before midnight. Check the times.'); return; }
      d.leaveBy = fromMin(leaveMin(d));
      const i = state.activities.findIndex((a) => a.id === d.id);
      if (i >= 0) state.activities[i] = d; else state.activities.push(d);
      save(); dlg.close(); draft = null;
      if (isNew && tab === 'more') location.hash = '#activities';
      render();
      return;
    }
  }
  renderEditor();
});

// ---------- main view events ----------
view.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act === 'check') {
    const key = t.dataset.key;
    const set = new Set(state.checks[key] || []);
    t.checked ? set.add(t.dataset.item) : set.delete(t.dataset.item);
    state.checks[key] = [...set];
    // Checking the first item on the day counts as starting to get ready, unless it's hours early.
    const o = occFromKey(key);
    if (t.checked && !state.started[key] && o.k === dkey(new Date()) && nowMin() >= toMin(o.a.leaveBy) - 120) {
      state.started[key] = Date.now();
    }
    save(); render();
  } else if (t.dataset.act === 'review') {
    const wk = t.dataset.week;
    const set = new Set(state.review[wk] || []);
    t.checked ? set.add(t.dataset.item) : set.delete(t.dataset.item);
    state.review[wk] = [...set];
    save(); render();
  } else if (t.id === 'restore-file' && t.files[0]) {
    restore(t.files[0]);
  }
});

view.addEventListener('input', (e) => {
  const k = e.target.dataset.setting;
  if (k) { state.settings[k] = Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)); save(); }
});

view.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'name') {
    state.settings.name = f.elements.name.value.trim() || 'Harper';
    save(); f.elements.name.blur(); render();
    return;
  }
  const text = f.elements.text.value.trim();
  if (!text) return;
  if (f.dataset.form === 'extra') {
    (state.extras[f.dataset.key] ||= []).push({ id: uid(), text });
  } else if (f.dataset.form === 'forgot') {
    byId(f.dataset.id).checklist.push({ id: uid(), text });
    alert(`Added “${text}” to the list for next time 👍`);
  }
  save(); render();
});

view.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || ['check', 'review'].includes(b.dataset.act)) return;
  const key = b.dataset.key;
  switch (b.dataset.act) {
    case 'new': openEditor(); break;
    case 'new-once': openEditor(null, { recurring: false }); break;
    case 'edit': openEditor(b.dataset.id); break;
    case 'rmextra':
      state.extras[key] = (state.extras[key] || []).filter((x) => x.id !== b.dataset.item);
      save(); render(); break;
    case 'skip':
      if (state.skips[key]) delete state.skips[key]; else state.skips[key] = true;
      save(); render(); break;
    case 'bring': {
      const o = occFromKey(key);
      const day = fromKey(o.k).toLocaleDateString(undefined, { weekday: 'long' });
      const text = prompt(`What do you need to bring to ${o.a.name} on ${day}?`)?.trim();
      if (text) { (state.extras[key] ||= []).push({ id: uid(), text }); save(); render(); }
      break;
    }
    case 'start': state.started[key] = Date.now(); save(); render(); break;
    case 'level': setLevel(byId(b.dataset.id), Number(b.dataset.v)); save(); render(); break;
    case 'level-no': byId(b.dataset.id).supportSince = dkey(new Date()); save(); render(); break;
    case 'ics-stale': exportIcs(state.activities.filter((a) => a.calendarStale), 'updated-activities.ics'); break;
    case 'use-est': {
      const a = byId(b.dataset.id);
      a.readyMins = Number(b.dataset.v);
      save(); render(); break;
    }
    case 'undo': delete state.log[key]; save(); render(); break;
    case 'go': goOut(key); break;
    case 'ics-all': exportIcs(state.activities, 'activities.ics'); break;
    case 'backup': backup(); break;
    case 'restore': $('#restore-file').click(); break;
  }
});

function setLevel(a, n) {
  if (level(a) === n) return;
  a.support = n;
  a.supportSince = dkey(new Date());
  if (a.calendarSynced) a.calendarStale = true;
}

function goOut(key) {
  const o = occFromKey(key);
  const items = itemsFor(o), checked = checkedFor(o);
  const missing = items.filter((i) => !checked.has(i.id));
  if (missing.length && !confirm(`Wait! You haven't checked:\n\n• ${missing.map((i) => i.text).join('\n• ')}\n\nGo anyway?`)) return;
  const at = nowHHMM();
  const started = state.started[key];
  let took = started ? Math.round((Date.now() - started) / 60000) : null;
  if (took != null && took > MAX_READY_MINS) took = null;
  state.log[key] = { at, onTime: toMin(at) <= toMin(o.a.leaveBy), allReady: !missing.length, guess: num(o.a.readyMins), took };
  save(); render();
}

// ---------- calendar export (.ics) ----------
function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
// RFC 5545 lines max out at 75 bytes; continuation lines start with a space.
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', len = 0;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function firstDate(a) {
  if (!a.recurring) return fromKey(a.date);
  for (let i = 0; i < 7; i++) { const d = addDays(new Date(), i); if (a.days.includes(d.getDay())) return d; }
}
function buildIcs(acts) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Harpers Activities//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const a of acts) {
    const d = firstDate(a);
    const start = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${a.time.replace(':', '')}00`;
    const toLeave = toMin(a.time) - toMin(a.leaveBy);
    const toReady = toMin(a.time) - readyAt(a);
    const desc = [
      `Leave home by ${fmt(a.leaveBy)} (${num(a.travelMins)} min trip + ${num(a.bufferMins)} min extra)`, '',
      ...(a.checklist.length ? ['Getting ready:', ...a.checklist.map((i) => `• ${i.text}`)] : []),
      ...(a.notes ? ['', a.notes] : []),
    ].join('\n');
    L.push('BEGIN:VEVENT', `UID:${a.id}@harpers-activities`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, `DURATION:PT${num(a.durationMins) || 60}M`);
    if (a.recurring) L.push(`RRULE:FREQ=WEEKLY;BYDAY=${[...new Set(a.days)].map((n) => ICS_DAY[n]).join(',')}`);
    L.push(`SUMMARY:${icsText(`${a.emoji} ${a.name}`)}`, `DESCRIPTION:${icsText(desc)}`);
    const toWrap = toMin(a.time) - wrapAt(a);
    if (level(a) === 1 && toWrap > toReady) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Wrap up what you're doing. Getting ready for ${a.name} in ${toWrap - toReady} min`)}`, `TRIGGER:-PT${toWrap}M`, 'END:VALARM');
    }
    if (level(a) <= 2 && num(a.readyMins) > 0 && toReady >= 0) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Start getting ready for ${a.name}`)}`, `TRIGGER:-PT${toReady}M`, 'END:VALARM');
    }
    if (toLeave >= 0) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Time to leave for ${a.name}!`)}`, `TRIGGER:-PT${toLeave}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
function exportIcs(acts, filename) {
  for (const a of acts) { a.calendarSynced = true; a.calendarStale = false; }
  save(); render();
  shareFile(new File([buildIcs(acts)], filename.replace(/[\\/:*?"<>|]/g, ''), { type: 'text/calendar' }));
}

// ---------- backup ----------
function backup() {
  const name = `harpers-activities-backup-${dkey(new Date())}.json`;
  shareFile(new File([JSON.stringify(state, null, 2)], name, { type: 'application/json' }));
}
async function restore(file) {
  try {
    const s = JSON.parse(await file.text());
    if (!s || !Array.isArray(s.activities)) throw new Error('That file isn’t a backup from this app.');
    if (!confirm(`Replace everything with this backup (${s.activities.length} activities)?`)) return;
    state = migrate(s);
    save(); render();
  } catch (err) {
    alert('Could not restore: ' + err.message);
  }
}

// iOS home-screen apps handle the share sheet better than downloads.
async function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- boot ----------
window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dlg.open) render(); });
// Keep countdowns fresh, but never re-render under someone's typing.
setInterval(() => {
  if (tab === 'today' && !dlg.open && !document.activeElement?.matches('input, textarea')) render();
}, 30000);
setInterval(tickCountdown, 1000);
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
