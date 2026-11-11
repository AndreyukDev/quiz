(() => {
'use strict';

const {blocks, questions} = window.QUIZ;
const VERSION = window.QUIZ_VERSION || 'dev';
const app = document.getElementById('app');

// ---------- хранилище и Лейтнер ----------
const KEY = 'quiz.v1';
const DAY = 86400000;
// интервал по номеру коробки (дни); 1-я — каждую сессию
const INTERVAL_DAYS = [0, 0, 3, 7, 14, 30];
const SIZES = [5, 10, 12, 15, 20];

function defaults() { return {progress: {}, settings: {size: 12, pick: null}}; }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.progress === 'object') return {...defaults(), ...s, settings: {...defaults().settings, ...s.settings}};
  } catch (e) { /* битое хранилище — начинаем заново */ }
  return defaults();
}
let store = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch (e) { toast('Не удалось сохранить прогресс'); }
}
const P = q => store.progress[q.id];

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dueFor(box, now) {
  const days = INTERVAL_DAYS[box];
  return days ? startOfDay(now) + days * DAY : now; // к полуночи N-го дня: час ответа не важен
}

// res: 'ok' | 'bad' | 'partial'
function grade(q, res) {
  const now = Date.now();
  const p = store.progress[q.id] || {b: 0, n: 0, w: 0};
  const cur = Math.max(1, p.b);
  const box = res === 'ok' ? Math.min(5, cur + 1) : res === 'bad' ? 1 : cur;
  store.progress[q.id] = {b: box, d: dueFor(box, now), n: p.n + 1, w: p.w + (res === 'bad' ? 1 : 0), l: now};
  save();
}

// ---------- утилиты ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const blockById = new Map(blocks.map(b => [b.id, b]));
const codeText = c => Array.isArray(c.text) ? c.text.join('\n') : c.text;

function inline(s) {
  return s.split(/(`[^`\n]+`)/).map(part =>
    part.length > 1 && part[0] === '`' && part[part.length - 1] === '`'
      ? `<code>${esc(part.slice(1, -1))}</code>`
      : esc(part).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  ).join('');
}
// мини-markdown: каждая строка — абзац, строки "- " — список, `код`, **жирный**
function md(text) {
  let html = '', list = false;
  for (const line of text.trim().split('\n')) {
    const m = line.match(/^\s*[-•]\s+(.*)$/);
    if (m) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(m[1])}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  return list ? html + '</ul>' : html;
}

function fmtDue(t) {
  if (t == null) return '—';
  const now = Date.now();
  if (t <= now) return 'сейчас';
  const days = Math.round((startOfDay(t) - startOfDay(now)) / DAY);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days < 7) return `через ${days} дн.`;
  return new Date(t).toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ---------- подсветка кода ----------
const NUM = /\b(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)[lLfFdD]?\b/;
const C_COM = /\/\/.*|\/\*[\s\S]*?\*\//;
const C_STR = /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/;
const TYPE = /\b[A-Z][A-Za-z0-9_]*\b/;
const kw = words => new RegExp('\\b(?:' + words.split(/\s+/).sort((a, b) => b.length - a.length).join('|') + ')\\b');
const JAVA_KW = 'abstract assert boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed non-sealed permits yield when true false null';
const KOTLIN_KW = 'as break by class companion const continue data do else enum false for fun if in init inline interface internal is lateinit null object open operator out override private protected public reified return sealed super suspend this throw true try typealias val var vararg when where while';
const JS_KW = 'async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield';
const TS_KW = JS_KW + ' abstract any as boolean declare enum implements interface keyof namespace never number private protected public readonly string type unknown';
const SQL_KW = 'select from where and or not in is null like between join inner left right full outer cross on using group by having order asc desc limit offset insert into values update set delete create table index unique primary key foreign references alter drop add column view as distinct case when then else end union all exists with recursive returning begin commit rollback transaction isolation level read committed repeatable serializable for share nowait skip locked lateral over partition window count sum avg min max coalesce true false default constraint check';
const BASH_KW = 'if then else elif fi for while until do done case esac in function return local export readonly echo exit set unset source';

function spec(rules, flags = 'gm') {
  return {cls: rules.map(r => r[0]), re: new RegExp(rules.map(r => '(' + r[1].source + ')').join('|'), flags)};
}
const SPECS = {
  java: spec([['com', C_COM], ['str', C_STR], ['ann', /@[A-Za-z_][\w.]*/], ['num', NUM], ['kw', kw(JAVA_KW)], ['type', TYPE]]),
  kotlin: spec([['com', C_COM], ['str', C_STR], ['ann', /@[A-Za-z_][\w.]*/], ['num', NUM], ['kw', kw(KOTLIN_KW)], ['type', TYPE]]),
  js: spec([['com', C_COM], ['str', /`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/], ['num', NUM], ['kw', kw(JS_KW)], ['type', TYPE]]),
  ts: spec([['com', C_COM], ['str', /`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/], ['ann', /@[A-Za-z_]\w*/], ['num', NUM], ['kw', kw(TS_KW)], ['type', TYPE]]),
  sql: spec([['com', /--.*|\/\*[\s\S]*?\*\//], ['str', /'(?:''|[^'])*'/], ['num', NUM], ['kw', kw(SQL_KW)]], 'gim'),
  yaml: spec([['str', /"(?:\\.|[^"\\\n])*"|'(?:''|[^'\n])*'/], ['com', /#.*/], ['attr', /[\w.\-]+(?=\s*:(?:\s|$))/], ['num', NUM], ['kw', /\b(?:true|false|null|yes|no|on|off)\b/]]),
  bash: spec([['com', /(?:^|\s)#.*/], ['str', /"(?:\\.|[^"\\])*"|'[^']*'/], ['attr', /\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9@#?$!*-]/], ['num', NUM], ['kw', kw(BASH_KW)]]),
  json: spec([['attr', /"(?:\\.|[^"\\\n])*"(?=\s*:)/], ['str', /"(?:\\.|[^"\\\n])*"/], ['num', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/], ['kw', /\b(?:true|false|null)\b/]]),
};
function highlight(text, lang) {
  const s = SPECS[lang];
  if (!s) return esc(text);
  const re = new RegExp(s.re.source, s.re.flags);
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    if (!m[0]) { re.lastIndex++; continue; }
    let gi = 1;
    while (m[gi] === undefined) gi++;
    out += esc(text.slice(last, m.index)) + `<span class="t-${s.cls[gi - 1]}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}
function codeBlock(q) {
  const text = codeText(q.code);
  const note = q.type === 'output' && q.code.lang === 'java' && !text.includes('static void main')
    ? '<div class="code-note">Фрагмент внутри <code>main</code>; стандартные импорты (<code>java.util.*</code> и т. п.) опущены. Java 21.</div>' : '';
  return `<pre class="code">${highlight(text, q.code.lang)}</pre>${note || '<div style="height:8px"></div>'}`;
}

// ---------- маршрутизация и события ----------
let handlers = {}, keys = null;
app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && handlers[el.dataset.act]) handlers[el.dataset.act](el, e);
});
document.addEventListener('keydown', e => {
  if (keys && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) keys(e);
});
app.addEventListener('change', e => {
  if (e.target.id === 'size') { store.settings.size = +e.target.value; save(); render(); }
});
function view(html, h = {}, k = null) {
  app.innerHTML = html; handlers = h; keys = k;
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function render() {
  const h = location.hash || '#/';
  if (h === '#/q') renderQuiz();
  else if (h === '#/stats') renderStats();
  else if (h === '#/backup') renderBackup();
  else renderHome();
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- выборка сессии ----------
// sel: id блока, массив id или null (все блоки)
function blockQuestions(sel) {
  if (!sel) return questions;
  const set = new Set([].concat(sel));
  return questions.filter(q => set.has(q.block));
}
// выбранные для случайного режима блоки (по умолчанию — все)
function picked() {
  const ids = (store.settings.pick || blocks.map(b => b.id)).filter(id => blockById.has(id));
  return ids;
}
function counts(qs) {
  const now = Date.now();
  const c = {total: qs.length, fresh: 0, due: 0, learned: 0, next: null, boxes: [0, 0, 0, 0, 0, 0], n: 0, w: 0};
  for (const q of qs) {
    const p = P(q);
    if (!p) { c.fresh++; c.boxes[0]++; continue; }
    c.boxes[p.b]++; c.n += p.n; c.w += p.w;
    if (p.b >= 4) c.learned++;
    if (p.d <= now) c.due++;
    else if (c.next === null || p.d < c.next) c.next = p.d;
  }
  return c;
}

let session = null;
// random: случайные карточки из выбранных блоков без учёта расписания; ответы всё равно двигают коробки
function startSession(blockId, early = false, random = false) {
  const now = Date.now(), size = store.settings.size;
  if (random) {
    session = {blockId, items: shuffle(blockQuestions(blockId).slice()).slice(0, size), i: 0, state: [], early, random};
    go('#/q');
    return;
  }
  const due = [], fresh = [], later = [];
  for (const q of blockQuestions(blockId)) {
    const p = P(q);
    if (!p) fresh.push(q); else if (p.d <= now) due.push(q); else later.push(q);
  }
  due.sort((a, b) => P(a).b - P(b).b || P(a).d - P(b).d);
  let items = due.concat(shuffle(fresh)).slice(0, size);
  if (!items.length && early) items = later.sort((a, b) => P(a).d - P(b).d).slice(0, size);
  session = {blockId, items: shuffle(items), i: 0, state: [], early};
  go('#/q');
}

// ---------- экраны ----------
function renderHome() {
  const all = counts(questions);
  const pick = picked(), pickN = blockQuestions(pick).length;
  const blockRows = blocks.map(b => {
    const c = counts(blockQuestions(b.id));
    const badge = c.due ? `<span class="badge">${c.due}</span>` : `<span class="badge zero">${c.fresh ? 'новые' : '✓'}</span>`;
    return `<button class="btn block" data-act="block" data-id="${esc(b.id)}">
      <span class="ico">${esc(b.icon)}</span>
      <span class="meta"><span class="title">${esc(b.title)}</span><br>
      <span class="muted">${c.total} карт. · новых ${c.fresh} · выучено ${c.learned}</span></span>${badge}</button>`;
  }).join('');
  view(`<div class="fade">
    <h1>Теория в тонусе</h1>
    <button class="btn primary" data-act="mix">Микс недели · ${Math.min(store.settings.size, all.due + all.fresh) || 'всё повторено'}</button>
    <p class="muted">К повторению: ${all.due} · новых: ${all.fresh} · выучено: ${all.learned} из ${all.total}</p>
    <h2>Блоки</h2>${blockRows}
    <div class="card"><div class="muted" style="margin-bottom:8px">Случайный режим: вопросы вперемешку из отмеченных разделов, без учёта расписания</div>
      <div class="chips">${blocks.map(b => `<button class="chip${pick.includes(b.id) ? ' on' : ''}" data-act="toggle" data-id="${esc(b.id)}" aria-pressed="${pick.includes(b.id)}">${esc(b.icon)} ${esc(b.title)}</button>`).join('')}</div>
      <button class="btn" data-act="random" style="text-align:center;margin:12px 0 0"${pickN ? '' : ' disabled'}>🎲 Случайно · ${pickN ? pickN + ' карт.' : 'отметь разделы'}</button></div>
    <div class="card settings"><span>Карточек в сессии</span>
      <select id="size">${SIZES.map(s => `<option${s === store.settings.size ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="row"><button class="btn ghost" data-act="stats">📊 Статистика</button><button class="btn ghost" data-act="backup">💾 Копия</button></div>
    <p class="muted" style="text-align:center">версия ${esc(VERSION)}</p></div>`, {
    mix: () => startSession(null),
    block: el => startSession(el.dataset.id),
    toggle: el => {
      const id = el.dataset.id, cur = picked();
      store.settings.pick = cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id);
      save(); render();
    },
    random: () => { if (pick.length) startSession(pick, false, true); },
    stats: () => go('#/stats'),
    backup: () => go('#/backup'),
  });
}

const TYPE_LABEL = {mcq: 'выбор', output: 'что напечатает', tf: 'верно/неверно', recall: 'объясни сам'};

function renderQuiz() {
  const s = session;
  if (!s) { go('#/'); return; }
  if (!s.items.length) return renderEmpty();
  if (s.i >= s.items.length) return renderDone();
  const q = s.items[s.i];
  // состояние карточки живёт в сессии: при возврате назад — тот же порядок вариантов и тот же ответ
  const st = s.state[s.i] || (s.state[s.i] = {});
  let opts = '';
  if (q.type === 'mcq' || q.type === 'output') {
    st.order = st.order || shuffle(q.options.map((_, i) => i));
    const cls = q.type === 'output' ? ' opt-code' : '';
    opts = st.order.map((oi, k) => `<button class="btn opt" data-act="pick" data-i="${oi}" data-k="${k}"><span class="${cls}">${q.type === 'output' ? esc(q.options[oi]) : inline(q.options[oi])}</span></button>`).join('');
  } else if (q.type === 'tf') {
    opts = `<div class="row"><button class="btn opt" data-act="tf" data-v="true" style="text-align:center">Верно</button><button class="btn opt" data-act="tf" data-v="false" style="text-align:center">Неверно</button></div>`;
  } else {
    opts = `<button class="btn primary" data-act="show">Показать ответ</button>`;
  }
  const b = blockById.get(q.block);
  view(`<div class="top"><button class="x" data-act="quit" aria-label="Выйти">✕</button>
      <button class="nav" data-act="prev" aria-label="Назад"${s.i ? '' : ' disabled'}>‹</button>
      <div class="bar"><i style="width:${s.i / s.items.length * 100}%"></i></div><div class="count">${s.i + 1}/${s.items.length}</div>
      <button class="nav" data-act="next" aria-label="Вперёд">›</button></div>
    <section class="card fade">
      <div class="topic">${b ? esc(b.icon) + ' ' : ''}<b>${esc(q.num)}</b> · ${esc(q.topic)} · ${TYPE_LABEL[q.type]}</div>
      <div class="q">${md(q.question)}</div>
      ${q.code ? codeBlock(q) : ''}
      <div id="opts">${opts}</div>
      <div id="fb"></div>
    </section>`, {
    quit: () => { session = null; go('#/'); },
    pick: el => answer(q, el.dataset.i),
    tf: el => answer(q, el.dataset.v),
    show: () => { st.shown = true; reveal(q, st); },
    rate: el => { if (st.res) return; st.res = el.dataset.r; grade(q, st.res); next(); },
    prev: () => prev(),
    next: () => next(),
  }, e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); return prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); return next(); }
    const btns = [...app.querySelectorAll('#opts .btn, #fb [data-act="rate"]')].filter(x => !x.disabled);
    const nextBtn = app.querySelector('#fb [data-act="next"]');
    if ((e.key === 'Enter' || e.key === ' ') && (nextBtn || app.querySelector('[data-act="show"]'))) {
      e.preventDefault(); (nextBtn || app.querySelector('[data-act="show"]')).click();
    } else if (/^[1-9]$/.test(e.key) && btns[+e.key - 1]) btns[+e.key - 1].click();
  });
  // вернулись к уже отвеченной карточке — показываем ответ как было, без повторной оценки
  if (st.pick !== undefined) showAnswer(q, st, false);
  else if (st.shown) reveal(q, st, false);
}

// «вперёд» на неотвеченной карточке — пропуск: в прогресс она не попадает, к ней можно вернуться
function next() { session.i++; render(); window.scrollTo(0, 0); }
function prev() { if (session.i > 0) { session.i--; render(); window.scrollTo(0, 0); } }

function sourcesHtml(q) {
  return `<div class="sources">Источники: ${q.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</div>`;
}

// pick — data-i варианта (mcq/output) или data-v ('true'/'false') для tf
function answer(q, pick) {
  const st = session.state[session.i];
  if (st.pick !== undefined) return;
  st.pick = pick;
  st.res = isRight(q, pick) ? 'ok' : 'bad';
  grade(q, st.res);
  showAnswer(q, st, true);
}
function isRight(q, pick) { return q.type === 'tf' ? (pick === 'true') === q.answer : +pick === q.answer; }

function showAnswer(q, st, scroll) {
  for (const btn of app.querySelectorAll('#opts .opt')) {
    const v = q.type === 'tf' ? btn.dataset.v : btn.dataset.i;
    btn.disabled = true;
    btn.classList.add(isRight(q, v) ? 'ok' : v === st.pick ? 'bad' : 'dim');
  }
  const ok = st.res === 'ok';
  const tfNote = q.type === 'tf' ? ` — утверждение ${q.answer ? 'верное' : 'ложное'}` : '';
  feedback(`<div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ Верно' : '✗ Неверно'}${tfNote}</div>
    <div class="expl">${md(q.explanation)}${sourcesHtml(q)}</div>
    <button class="btn primary" data-act="next">${session.i + 1 < session.items.length ? 'Дальше' : 'Итоги'}</button>`, scroll);
}

const RATES = [['bad', 'Не знал'], ['partial', 'Частично'], ['ok', 'Знал']];
function reveal(q, st, scroll = true) {
  app.querySelector('#opts').innerHTML = '';
  const rates = st.res
    ? RATES.map(([r, t]) => `<button class="btn ${r === st.res ? (r === 'ok' ? 'ok' : 'bad') : 'dim'}" disabled style="text-align:center">${t}</button>`).join('')
    : RATES.map(([r, t]) => `<button class="btn" data-act="rate" data-r="${r}" style="text-align:center">${t}</button>`).join('');
  feedback(`<div class="answer-text">${md(q.answer_text)}</div>
    <div class="expl">${md(q.explanation)}${sourcesHtml(q)}</div>
    <p class="muted" style="text-align:center;margin:0 0 8px">Как ответил?</p>
    <div class="row">${rates}</div>
    ${st.res ? `<button class="btn primary" data-act="next">${session.i + 1 < session.items.length ? 'Дальше' : 'Итоги'}</button>` : ''}`, scroll);
}

function feedback(html, scroll = true) {
  const fb = app.querySelector('#fb');
  fb.innerHTML = scroll ? `<div class="fade">${html}</div>` : html;
  if (scroll) fb.scrollIntoView({behavior: 'smooth', block: 'nearest'});
}

function renderEmpty() {
  const c = counts(blockQuestions(session.blockId));
  view(`<div class="card fade" style="text-align:center">
      <div class="big">✓</div><h2>Всё повторено</h2>
      <p class="muted">Ближайшее повторение: ${fmtDue(c.next)}</p>
      <button class="btn primary" data-act="early">Повторить досрочно</button>
      <button class="btn ghost" data-act="home">Домой</button></div>`, {
    early: () => startSession(session.blockId, true),
    home: () => { session = null; go('#/'); },
  });
}

function renderDone() {
  const r = session.items.map((q, i) => ({q, res: session.state[i] && session.state[i].res})).filter(x => x.res);
  const skipped = session.items.length - r.length;
  const ok = r.filter(x => x.res === 'ok').length;
  const mark = {ok: '✓', bad: '✗', partial: '≈'};
  const short = t => { const s = t.replace(/[`*]/g, ''); return s.length > 70 ? s.slice(0, 70) + '…' : s; };
  view(`<div class="card fade">
      <div class="big">${ok}/${r.length}</div>
      <p class="muted" style="text-align:center">${session.random ? 'Ответы учтены в прогрессе: ошибки уходят в коробку 1.' : 'Ошибки вернутся в следующей сессии, верные — позже.'}${skipped ? ` Пропущено: ${skipped}.` : ''}</p>
      <ul class="result-list">${r.map(x => `<li>${mark[x.res]} ${esc(x.q.num)} <b>${esc(x.q.topic)}</b> — ${esc(short(x.q.question))}</li>`).join('')}</ul>
    </div>
    ${skipped ? `<button class="btn" data-act="back" style="text-align:center">‹ К пропущенным</button>` : ''}
    <button class="btn primary" data-act="again">Ещё сессия</button>
    <button class="btn ghost" data-act="home">Домой</button>`, {
    back: () => { session.i = session.items.findIndex((_, i) => !(session.state[i] && session.state[i].res)); render(); window.scrollTo(0, 0); },
    again: () => startSession(session.blockId, false, session.random),
    home: () => { session = null; go('#/'); },
  }, e => { if (e.key === 'Enter') { e.preventDefault(); startSession(session.blockId, false, session.random); } });
}

const BOX_COLORS = ['var(--line)', 'var(--bad)', '#f97316', '#eab308', '#84cc16', 'var(--ok)'];
const BOX_NAMES = ['новые', 'коробка 1', '2', '3', '4', '5'];
function boxesBar(c) {
  return `<div class="boxes">${c.boxes.map((n, i) => n ? `<i style="width:${n / c.total * 100}%;background:${BOX_COLORS[i]}"></i>` : '').join('')}</div>`;
}

function renderStats() {
  const all = counts(questions);
  const legend = `<div class="legend">${BOX_NAMES.map((n, i) => `<span style="--c:${BOX_COLORS[i]}">${n}</span>`).join('')}</div>`;
  const rows = blocks.map(b => {
    const qs = blockQuestions(b.id);
    const c = counts(qs);
    const topics = new Map();
    for (const q of qs) {
      const p = P(q);
      if (!p) continue;
      const t = topics.get(q.topic) || {n: 0, w: 0, weak: 0};
      t.n += p.n; t.w += p.w; if (p.b <= 2) t.weak++;
      topics.set(q.topic, t);
    }
    const weak = [...topics.entries()].filter(([, t]) => t.w > 0).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n).slice(0, 5);
    const acc = c.n ? Math.round((1 - c.w / c.n) * 100) + '%' : '—';
    return `<div class="card"><div class="title" style="font-weight:600">${esc(b.icon)} ${esc(b.title)}</div>
      ${boxesBar(c)}
      <table><tr><th>выучено (4–5)</th><td class="n">${c.learned}/${c.total}</td></tr>
      <tr><th>к повторению сейчас</th><td class="n">${c.due}</td></tr>
      <tr><th>новых</th><td class="n">${c.fresh}</td></tr>
      <tr><th>точность ответов</th><td class="n">${acc}</td></tr>
      <tr><th>следующее повторение</th><td class="n">${c.due ? 'сейчас' : fmtDue(c.next)}</td></tr></table>
      ${weak.length ? `<h2 style="font-size:15px">Где ошибки</h2><table><tr><th>тема</th><th class="n">ошибок</th><th class="n">слабых карт.</th></tr>
        ${weak.map(([name, t]) => `<tr><td>${esc(name)}</td><td class="n">${t.w}/${t.n}</td><td class="n">${t.weak}</td></tr>`).join('')}</table>` : ''}
    </div>`;
  }).join('');
  view(`<div class="fade"><div class="top"><button class="x" data-act="home" aria-label="Назад">←</button><h1 style="margin:0">Статистика</h1></div>
    <div class="card">Всего: выучено ${all.learned} из ${all.total}, к повторению ${all.due}, новых ${all.fresh}${boxesBar(all)}${legend}</div>
    ${rows}</div>`, {home: () => go('#/')});
}

// ---------- экспорт / импорт ----------
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s+/g, '')), c => c.charCodeAt(0)));
}

function renderBackup() {
  const code = toB64(JSON.stringify({v: 1, progress: store.progress, settings: store.settings}));
  view(`<div class="fade"><div class="top"><button class="x" data-act="home" aria-label="Назад">←</button><h1 style="margin:0">Резервная копия</h1></div>
    <div class="card"><h2 style="margin-top:0">Экспорт</h2>
      <p class="muted">Прогресс одной строкой. Сохрани в заметки: localStorage на телефоне иногда очищается.</p>
      <textarea id="exp" readonly>${esc(code)}</textarea>
      <button class="btn primary" data-act="copy">Скопировать</button></div>
    <div class="card"><h2 style="margin-top:0">Импорт</h2>
      <textarea id="imp" placeholder="Вставь строку экспорта"></textarea>
      <button class="btn" data-act="import" style="text-align:center">Импортировать (заменит текущий прогресс)</button></div>
    <button class="btn ghost" data-act="reset" style="color:var(--bad)">Сбросить весь прогресс</button></div>`, {
    home: () => go('#/'),
    copy: () => {
      const ta = app.querySelector('#exp');
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject())
        .then(() => toast('Скопировано'))
        .catch(() => { ta.select(); document.execCommand('copy'); toast('Скопировано'); });
    },
    import: () => {
      const raw = app.querySelector('#imp').value.trim();
      if (!raw) return;
      let data;
      try { data = JSON.parse(fromB64(raw)); } catch (e) { toast('Строка не распознана'); return; }
      if (!data || typeof data.progress !== 'object') { toast('В строке нет прогресса'); return; }
      const n = Object.keys(data.progress).length;
      if (!confirm(`Заменить текущий прогресс импортированным (${n} карт.)?`)) return;
      store = {progress: data.progress, settings: {...defaults().settings, ...(data.settings || {})}};
      save(); toast(`Импортировано: ${n} карт.`); go('#/');
    },
    reset: () => {
      if (!confirm('Стереть весь прогресс? Сначала сделай экспорт, если он нужен.')) return;
      store = defaults(); save(); toast('Прогресс сброшен'); go('#/');
    },
  });
}

// ---------- старт ----------
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
