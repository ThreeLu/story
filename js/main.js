import { GitHub, GitHubError } from './github.js';
import { Store, newId, diff, apply as applyPatch } from './store.js';
import {
  defaultData, todayKey, dateText, shortDate, parseDate, dateStart, yearOf, stageRange, stageYears, stageOfDate, eventStage,
  sortEvents, timelineItems, resumeTitle, stageFill, suggestTopic, onThisDay, firstLine, sortVersions, latestVersion, versionWhen,
  applyAbout, yearsSpan, yearItems, yearStats, storyDigest, splitSections,
  STAGE_FIELDS, EVENT_KINDS, ABOUT_SECS, RESUME_KINDS, STAGE_GROUP, PEOPLE_GROUPS,
} from './story.js';
import { talkPrompt, yearPrompt, TALK_STEPS } from './content.js';
import { h } from './util.js';
import { askJson } from './ai.js';
import { icon } from './icons.js';
import { personPicker } from './picker.js';

const SETTINGS_KEY = 'story-settings';
const DEFAULT_REPO = 'ThreeLu/story-data';
const LIFE_SITE = 'https://threelu.github.io/life/';
const EDITING_ROUTES = /^\/(talk\/go|event\/new|event\/[^/]+\/edit|stage\/[^/]+\/edit|diary\/new|diary\/[^/]+\/edit|profile)/;

const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 存不了就算了 */ } };

const view = document.getElementById('view');
const nav = document.getElementById('nav');
let settings = readSettings();
let gh = null;
let store = null;
let loadError = null;

// ---------- 启动 ----------

function readSettings() {
  let s = readJson(SETTINGS_KEY);
  // 和另外三个网站在同一个网址下（threelu.github.io），令牌直接用那边的（要额外授权 story-data 仓库）
  if (!s.token) {
    for (const key of ['life-settings', 'inventory-settings', 'ledger-settings']) {
      const other = readJson(key);
      if (other.token) { s = { ...s, token: other.token, shared: true }; break; }
    }
  }
  return s;
}
const owner = () => (settings.repo || DEFAULT_REPO).split('/')[0];

function connect() {
  gh = new GitHub({ token: settings.token, repo: settings.repo || DEFAULT_REPO });
  store = new Store(gh);
  store.onStatus = showSync;
  store.loadCached();
  showSync(store.status);
}

const syncPill = h('button', { class: 'sync-pill', type: 'button', hidden: true, onclick: () => {
  if (store?.status.state === 'error') toast(`上传失败：${store.status.error}（写的都还在手机上）`, 'error');
  store?.sync();
} });
let syncTimer = null;
let renderedData = '';
function showSync(st) {
  clearTimeout(syncTimer);
  const n = st.pending;
  const text = st.state === 'offline' ? `没网，${n} 项存在手机上，有网自动上传`
    : st.state === 'error' ? `${n} 项没传上去，点一下看看`
      : n ? `正在上传 ${n} 项` : '';
  const show = () => { syncPill.textContent = text; syncPill.hidden = !text; syncPill.className = `sync-pill ${st.state}`; };
  if (st.state === 'offline' || st.state === 'error' || !text) show();
  else syncTimer = setTimeout(show, 1500);
  if (st.state === 'ok' && store?.data && !EDITING_ROUTES.test(currentPath()) && JSON.stringify(store.data) !== renderedData) render();
}

const currentPath = () => window.location.hash.replace(/^#/, '').split('?')[0];

async function refresh() {
  const before = store.head;
  const hadData = Boolean(store.data);
  try {
    await store.load();
    loadError = null;
  } catch (e) {
    loadError = e;
  }
  if (!hadData || loadError || store.missing) render();
  else if (store.head !== before && !EDITING_ROUTES.test(currentPath())) render();
}

function boot() {
  for (const a of nav.querySelectorAll('a[data-icon]')) a.prepend(h('span', { class: 'tab-icon' }, icon(a.dataset.icon)));
  nav.querySelector('.plus').append(h('span', { class: 'circle' }, icon('mic')));
  nav.querySelector('.plus').addEventListener('click', () => go('#/talk'));
  document.body.append(syncPill);
  window.addEventListener('online', () => store?.sync());
  window.addEventListener('hashchange', () => {
    for (const el of document.querySelectorAll('.sheet-overlay')) el.remove();
    render();
    window.scrollTo(0, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store) refresh();
  });
  if (settings.token) {
    connect();
    render();
    refresh();
  } else {
    if (window.location.hash && window.location.hash !== '#/settings') sessionStorage.setItem('story-after-login', window.location.hash);
    go('#/settings', true);
  }
}

function go(hash, replace = false) {
  if (replace) { history.replaceState(null, '', hash); render(); } else window.location.hash = hash;
}

// ---------- 路由 ----------

const routes = [
  [/^\/?$/, () => homeView()],
  [/^\/timeline$/, (_, q) => timelineView(q)],
  [/^\/map$/, () => mapView()],
  [/^\/event\/new$/, (_, q) => eventEditView('new', q)],
  [/^\/event\/([^/]+)\/edit$/, (id) => eventEditView(id)],
  [/^\/event\/([^/]+)$/, (id) => eventView(id)],
  [/^\/stage\/([^/]+)\/edit$/, (id) => stageEditView(id)],
  [/^\/stage\/([^/]+)$/, (id) => stageView(id)],
  [/^\/thread\/([^/]+)$/, (id) => threadView(id)],
  [/^\/talk$/, () => talkListView()],
  [/^\/talk\/go$/, (_, q) => talkGoView(q)],
  [/^\/talk\/([^/]+)$/, (id) => talkView(id)],
  [/^\/about$/, () => aboutView()],
  [/^\/about\/([^/]+)$/, (id) => aboutEntryView(id)],
  [/^\/resume$/, () => resumeView()],
  [/^\/diary$/, () => diaryListView()],
  [/^\/diary\/new$/, () => diaryEditView('new')],
  [/^\/diary\/([^/]+)\/edit$/, (id) => diaryEditView(id)],
  [/^\/diary\/([^/]+)$/, (id) => diaryView(id)],
  [/^\/years$/, () => yearsView()],
  [/^\/year\/(\d{4})$/, (y) => yearView(Number(y))],
  [/^\/profile$/, () => profileView()],
  [/^\/more$/, () => moreView()],
  [/^\/settings$/, () => settingsView()],
];
const NAV_GROUPS = {
  '/': [/^\/?$/, /^\/stage\//, /^\/thread\//],
  '/timeline': [/^\/timeline/, /^\/event\//, /^\/map/],
  '/about': [/^\/about/],
  '/more': [/^\/more/, /^\/resume/, /^\/diary/, /^\/years?/, /^\/profile/, /^\/settings/],
};

function render() {
  const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?');
  const q = Object.fromEntries(new URLSearchParams(query));
  let content;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    if (re.source.includes('settings')) content = fn();
    else if (!settings.token) content = settingsView();
    else if (loadError && !store.data) content = errorView(loadError);
    else if (store.missing) content = setupView();
    else if (!store.data) content = h('p', { class: 'muted center' }, '正在读取…');
    else content = fn(m[1], q);
    break;
  }
  view.replaceChildren(content || notFound());
  if (path !== lastPath) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); lastPath = path; }
  renderedData = store?.data ? JSON.stringify(store.data) : '';
  for (const a of nav.querySelectorAll('a[href]')) {
    const target = a.getAttribute('href').slice(1);
    a.classList.toggle('active', (NAV_GROUPS[target] || []).some((re) => re.test(path)));
  }
}
let lastPath = null;

// ---------- 通用组件 ----------

function toast(message, kind = 'ok') {
  const el = h('div', { class: `toast ${kind}` }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 2500);
}

async function saving(message, fn) {
  const el = h('div', { class: 'busy' }, h('div', { class: 'busy-box' }, message));
  document.body.append(el);
  try {
    return await fn();
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  } finally {
    el.remove();
  }
}
// 先存手机、页面立刻更新、后台上传
async function save(message, fn, opts) {
  if (opts?.online) return saving('正在保存…', () => store.save(message, fn, opts));
  try {
    return await store.save(message, fn, opts);
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}
const saveRender = (message, fn) => save(message, fn).then(() => { render(); return true; }).catch(() => false);

function undoToast(text, onUndo) {
  for (const el of document.querySelectorAll('.toast.undo')) el.remove();
  const el = h('div', { class: 'toast undo', role: 'status' }, h('span', {}, text),
    h('button', { type: 'button', class: 'toast-undo', onclick: () => { el.remove(); onUndo(); } }, '撤销'));
  document.body.append(el);
  setTimeout(() => el.remove(), 6000);
}
async function saveUndoable(message, fn, doneText) {
  const before = structuredClone(store.data);
  const result = await save(message, fn);
  if (result === false) return result;
  const back = diff(store.data, before);
  undoToast(doneText, () => save(`撤销：${message}`, (data) => { applyPatch(data, back); }).then(() => { toast('已撤销'); render(); }).catch(() => {}));
  return result;
}

function errorView(e) {
  return h('div', {},
    header('我的故事'),
    h('div', { class: 'card' },
      h('p', {}, '读取失败：', e.message),
      e.status === 404 ? h('p', { class: 'small muted' }, '多半是令牌还没授权 story-data 仓库。到「设置」看怎么加。') : null,
      h('div', { class: 'actions' }, h('button', { onclick: refresh }, '重试'), h('a', { href: '#/settings', class: 'button secondary' }, '设置'))));
}
const notFound = () => h('div', { class: 'card' }, h('p', {}, '没有这个页面'), h('a', { href: '#/', class: 'button' }, '回到首页'));

function header(title, ...extra) {
  const actions = extra.filter(Boolean);
  return h('header', { class: 'page-head' }, h('div', {}, h('h1', {}, title)),
    actions.length ? h('div', { class: 'head-actions' }, actions) : null);
}
function headerSub(title, sub, ...actions) {
  const el = header(title, ...actions);
  if (sub) el.firstChild.append(h('div', { class: 'sub' }, sub));
  return el;
}
const back = (href, text = '返回') => h('a', { class: 'back', href }, '‹ ', text);

function cell({ href, onclick, ic, title, meta, sub }) {
  return h(href ? 'a' : 'button', { class: 'cell', href, onclick, type: href ? undefined : 'button' },
    ic ? h('span', { class: 'dot' }, icon(ic)) : null,
    h('span', { class: 'grow' }, title, sub ? h('span', { class: 'muted small block' }, sub) : null),
    meta ? h('span', { class: 'meta' }, meta) : null,
    icon('chev', 'i chev'));
}

function openSheet({ title, body, confirmText = '确定', cancelText = '取消', onConfirm, extra = null }) {
  const close = () => overlay.remove();
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('h3', {}, title),
      body,
      h('div', { class: 'actions' },
        confirmText ? h('button', { onclick: async () => { if ((await onConfirm()) !== false) close(); } }, confirmText) : null,
        cancelText ? h('button', { class: 'secondary', onclick: close }, cancelText) : null),
      extra));
  document.body.append(overlay);
  return close;
}

// 页面右上角的「?」：怎么用。sections = [[小标题, [一句一句]]]
function helpButton(title, sections) {
  return h('button', { class: 'icon-btn help-btn', 'aria-label': '怎么用', onclick: () => openSheet({
    title,
    body: h('div', { class: 'help' }, sections.map(([t, lines]) => [h('h4', {}, t), h('ul', {}, lines.map((l) => h('li', {}, l)))])),
    confirmText: '知道了', cancelText: null, onConfirm: () => {},
  }) }, '?');
}

// 一排选项，options = [[值, 显示]]；multi 时 value 是数组
function chipRow(label, options, value, onPick, { multi = false } = {}) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': label },
    options.map(([v, text]) => {
      const on = multi ? value.includes(v) : value === v;
      return h('button', {
        type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on),
        onclick: () => onPick(multi ? (on ? value.filter((x) => x !== v) : [...value, v]) : on ? null : v),
      }, text);
    }));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('复制好了，去 ChatGPT 里粘贴');
  } catch {
    toast('复制不了：长按上面的文字，全选后复制', 'error');
  }
}

const nowIso = () => new Date().toISOString();
const threadName = (id) => store.data.threads.find((t) => t.id === id)?.name || '';
const stageById = (id) => store.data.stages.find((s) => s.id === id);
function dateInput(value, label) {
  return h('input', { value: value || '', placeholder: '比如 2015、2015-9、2015-9-1', 'aria-label': label, inputmode: 'text' });
}
// 读日期输入框：空着返回 ''，认不出返回 null（并提示）
function readDate(input, what) {
  const t = input.value.trim();
  if (!t) return '';
  const d = parseDate(t);
  if (!d) toast(`${what}认不出来：写成 2015、2015-9 或 2015-9-1`, 'error');
  return d;
}

// ---------- 别的网站的数据 ----------

// 生活网站的「身边的人」：读一次存 5 分钟。人名、选人都用它；新认识的人也加到那边
const lifeCache = { at: 0, data: null, busy: false, error: '' };
const lifeGh = () => {
  const ls = readJson('life-settings');
  return new GitHub({ token: ls.token || settings.token, repo: ls.repo || `${owner()}/life-data` });
};
function lifeSnap(force = false) {
  if (!lifeCache.busy && (force || Date.now() - lifeCache.at > 300000)) {
    lifeCache.busy = true;
    lifeGh().readText('life.json', 'main').then((t) => {
      lifeCache.data = JSON.parse(t);
      lifeCache.error = '';
      if (!EDITING_ROUTES.test(currentPath())) render();
    }).catch((e) => { lifeCache.error = e.message; }).finally(() => { lifeCache.busy = false; lifeCache.at = Date.now(); });
  }
  return lifeCache.data;
}
const lifePeople = () => lifeSnap()?.people || [];
// 拆聊天之前一定要读到名单，不然认识的人都会被当成新的人
async function ensureLife() {
  if (lifeCache.data) return;
  try { lifeCache.data = JSON.parse(await lifeGh().readText('life.json', 'main')); lifeCache.at = Date.now(); } catch (e) {
    throw new Error(`读不到生活网站的「身边的人」（${e.message}），先确认令牌授权了 life-data`);
  }
}
const groupName = (g) => PEOPLE_GROUPS.find(([k]) => k === g)?.[1] || '';
const personHint = (p) => [groupName(p.groups?.[0]), p.rel].filter(Boolean).join(' · ');
function personName(id) {
  return lifePeople().find((p) => p.id === id)?.name || '';
}
function peopleChips(ids) {
  if (!ids?.length) return null;
  return h('div', { class: 'chips' }, ids.map((id) => {
    const name = personName(id);
    return name ? h('a', { class: 'chip person', href: `${LIFE_SITE}#/person/${id}`, target: '_blank', rel: 'noopener' }, name)
      : h('span', { class: 'chip muted' }, lifeCache.data ? '（找不到这个人）' : '…');
  }));
}
function pickerFor(value, onChange, label = '和谁') {
  return personPicker({
    people: lifePeople().map((p) => ({ id: p.id, name: p.name, hint: personHint(p), archived: p.archived })),
    value, multi: true, label, placeholder: lifeCache.data ? '输入一个字找人' : '正在读身边的人……', onChange,
  });
}
// 改生活网站的 life.json：读最新的 → 改 → 提交，冲突重试
async function updateLife(message, fn) {
  const g = lifeGh();
  for (let attempt = 0; ; attempt++) {
    const head = await g.headSha();
    const f = JSON.parse(await g.readText('life.json', head));
    if (fn(f) === false) return f;
    try {
      await g.commit(head, [{ path: 'life.json', content: JSON.stringify(f, null, 1) + '\n' }], message);
      lifeCache.data = f; lifeCache.at = Date.now();
      return f;
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 422) || attempt === 3) throw e;
    }
  }
}

// 账本、物品档案（年度回顾的数字）：只读
async function readOther(settingsKey, repoName, file) {
  const s = readJson(settingsKey);
  const g = new GitHub({ token: s.token || settings.token, repo: s.repo || `${owner()}/${repoName}` });
  try { return JSON.parse(await g.readText(file, 'main')); } catch { return null; }
}

let aiCache = null;
async function aiConfig() {
  if (aiCache?.key) return aiCache;
  const inv = readJson('inventory-settings');
  const g = new GitHub({ token: inv.token || settings.token, repo: inv.repo || `${owner()}/inventory-data` });
  try { aiCache = JSON.parse(await g.readText('config/ai.json', 'main'))?.deepseek || {}; } catch { aiCache = {}; }
  return aiCache;
}

// ---------- 首页 ----------

const HOME_HELP = [
  ['这是什么', ['一点一点把自己的人生写下来：每个阶段、发生过的事、身边的人、自己是什么样的人。', '写下来的东西会整理成一份「给 AI 的简介」，账本、生活、物品档案里的 AI 会用它更懂你。']],
  ['怎么写', ['主要靠和 ChatGPT 语音聊：点下面中间的话筒，挑一个话题，聊完把整理贴回来。', '平时想起什么，在「年表」右上角点 ＋ 记一件事。']],
  ['人生地图', ['每一段颜色越深，写得越多。浅的就是还空着的。点一段进去看。']],
];
function homeView() {
  const d = store.data;
  lifeSnap();
  const topic = suggestTopic(d);
  const today = todayKey();
  const otd = onThisDay(d, today);
  const counts = `写下了 ${d.events.length} 件事 · 聊过 ${d.talks.length} 次`;
  return h('div', {},
    headerSub('我的故事', counts, helpButton('我的故事', HOME_HELP)),
    h('div', { class: 'card next-talk' },
      h('div', { class: 'grow' }, h('div', { class: 'muted small' }, '下一次聊'), h('div', { class: 'next-title' }, topic.title)),
      h('a', { class: 'button', href: `#/talk/go?k=${topic.kind}&id=${encodeURIComponent(topic.id)}` }, icon('mic'), '开始聊'),
      h('a', { class: 'link small', href: '#/talk' }, '换一个')),
    h('div', { class: 'card' },
      h('h3', {}, '人生地图'),
      h('div', { class: 'lifemap' }, d.stages.map((s) => {
        const f = stageFill(d, s);
        return h('a', { class: `lm-row lv${f.level}`, href: `#/stage/${s.id}` },
          h('span', { class: 'lm-bar' }),
          h('span', { class: 'grow' }, h('span', { class: 'lm-title' }, s.title), s.sub ? h('span', { class: 'muted small' }, ` ${s.sub}`) : null),
          h('span', { class: 'muted small lm-meta' }, [stageYears(s), f.events ? `${f.events} 件事` : '', f.talks ? `聊过 ${f.talks} 次` : ''].filter(Boolean).join(' · ') || '还空着'));
      }))),
    h('div', { class: 'card' },
      h('h3', {}, '线'),
      h('div', { class: 'chips' }, d.threads.map((t) => h('a', { class: 'chip', href: `#/thread/${t.id}` }, t.name)))),
    otd.length ? h('div', { class: 'card' },
      h('h3', {}, '那年今天'),
      otd.slice(0, 3).map((x) => h('a', { class: 'otd', href: x.kind === 'event' ? `#/event/${x.id}` : `#/diary/${x.id}` },
        h('span', { class: 'muted small' }, `${today.slice(0, 4) - x.date.slice(0, 4)} 年前 · ${x.kind === 'event' ? '年表' : '日记'}`),
        h('span', { class: 'block' }, x.title)))) : null);
}

// ---------- 年表 ----------

const TIMELINE_HELP = [
  ['看', ['按阶段排，从小到大。紫色圆点是标了「重要」的事。', '上面一排可以只看某一条线（比如只看友情）。', '履历里有日期的（考试、奖、论文）也会出现在这里，标着「履历」，不用记两遍。']],
  ['记', ['右上角 ＋ 记一件事。时间记不清可以只写年份，或者勾「大概」，也可以写自己的说法（「大概初二」）。']],
  ['地图', ['右上角的地球：住过、上过学、去过的地方。']],
];
const tlState = { filter: '' };
function timelineView(q) {
  const d = store.data;
  lifeSnap();
  if (q.t !== undefined) tlState.filter = q.t;
  let items = timelineItems(d);
  if (tlState.filter === 'big') items = items.filter((x) => x.big);
  else if (tlState.filter) items = items.filter((x) => x.threads.includes(tlState.filter));
  const groups = new Map(d.stages.map((s) => [s.id, []]));
  const loose = [];
  for (const x of items) {
    const st = x.kind === 'event' ? eventStage(d, x.e) : stageOfDate(d.stages, x.date);
    if (st) groups.get(st.id).push(x); else loose.push(x);
  }
  const filters = [['', '全部'], ['big', '重要的'], ...d.threads.map((t) => [t.id, t.name])];
  return h('div', {},
    header('年表',
      h('a', { class: 'icon-btn', href: '#/map', 'aria-label': '地图' }, icon('globe')),
      h('a', { class: 'icon-btn', href: '#/event/new', 'aria-label': '记一件事' }, icon('plus')),
      helpButton('年表', TIMELINE_HELP)),
    h('div', { class: 'chip-scroll' }, filters.map(([v, t]) => h('button', {
      type: 'button', class: `chip${tlState.filter === v ? ' on' : ''}`, onclick: () => { tlState.filter = v; render(); },
    }, t))),
    items.length ? null : h('div', { class: 'card muted' }, tlState.filter ? '这条线上还没有事。' : '还没有记下的事。点右上角 ＋，或者去聊一段。'),
    d.stages.map((s) => {
      const list = groups.get(s.id);
      if (!list.length) return null;
      return h('section', { class: 'tl-stage' },
        h('a', { class: 'tl-head', href: `#/stage/${s.id}` }, h('span', { class: 'tl-name' }, s.title), h('span', { class: 'muted small' }, stageYears(s))),
        h('div', { class: 'tl' }, list.map(tlRow)));
    }),
    loose.length ? h('section', { class: 'tl-stage' },
      h('div', { class: 'tl-head' }, h('span', { class: 'tl-name' }, '还没对上阶段'), h('span', { class: 'muted small' }, '没写时间，或者阶段还没定时间')),
      h('div', { class: 'tl' }, loose.map(tlRow))) : null);
}
function tlRow(x) {
  return h('a', { class: `tl-row${x.big ? ' big' : ''}${x.kind === 'resume' ? ' resume' : ''}`, href: x.kind === 'event' ? `#/event/${x.id}` : '#/resume' },
    h('span', { class: 'tl-date' }, x.label || shortDate(x.date) || '—', x.approx && !x.label ? h('span', { class: 'muted' }, ' 约') : null),
    h('span', { class: 'tl-dot' }),
    h('span', { class: 'tl-title' }, x.title, x.kind === 'resume' ? h('span', { class: 'badge' }, '履历') : null));
}

function eventView(id) {
  const d = store.data;
  const e = d.events.find((x) => x.id === id);
  if (!e) return notFound();
  lifeSnap();
  const st = eventStage(d, e);
  const talk = e.from?.talk && d.talks.find((t) => t.id === e.from.talk);
  const diaryEntry = e.from?.diary && d.diary.find((x) => x.id === e.from.diary);
  const place = e.placeId && d.places.find((p) => p.id === e.placeId);
  const del = () => saveUndoable(`删掉：${e.title}`, (data) => { data.events = data.events.filter((x) => x.id !== id); }, '删掉了').then(() => go('#/timeline'));
  return h('div', {},
    back('#/timeline', '年表'),
    headerSub(e.title, [dateText(e.date, e), st?.title].filter(Boolean).join(' · '),
      h('a', { class: 'icon-btn', href: `#/event/${id}/edit`, 'aria-label': '改' }, icon('pen'))),
    h('div', { class: 'card' },
      e.big ? h('p', { class: 'small accent' }, '● 重要的事') : null,
      e.threads?.length ? h('div', { class: 'chips' }, e.threads.map((t) => h('a', { class: 'chip', href: `#/thread/${t}` }, threadName(t)))) : null,
      peopleChips(e.people),
      e.place || place ? h('p', { class: 'small' }, icon('globe'), ' ', place ? h('a', { href: '#/map' }, place.name) : e.place) : null,
      e.text ? h('div', { class: 'prose' }, paras(e.text)) : h('p', { class: 'muted small' }, '还没写经过。'),
      e.feel ? h('div', { class: 'feel' }, h('span', { class: 'muted small block' }, '当时的感受'), e.feel) : null),
    talk ? cell({ href: `#/talk/${talk.id}`, ic: 'mic', title: '来自这次聊天', sub: talk.title }) : null,
    diaryEntry ? cell({ href: `#/diary/${diaryEntry.id}`, ic: 'book', title: '来自日记', sub: dateText(diaryEntry.date) }) : null,
    h('div', { class: 'actions top' }, h('button', { class: 'danger small', onclick: del }, '删掉这件事')));
}
const paras = (text) => String(text).split(/\n+/).filter((p) => p.trim()).map((p) => h('p', {}, p));

const eventDraft = { id: null, data: null };
function eventEditView(id, q = {}) {
  const d = store.data;
  lifeSnap();
  const isNew = id === 'new';
  const key = isNew ? `new-${q.stage || ''}-${q.thread || ''}` : id;
  if (eventDraft.id !== key || !eventDraft.data) {
    const e = isNew ? { title: '', date: '', approx: false, label: '', text: '', feel: '', place: '', placeId: '', people: [], threads: q.thread ? [q.thread] : [], kind: '', big: false, stage: q.stage || '' }
      : d.events.find((x) => x.id === id);
    if (!e) return notFound();
    eventDraft.id = key; eventDraft.data = structuredClone(e);
  }
  const x = eventDraft.data;
  const title = h('input', { value: x.title, placeholder: '一句话，比如「第一次一个人坐火车」', 'aria-label': '这件事' });
  const date = dateInput(x.date, '什么时候');
  const label = h('input', { value: x.label || '', placeholder: '可以不写，比如「大概初二」「高考完那个暑假」', 'aria-label': '自己的说法' });
  const place = h('input', { value: x.place || '', placeholder: '比如 学校图书馆', 'aria-label': '在哪里' });
  const text = h('textarea', { rows: 6, placeholder: '经过，想到多少写多少', 'aria-label': '经过' }); text.value = x.text || '';
  const feel = h('textarea', { rows: 2, placeholder: '当时怎么想的、什么心情', 'aria-label': '当时的感受' }); feel.value = x.feel || '';
  const keep = () => { Object.assign(x, { title: title.value, label: label.value, place: place.value, text: text.value, feel: feel.value }); x.dateRaw = date.value; };
  const redraw = () => { keep(); render(); };
  if (x.dateRaw !== undefined) date.value = x.dateRaw;
  const stageSel = h('select', { 'aria-label': '阶段', onchange: (ev) => { x.stage = ev.target.value; } },
    h('option', { value: '' }, '按时间自动'), d.stages.map((s) => h('option', { value: s.id }, s.title)));
  stageSel.value = x.stage || '';
  const placeSel = d.places.length ? h('select', { 'aria-label': '地图上的地方', onchange: (ev) => { x.placeId = ev.target.value; } },
    h('option', { value: '' }, '不放到地图上'), d.places.map((p) => h('option', { value: p.id }, p.name))) : null;
  if (placeSel) placeSel.value = x.placeId || '';
  const submit = async () => {
    keep();
    const dt = readDate(date, '时间');
    if (dt === null) return;
    if (!title.value.trim()) { toast('写一句这件事', 'error'); return; }
    const rec = {
      id: isNew ? newId('e') : id, date: dt, ...(x.approx ? { approx: true } : {}), ...(label.value.trim() ? { label: label.value.trim() } : {}),
      title: title.value.trim(), text: text.value.trim(), feel: feel.value.trim(), place: place.value.trim(), ...(x.placeId ? { placeId: x.placeId } : {}),
      people: x.people || [], threads: x.threads || [], kind: x.kind || '', ...(x.big ? { big: true } : {}), ...(x.stage ? { stage: x.stage } : {}),
      ...(x.from ? { from: x.from } : {}), ...(x.resume ? { resume: x.resume } : {}), at: x.at || nowIso(),
    };
    const ok = await saveRender(isNew ? `记下：${rec.title}` : `改：${rec.title}`, (data) => {
      const i = data.events.findIndex((e) => e.id === rec.id);
      if (i >= 0) data.events[i] = rec; else data.events.push(rec);
    });
    if (ok) { eventDraft.id = null; go(`#/event/${rec.id}`, true); }
  };
  return h('div', {},
    back(isNew ? '#/timeline' : `#/event/${id}`),
    header(isNew ? '记一件事' : '改这件事'),
    h('div', { class: 'card form' },
      h('label', {}, '这件事', title),
      h('label', {}, '什么时候', date),
      h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: x.approx, onchange: (ev) => { x.approx = ev.target.checked; } }), '记不太清，是大概的时间'),
      h('label', {}, '自己的说法', label),
      h('label', {}, '属于哪个阶段', stageSel),
      h('div', { class: 'label' }, '哪条线', chipRow('线', d.threads.map((t) => [t.id, t.name]), x.threads || [], (v) => { x.threads = v; redraw(); }, { multi: true })),
      h('div', { class: 'label' }, '分类', chipRow('分类', EVENT_KINDS, x.kind || null, (v) => { x.kind = v || ''; redraw(); })),
      h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: x.big, onchange: (ev) => { x.big = ev.target.checked; } }), '重要的事（年表上显眼一点，给 AI 的简介里优先带上）'),
      h('div', { class: 'label' }, '和谁', pickerFor(x.people || [], (v) => { x.people = v; })),
      h('label', {}, '在哪里', place),
      placeSel ? h('label', {}, '地图上的地方', placeSel) : null,
      h('label', {}, '经过', text),
      h('label', {}, '当时的感受', feel)),
    h('div', { class: 'actions sticky' }, h('button', { onclick: submit }, '存好'), h('a', { class: 'button secondary', href: isNew ? '#/timeline' : `#/event/${id}`, onclick: () => { eventDraft.id = null; } }, '算了')));
}

// ---------- 阶段 ----------

function stageView(id) {
  const d = store.data;
  const s = stageById(id);
  if (!s) return notFound();
  lifeSnap();
  const events = sortEvents(d.events.filter((e) => eventStage(d, e)?.id === id));
  const talks = d.talks.filter((t) => t.topic?.kind === 'stage' && t.topic.id === id);
  const r = stageRange(s);
  const diary = r.from ? d.diary.filter((x) => x.date >= r.from && x.date <= r.to).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const i = d.stages.indexOf(s);
  const prev = d.stages[i - 1];
  const next = d.stages[i + 1];
  return h('div', {},
    back('#/', '人生地图'),
    headerSub(s.title, [s.sub, stageYears(s)].filter(Boolean).join(' · ') || '还没定时间',
      h('a', { class: 'icon-btn', href: `#/stage/${id}/edit`, 'aria-label': '改' }, icon('pen'))),
    s.line ? h('blockquote', { class: 'line' }, s.line) : null,
    h('div', { class: 'card' },
      STAGE_FIELDS.map(([k, t]) => h('div', { class: 'field' }, h('div', { class: 'field-k' }, t), s[k] ? h('div', { class: 'field-v' }, paras(s[k])) : h('div', { class: 'muted small' }, '还空着'))),
      s.people?.length ? h('div', { class: 'field' }, h('div', { class: 'field-k' }, '身边的人'), peopleChips(s.people)) : null),
    h('a', { class: 'button wide', href: `#/talk/go?k=stage&id=${id}` }, icon('mic'), talks.length ? '再聊聊这一段' : '聊聊这一段'),
    h('div', { class: 'section-title' }, `这一段的事（${events.length}）`),
    events.length ? h('div', { class: 'group' }, events.map((e) => cell({ href: `#/event/${e.id}`, title: e.title, meta: e.label || shortDate(e.date) })))
      : h('p', { class: 'muted small pad' }, '还没有。'),
    h('a', { class: 'link small pad', href: `#/event/new?stage=${id}` }, '＋ 记一件这一段的事'),
    talks.length ? [h('div', { class: 'section-title' }, '聊过的'), h('div', { class: 'group' }, talks.map((t) => cell({ href: `#/talk/${t.id}`, ic: 'mic', title: t.title, meta: t.at.slice(0, 10) })))] : null,
    diary.length ? [h('div', { class: 'section-title' }, `这段时间的日记（${diary.length}）`), h('div', { class: 'group' }, diary.map((x) => cell({ href: `#/diary/${x.id}`, ic: 'book', title: firstLine(x.text, 24), meta: shortDate(x.date) })))] : null,
    h('div', { class: 'pager' },
      prev ? h('a', { href: `#/stage/${prev.id}` }, '‹ ', prev.title) : h('span'),
      next ? h('a', { href: `#/stage/${next.id}` }, next.title, ' ›') : h('span')));
}

const stageDraft = { id: null, data: null };
function stageEditView(id) {
  const d = store.data;
  const s = stageById(id);
  if (!s) return notFound();
  lifeSnap();
  if (stageDraft.id !== id) { stageDraft.id = id; stageDraft.data = structuredClone(s); }
  const x = stageDraft.data;
  const inputs = {};
  const title = h('input', { value: x.title, 'aria-label': '名字' });
  const sub = h('input', { value: x.sub || '', placeholder: '可以不写', 'aria-label': '补充' });
  const from = dateInput(x.from, '从什么时候');
  const to = dateInput(x.to, '到什么时候');
  const line = h('input', { value: x.line || '', placeholder: '一句话概括这一段', 'aria-label': '一句话' });
  for (const [k, t] of STAGE_FIELDS) { inputs[k] = h('textarea', { rows: 3, 'aria-label': t }); inputs[k].value = x[k] || ''; }
  const submit = async () => {
    const f = readDate(from, '开始时间');
    const t = readDate(to, '结束时间');
    if (f === null || t === null) return;
    if (!title.value.trim()) { toast('阶段要有名字', 'error'); return; }
    const ok = await saveRender(`阶段：${title.value.trim()}`, (data) => {
      const st = data.stages.find((y) => y.id === id);
      Object.assign(st, { title: title.value.trim(), sub: sub.value.trim(), from: f, to: t, line: line.value.trim(), people: x.people || [] });
      for (const [k] of STAGE_FIELDS) st[k] = inputs[k].value.trim();
      for (const k of Object.keys(st)) if (st[k] === '' || (Array.isArray(st[k]) && !st[k].length)) delete st[k];
    });
    if (ok) { stageDraft.id = null; go(`#/stage/${id}`, true); }
  };
  return h('div', {},
    back(`#/stage/${id}`),
    header('改这一段'),
    h('div', { class: 'card form' },
      h('label', {}, '名字', title),
      h('label', {}, '补充', sub),
      h('div', { class: 'row-2' }, h('label', {}, '从', from), h('label', {}, '到（空着 = 到现在）', to)),
      h('label', {}, '一句话', line),
      STAGE_FIELDS.map(([k, t, hint]) => h('label', {}, t, hint ? h('div', { class: 'hint' }, hint) : null, inputs[k])),
      h('div', { class: 'label' }, '身边的人', pickerFor(x.people || [], (v) => { x.people = v; }, '这一段身边的人'))),
    h('div', { class: 'actions sticky' }, h('button', { onclick: submit }, '存好'), h('a', { class: 'button secondary', href: `#/stage/${id}`, onclick: () => { stageDraft.id = null; } }, '算了')));
}

// ---------- 线 ----------

function threadView(id) {
  const d = store.data;
  const t = d.threads.find((x) => x.id === id);
  if (!t) return notFound();
  lifeSnap();
  const items = timelineItems(d).filter((x) => x.threads.includes(id));
  const talks = d.talks.filter((x) => x.topic?.kind === 'thread' && x.topic.id === id);
  // 友情线按人看：每个人一路上的事（人在生活网站「身边的人」里）
  let byPerson = null;
  if (id === 't-friend') {
    const map = new Map();
    for (const x of items) for (const p of x.people) { if (!map.has(p)) map.set(p, []); map.get(p).push(x); }
    byPerson = [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }
  return h('div', {},
    back('#/', '首页'),
    headerSub(t.name, `这条线上 ${items.length} 件事`),
    h('a', { class: 'button wide', href: `#/talk/go?k=thread&id=${id}` }, icon('mic'), talks.length ? '再聊聊这条线' : '聊聊这条线'),
    byPerson?.length ? [h('div', { class: 'section-title' }, '按人看'),
      byPerson.map(([pid, list]) => h('div', { class: 'card person-thread' },
        h('div', { class: 'pt-head' }, h('a', { class: 'pt-name', href: `${LIFE_SITE}#/person/${pid}`, target: '_blank', rel: 'noopener' }, personName(pid) || '…'),
          h('span', { class: 'muted small' }, `${list.length} 件事`)),
        list.map((x) => h('a', { class: 'pt-row', href: `#/event/${x.id}` }, h('span', { class: 'muted small' }, x.label || shortDate(x.date)), ' ', x.title))))] : null,
    h('div', { class: 'section-title' }, '按时间'),
    items.length ? h('div', { class: 'tl' }, items.map(tlRow)) : h('p', { class: 'muted small pad' }, '还没有。聊一聊，或者在记事的时候选上这条线。'),
    h('a', { class: 'link small pad', href: `#/event/new?thread=${id}` }, '＋ 记一件这条线上的事'),
    talks.length ? [h('div', { class: 'section-title' }, '聊过的'), h('div', { class: 'group' }, talks.map((x) => cell({ href: `#/talk/${x.id}`, ic: 'mic', title: x.title, meta: x.at.slice(0, 10) })))] : null);
}

// ---------- 和 ChatGPT 聊 ----------

const TALK_HELP = [
  ['怎么聊', TALK_STEPS],
  ['聊什么', ['最上面是建议的下一个话题：按时间顺序第一个还没聊过的阶段。', '也可以自己挑：每个阶段、每条线、某一年，或者自己写一个话题（比如「我和二胡」）。', '同一段可以聊很多次，每次往深处走一点。']],
  ['存下来的是什么', ['ChatGPT 写的「回忆」整篇存下来，像自传里的一章。', 'DeepSeek 从里面拆出：一件件事（进年表）、这一段的描述、新认识的人（进生活网站「身边的人」）、关于我、履历。你一条条看，留下对的。']],
];
function topicFrom(q) {
  const d = store.data;
  if (q.k === 'stage') { const s = stageById(q.id); return s && { kind: 'stage', id: s.id, title: s.title, sub: s.sub, years: stageYears(s) }; }
  if (q.k === 'thread') { const t = d.threads.find((x) => x.id === q.id); return t && { kind: 'thread', id: t.id, title: t.name }; }
  if (q.k === 'year' && /^\d{4}$/.test(q.id || '')) return { kind: 'year', id: q.id, title: `${q.id} 年` };
  if (q.k === 'free' && q.t) return { kind: 'free', id: '', title: q.t };
  return null;
}
const topicHref = (t) => `#/talk/go?k=${t.kind}&id=${encodeURIComponent(t.id || '')}${t.kind === 'free' ? `&t=${encodeURIComponent(t.title)}` : ''}`;

function talkListView() {
  const d = store.data;
  const sug = suggestTopic(d);
  const free = h('input', { placeholder: '比如「我和二胡」「第一次离开家」', 'aria-label': '自己定一个话题' });
  const thisYear = todayKey().slice(0, 4);
  return h('div', {},
    header('开始聊', helpButton('和 ChatGPT 聊', TALK_HELP)),
    h('div', { class: 'card next-talk' },
      h('div', { class: 'grow' }, h('div', { class: 'muted small' }, '建议'), h('div', { class: 'next-title' }, sug.title)),
      h('a', { class: 'button', href: topicHref(sug) }, '就聊这个')),
    h('div', { class: 'section-title' }, '每个阶段'),
    h('div', { class: 'group' }, d.stages.map((s) => {
      const f = stageFill(d, s);
      return cell({ href: topicHref({ kind: 'stage', id: s.id }), title: s.title, sub: s.sub, meta: f.talks ? `聊过 ${f.talks} 次` : '还没聊' });
    })),
    h('div', { class: 'section-title' }, '每条线'),
    h('div', { class: 'group' }, d.threads.map((t) => {
      const n = d.talks.filter((x) => x.topic?.kind === 'thread' && x.topic.id === t.id).length;
      return cell({ href: topicHref({ kind: 'thread', id: t.id }), title: t.name, meta: n ? `聊过 ${n} 次` : '还没聊' });
    })),
    h('div', { class: 'section-title' }, '某一年'),
    h('div', { class: 'group' }, cell({ href: '#/years', title: `每一年`, sub: `年底聊聊这一年（${thisYear}），或者补以前的某一年` })),
    h('div', { class: 'section-title' }, '自己定一个话题'),
    h('div', { class: 'card form' }, free,
      h('button', { class: 'wide secondary', onclick: () => { const t = free.value.trim(); if (t) go(topicHref({ kind: 'free', title: t })); else toast('写一个话题', 'error'); } }, '聊这个')),
    d.talks.length ? [h('div', { class: 'section-title' }, `聊过的（${d.talks.length}）`),
      h('div', { class: 'group' }, [...d.talks].reverse().map((t) => cell({ href: `#/talk/${t.id}`, ic: 'mic', title: t.title, sub: t.topic?.title, meta: t.at.slice(0, 10) })))] : null);
}

// 已经写下的（放进提示词，免得 ChatGPT 重复问）
function knownFor(topic) {
  const d = store.data;
  let events = [];
  const lines = [];
  if (topic.kind === 'stage') {
    const s = stageById(topic.id);
    for (const [k, t] of STAGE_FIELDS) if (s[k]) lines.push(`${t}：${s[k]}`);
    events = d.events.filter((e) => eventStage(d, e)?.id === s.id);
  } else if (topic.kind === 'thread') {
    events = d.events.filter((e) => e.threads?.includes(topic.id));
  } else if (topic.kind === 'year') {
    events = d.events.filter((e) => e.date?.startsWith(topic.id));
  }
  for (const e of sortEvents(events).slice(0, 40)) lines.push(`- ${dateText(e.date, e)}：${e.title}`);
  return lines.join('\n');
}

const talkState = { key: '', paste: '', busy: false, result: null, memoir: '', title: '', picks: null };
function talkGoView(q) {
  const d = store.data;
  const topic = topicFrom(q);
  if (!topic) return notFound();
  lifeSnap();
  const key = topicHref(topic);
  if (talkState.key !== key) Object.assign(talkState, { key, paste: '', busy: false, result: null, memoir: '', title: '', picks: null });
  if (talkState.result) return talkReview(topic);
  const yearFacts = topic.kind === 'year' ? yearFactsCache[topic.id] : '';
  if (topic.kind === 'year' && yearFacts === undefined) loadYearStats(Number(topic.id));
  const text = topic.kind === 'year' ? yearPrompt(topic.id, yearFacts || '') : talkPrompt(topic, knownFor(topic));
  const paste = h('textarea', { rows: 10, placeholder: '把 ChatGPT「整理一下」写的整段贴在这里', 'aria-label': 'ChatGPT 的整理' });
  paste.value = talkState.paste;
  paste.addEventListener('input', () => { talkState.paste = paste.value; });
  const split = async () => {
    const chat = paste.value.trim();
    if (chat.length < 30) { toast('先把 ChatGPT 的整理贴进来', 'error'); return; }
    talkState.busy = true; render();
    try {
      await ensureLife();
      const out = await splitTalk(topic, chat);
      const sec = splitSections(chat);
      talkState.memoir = sec['回忆'] || chat;
      talkState.title = out.title || topic.title;
      talkState.result = out;
      talkState.picks = initialPicks(out);
    } catch (e) { toast(e.message, 'error'); }
    talkState.busy = false; render();
  };
  return h('div', {},
    back('#/talk', '换个话题'),
    headerSub(`聊：${topic.title}`, topic.kind === 'stage' ? [topic.sub, topic.years].filter(Boolean).join(' · ') : '', helpButton('和 ChatGPT 聊', TALK_HELP)),
    h('div', { class: 'card form' },
      h('ol', { class: 'small steps' }, TALK_STEPS.map((s) => h('li', {}, s))),
      h('details', { class: 'inner' }, h('summary', {}, '看看提示词'), h('p', { class: 'prompt' }, text)),
      h('div', { class: 'actions' },
        h('button', { class: 'secondary small', onclick: () => copyText(text) }, icon('copy'), '复制提示词'),
        h('a', { class: 'button secondary small', href: 'https://chatgpt.com/', target: '_blank', rel: 'noopener' }, '打开 ChatGPT')),
      paste,
      h('button', { class: 'wide', disabled: talkState.busy, onclick: split }, icon('sparkle'), talkState.busy ? 'DeepSeek 正在拆……' : '让 DeepSeek 拆开')));
}

async function splitTalk(topic, chat) {
  const d = store.data;
  const people = lifePeople().filter((p) => !p.archived || true).map((p) => `${p.name}（${personHint(p) || '还没分组'}）`);
  const system = [
    '你帮一个人整理他的人生记录。他刚和 ChatGPT 语音聊完一段人生，下面是 ChatGPT 写的整理（回忆、事情、人、那时候的我、履历）。',
    '把它拆成结构化的数据。要求：',
    '- 只用整理里有的内容，不要编，不要加评价和道理。用他的口吻（第一人称），简短。',
    '- events：每件具体的事一条。date 写 YYYY、YYYY-MM 或 YYYY-MM-DD（按他的出生年份和阶段时间推算；推不出就空着），记不清的 approx 为 true；他自己的说法（「大概初二」）放 label。title 一句话（20 字以内），text 经过（可以几句），feel 当时的感受。people 写名字。threads 从下面的线里选 id（可以多个，可以空）。kind 从 study/home/move/health/faith/first/gain/loss/turn/other 里选。big：对他人生影响大的才 true。',
    '- 已经记下的事（下面列着）不要重复。',
    '- people：整理里出现、但不在「已经认识的人」名单里的人。sex 写 m 或 f（不知道写空），rel 关系（同学、舍友、老师、妈妈……），how 怎么认识的，一句话。名单里已经有的人不要放进来（名字一样就是同一个人）。',
    topic.kind === 'stage' ? `- stage：这一段（${topic.title}）的描述，只写整理里说到的，字段：city 在哪里（城市、学校、住处）、busy 在忙什么、me 那时候的我、good 开心的事、hard 难的事、left 留下了什么、line 一句话概括。没说到的字段不要写。` : '- stage 写 {}。',
    '- about：关于他是什么样的人。sec 从 basic 基本、character 性格、values 看重的、views 我怎么看（对某件事的看法）、likes 喜欢的、dislikes 不喜欢的、habits 习惯、body 身体、faith 信仰、talk 和我说话（喜欢别人怎么和他说话）里选；topic 话题（2–6 个字，比如「科研」「恋爱」「抽烟喝酒」，下面列着已有的话题，同一件事就用同一个 topic）；date 这是哪个时候的想法（YYYY 或 YYYY-MM）；label 可选（「高中时」）；text 一两句。看法会随时间变，所以一定写清是哪个时候的。',
    '- resume：学校、考试、比赛、奖、论文、兼职、技能。kind 从 edu/exam/award/paper/report/work/skill 选；title；org 单位；from、to 日期；detail 分数名次等。',
    '- title：给这次聊天起个名字（10 字以内）。',
    '只输出 JSON：{"title":"","stage":{},"events":[{"date":"","approx":false,"label":"","title":"","text":"","feel":"","place":"","people":[],"threads":[],"kind":"","big":false}],"people":[{"name":"","sex":"","rel":"","how":""}],"about":[{"sec":"","topic":"","date":"","label":"","text":""}],"resume":[{"kind":"","title":"","org":"","from":"","to":"","detail":""}]}',
  ].join('\n');
  const known = topic.kind === 'stage' ? d.events.filter((e) => eventStage(d, e)?.id === topic.id)
    : topic.kind === 'thread' ? d.events.filter((e) => e.threads?.includes(topic.id)) : topic.kind === 'year' ? d.events.filter((e) => e.date?.startsWith(topic.id)) : d.events;
  const user = [
    `今天 ${todayKey()}。这次聊的话题：${topic.title}。`,
    `他的阶段：\n${d.stages.map((s) => `${s.title}${s.sub ? `（${s.sub}）` : ''}：${stageYears(s) || '时间还没定'}`).join('\n')}`,
    `线：${d.threads.map((t) => `${t.id}=${t.name}`).join('，')}`,
    `已经认识的人：${people.join('、') || '（读不到）'}`,
    `已经记下的事：\n${sortEvents(known).slice(-60).map((e) => `- ${dateText(e.date, e)}：${e.title}`).join('\n') || '（没有）'}`,
    `「关于我」已有的话题：${[...new Set(d.about.map((a) => `${a.sec}/${a.topic}`))].join('、') || '（没有）'}`,
    `ChatGPT 的整理：\n${chat}`,
  ].join('\n\n');
  const out = await askJson(await aiConfig(), system, user, { maxTokens: 12000, timeout: 180000 });
  for (const k of ['events', 'people', 'about', 'resume']) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.stage || typeof out.stage !== 'object') out.stage = {};
  for (const e of out.events) { e.date = parseDate(e.date) || ''; e.threads = (e.threads || []).filter((t) => d.threads.some((x) => x.id === t)); e.people = (e.people || []).filter(Boolean); }
  for (const a of out.about) { a.date = parseDate(a.date) || ''; }
  for (const r of out.resume) { r.from = parseDate(r.from) || ''; r.to = parseDate(r.to) || ''; }
  return out;
}

// 拆出来的每一条默认都留着；新的人默认放进按阶段猜的分组
function initialPicks(out) {
  const known = new Set(lifePeople().map((p) => p.name));
  const names = new Map();
  for (const p of out.people) if (p.name && !known.has(p.name)) names.set(p.name, p);
  for (const e of out.events) for (const n of e.people) if (!known.has(n) && !names.has(n)) names.set(n, { name: n, sex: '', rel: '', how: '' });
  const group = STAGE_GROUP[talkState.key.match(/id=([^&]+)/)?.[1]] || '';
  return {
    memoir: true,
    stage: Object.fromEntries(Object.keys(out.stage).filter((k) => String(out.stage[k] || '').trim()).map((k) => [k, true])),
    events: out.events.map(() => true),
    people: [...names.values()].map((p) => ({ ...p, sex: p.sex === 'f' || p.sex === 'm' ? p.sex : '', group, on: true })),
    about: out.about.map(() => true),
    resume: out.resume.map(() => true),
  };
}

const STAGE_KEYS = { city: '在哪里', busy: '在忙什么', me: '那时候的我', good: '开心的事', hard: '难的事', left: '留下了什么', line: '一句话' };
function talkReview(topic) {
  const d = store.data;
  const r = talkState.result;
  const pk = talkState.picks;
  const box = (on, onChange, label) => h('input', { type: 'checkbox', checked: on, 'aria-label': label, onchange: (e) => { onChange(e.target.checked); } });
  const title = h('input', { value: talkState.title, 'aria-label': '这次聊天的名字', oninput: (e) => { talkState.title = e.target.value; } });
  const memoir = h('textarea', { rows: 10, 'aria-label': '回忆', oninput: (e) => { talkState.memoir = e.target.value; } });
  memoir.value = talkState.memoir;
  const st = topic.kind === 'stage' ? stageById(topic.id) : null;
  const known = new Set(lifePeople().map((p) => p.name));
  const sec = (k) => ABOUT_SECS.find(([x]) => x === k)?.[1] || k;
  const store2 = async () => {
    const keepNames = new Set(pk.people.filter((p) => p.on).map((p) => p.name));
    const newPeople = pk.people.filter((p) => p.on && p.name.trim());
    if (newPeople.some((p) => !p.sex)) { toast('新认识的人要选男 / 女', 'error'); return; }
    let ids = new Map(lifePeople().map((p) => [p.name, p.id]));
    try {
      await saving('正在保存…', async () => {
        if (newPeople.length) {
          const life = await updateLife(`身边的人：${newPeople.map((p) => p.name).join('、')}（从「我的故事」）`, (f) => {
            f.people ||= [];
            for (const p of newPeople) {
              if (f.people.some((x) => x.name === p.name)) continue;
              f.people.push({ id: newId('p'), name: p.name, sex: p.sex, groups: p.group ? [p.group] : [], ...(p.rel ? { rel: p.rel } : {}), ...(p.how ? { how: p.how } : {}), at: todayKey() });
            }
          });
          ids = new Map(life.people.map((p) => [p.name, p.id]));
        }
        const talkId = newId('t');
        await store.save(`聊了：${talkState.title || topic.title}`, (data) => {
          data.talks.push({ id: talkId, topic, title: talkState.title.trim() || topic.title, ...(pk.memoir ? { memoir: talkState.memoir.trim() } : {}), chat: talkState.paste.trim(), at: nowIso() });
          if (st) {
            const s = data.stages.find((x) => x.id === st.id);
            for (const [k, on] of Object.entries(pk.stage)) {
              const v = String(r.stage[k] || '').trim();
              if (!on || !v) continue;
              if (k === 'line') s.line = v;
              else s[k] = s[k] && !s[k].includes(v) ? `${s[k]}\n${v}` : v;
            }
          }
          r.events.forEach((e, i) => {
            if (!pk.events[i]) return;
            const people = e.people.map((n) => ids.get(n)).filter(Boolean);
            const lost = e.people.filter((n) => !ids.get(n) && !keepNames.has(n));
            data.events.push({
              id: newId('e'), date: e.date, ...(e.approx ? { approx: true } : {}), ...(e.label ? { label: e.label } : {}), title: e.title,
              text: [e.text, lost.length ? `（提到：${lost.join('、')}）` : ''].filter(Boolean).join(''), feel: e.feel || '', place: e.place || '',
              people, threads: e.threads, kind: EVENT_KINDS.some(([k]) => k === e.kind) ? e.kind : '', ...(e.big ? { big: true } : {}),
              ...(st && !stageOfDate(data.stages, e.date) ? { stage: st.id } : {}), from: { talk: talkId }, at: nowIso(),
            });
          });
          r.about.forEach((a, i) => { if (pk.about[i]) applyAbout(data, a, newId, { talk: talkId }); });
          r.resume.forEach((x, i) => {
            if (!pk.resume[i]) return;
            data.resume.push({ id: newId('r'), kind: RESUME_KINDS.some(([k]) => k === x.kind) ? x.kind : 'award', title: x.title || '', org: x.org || '', from: x.from || '', to: x.to || '', detail: x.detail || '', at: nowIso() });
          });
        });
        Object.assign(talkState, { key: '', paste: '', result: null, picks: null });
        toast('存好了');
        go(`#/talk/${talkId}`, true);
      });
    } catch { /* 已提示 */ }
  };
  return h('div', {},
    h('button', { class: 'link back', onclick: () => { talkState.result = null; render(); } }, '‹ 回到贴文字'),
    headerSub('看一看', '没勾的不会存。存好以后还能改。'),
    h('div', { class: 'card form' },
      h('label', {}, '这次聊天的名字', title),
      h('label', { class: 'switch-row' }, box(pk.memoir, (v) => { pk.memoir = v; }, '存回忆'), '存下这篇回忆'),
      memoir),
    st && Object.keys(pk.stage).length ? [h('div', { class: 'section-title' }, `「${st.title}」这一段`),
      h('div', { class: 'card' }, Object.keys(pk.stage).map((k) => h('label', { class: 'pick' }, box(pk.stage[k], (v) => { pk.stage[k] = v; }, STAGE_KEYS[k]),
        h('span', { class: 'grow' }, h('b', {}, STAGE_KEYS[k] || k), h('span', { class: 'block small' }, r.stage[k]), st[k] && k !== 'line' ? h('span', { class: 'block muted small' }, '（接在原来写的后面）') : null))))] : null,
    r.events.length ? [h('div', { class: 'section-title' }, `事情（${r.events.length}）`),
      h('div', { class: 'card' }, r.events.map((e, i) => h('label', { class: 'pick' }, box(pk.events[i], (v) => { pk.events[i] = v; }, e.title),
        h('span', { class: 'grow' }, h('b', {}, e.title), e.big ? h('span', { class: 'badge accent' }, '重要') : null,
          h('span', { class: 'block muted small' }, [dateText(e.date, e), e.threads.map(threadName).join('、'), e.people.join('、')].filter(Boolean).join(' · ')),
          e.text ? h('span', { class: 'block small' }, e.text) : null))))] : null,
    pk.people.length ? [h('div', { class: 'section-title' }, `新认识的人（${pk.people.length}）· 会加进生活网站「身边的人」`),
      h('div', { class: 'card' }, pk.people.map((p) => h('div', { class: 'pick' }, box(p.on, (v) => { p.on = v; }, p.name),
        h('span', { class: 'grow' }, h('b', {}, p.name), h('span', { class: 'muted small' }, ` ${[p.rel, p.how].filter(Boolean).join('，')}`),
          h('div', { class: 'pick-row' },
            chipRow('男女', [['m', '男'], ['f', '女']], p.sex, (v) => { p.sex = v || ''; render(); }),
            h('select', { 'aria-label': `${p.name}的分组`, onchange: (e) => { p.group = e.target.value; } },
              h('option', { value: '' }, '还没分组'), PEOPLE_GROUPS.map(([k, t]) => h('option', { value: k, selected: p.group === k }, t)))))))),
      known.size ? null : h('p', { class: 'muted small pad' }, '还没读到身边的人，名字可能对不上。')] : null,
    r.about.length ? [h('div', { class: 'section-title' }, `关于我（${r.about.length}）`),
      h('div', { class: 'card' }, r.about.map((a, i) => {
        const exists = d.about.some((x) => x.sec === a.sec && x.topic === a.topic);
        return h('label', { class: 'pick' }, box(pk.about[i], (v) => { pk.about[i] = v; }, a.topic || a.text),
          h('span', { class: 'grow' }, h('b', {}, `${sec(a.sec)}${a.topic ? ` · ${a.topic}` : ''}`),
            h('span', { class: 'block muted small' }, [a.label || (a.date ? dateText(a.date) : ''), exists ? '加成这一条的一个新时期' : '新的一条'].filter(Boolean).join(' · ')),
            h('span', { class: 'block small' }, a.text)));
      }))] : null,
    r.resume.length ? [h('div', { class: 'section-title' }, `履历（${r.resume.length}）`),
      h('div', { class: 'card' }, r.resume.map((x, i) => h('label', { class: 'pick' }, box(pk.resume[i], (v) => { pk.resume[i] = v; }, x.title),
        h('span', { class: 'grow' }, h('b', {}, resumeTitle(x)), h('span', { class: 'block muted small' }, [shortDate(x.from), x.detail].filter(Boolean).join(' · '))))))] : null,
    h('div', { class: 'actions sticky' }, h('button', { onclick: store2 }, '存好'), h('button', { class: 'secondary', onclick: () => { talkState.result = null; render(); } }, '回去改')));
}

function talkView(id) {
  const d = store.data;
  const t = d.talks.find((x) => x.id === id);
  if (!t) return notFound();
  const events = sortEvents(d.events.filter((e) => e.from?.talk === id));
  const editMemoir = () => {
    const ta = h('textarea', { rows: 14, 'aria-label': '回忆' }); ta.value = t.memoir || '';
    const ti = h('input', { value: t.title, 'aria-label': '名字' });
    openSheet({ title: '改这篇回忆', body: h('div', { class: 'form' }, ti, ta), confirmText: '存好',
      onConfirm: () => saveRender('改回忆', (data) => { const x = data.talks.find((y) => y.id === id); x.title = ti.value.trim() || x.title; x.memoir = ta.value.trim(); }) });
  };
  const del = () => saveUndoable(`删掉聊天：${t.title}`, (data) => { data.talks = data.talks.filter((x) => x.id !== id); }, '删掉了这次聊天（拆出来的事还在）').then(() => go('#/talk'));
  const href = t.topic?.kind === 'stage' ? `#/stage/${t.topic.id}` : t.topic?.kind === 'thread' ? `#/thread/${t.topic.id}` : t.topic?.kind === 'year' ? `#/year/${t.topic.id}` : '#/talk';
  return h('div', {},
    back(href, t.topic?.title || '返回'),
    headerSub(t.title, `${t.at.slice(0, 10)} 聊的`, h('button', { class: 'icon-btn', 'aria-label': '改', onclick: editMemoir }, icon('pen'))),
    t.memoir ? h('article', { class: 'card memoir' }, paras(t.memoir)) : h('div', { class: 'card muted' }, '这次没存回忆。'),
    events.length ? [h('div', { class: 'section-title' }, `拆出来的事（${events.length}）`), h('div', { class: 'tl' }, events.map((e) => tlRow({ kind: 'event', id: e.id, date: e.date, approx: e.approx, label: e.label, title: e.title, big: e.big })))] : null,
    t.chat ? h('details', {}, h('summary', {}, 'ChatGPT 的原文'), h('p', { class: 'pre small' }, t.chat)) : null,
    h('div', { class: 'actions top' }, h('button', { class: 'danger small', onclick: del }, '删掉这次聊天')));
}

// ---------- 关于我 ----------

const ABOUT_HELP = [
  ['这一页', ['你是什么样的人：性格、看重的、喜欢和不喜欢的、习惯、身体、信仰、喜欢别人怎么和你说话。', '和 ChatGPT 聊的时候，DeepSeek 发现新的内容会提议加进来，你确认了才加。']],
  ['看法会变', ['同一件事，不同时期的看法不一样。一条可以有好几个时期：点进去看是怎么一路变过来的，最下面那条是现在的。', '想法变了就点「加一个时期」，不用删以前的。']],
];
function aboutView() {
  const d = store.data;
  return h('div', {},
    header('关于我', helpButton('关于我', ABOUT_HELP)),
    ABOUT_SECS.map(([sec, name]) => {
      const list = d.about.filter((a) => a.sec === sec);
      return h('section', {},
        h('div', { class: 'section-title row' }, h('span', {}, name), h('button', { class: 'link small', onclick: () => aboutSheet(sec) }, '＋ 加一条')),
        list.length ? h('div', { class: 'group' }, list.map((a) => {
          const v = latestVersion(a);
          const n = a.versions.length;
          return h('a', { class: 'about-row', href: `#/about/${a.id}` },
            a.topic ? h('b', {}, a.topic) : null,
            h('span', { class: 'about-text' }, v?.text || ''),
            n > 1 ? h('span', { class: 'muted small block' }, `${n} 个时期 · 看怎么变的`) : null);
        })) : h('p', { class: 'muted small pad' }, '还空着'));
    }));
}
function aboutSheet(sec, entry = null) {
  const topic = h('input', { value: entry?.topic || '', placeholder: '话题，比如「科研」「恋爱」（可以不写）', 'aria-label': '话题' });
  const text = h('textarea', { rows: 4, placeholder: '一两句', 'aria-label': '内容' });
  const date = dateInput('', '这是什么时候的');
  const label = h('input', { placeholder: '可以不写，比如「高中时」「现在」', 'aria-label': '自己的说法' });
  openSheet({
    title: entry ? `「${entry.topic || '这一条'}」加一个时期` : `加一条：${ABOUT_SECS.find(([k]) => k === sec)[1]}`,
    body: h('div', { class: 'form' }, entry ? null : topic, text, h('label', {}, '这是什么时候的（空着 = 一直是这样）', date), label),
    confirmText: '加上',
    onConfirm: () => {
      const dt = readDate(date, '时间');
      if (dt === null) return false;
      if (!text.value.trim()) { toast('写点什么', 'error'); return false; }
      return saveRender(entry ? `关于我：${entry.topic} 新时期` : '关于我：加一条', (data) => {
        const v = { id: newId('v'), date: dt, text: text.value.trim(), ...(label.value.trim() ? { label: label.value.trim() } : {}) };
        if (entry) data.about.find((a) => a.id === entry.id).versions.push(v);
        else data.about.push({ id: newId('a'), sec, topic: topic.value.trim(), versions: [v] });
      });
    },
  });
}
function aboutEntryView(id) {
  const d = store.data;
  const a = d.about.find((x) => x.id === id);
  if (!a) return notFound();
  const vs = sortVersions(a.versions);
  const editV = (v) => {
    const text = h('textarea', { rows: 4, 'aria-label': '内容' }); text.value = v.text;
    const date = dateInput(v.date, '时间');
    const label = h('input', { value: v.label || '', placeholder: '自己的说法', 'aria-label': '自己的说法' });
    openSheet({ title: '改这一个时期', body: h('div', { class: 'form' }, text, h('label', {}, '什么时候', date), label), confirmText: '存好',
      extra: h('button', { class: 'danger wide', onclick: () => {
        document.querySelector('.sheet-overlay')?.remove();
        saveUndoable('关于我：删一个时期', (data) => {
          const x = data.about.find((y) => y.id === id);
          x.versions = x.versions.filter((y) => y.id !== v.id);
          if (!x.versions.length) data.about = data.about.filter((y) => y.id !== id);
        }, '删掉了').then(() => { if (!store.data.about.some((y) => y.id === id)) go('#/about'); else render(); });
      } }, '删掉这一个时期'),
      onConfirm: () => {
        const dt = readDate(date, '时间');
        if (dt === null || !text.value.trim()) return false;
        return saveRender('关于我：改', (data) => {
          const y = data.about.find((x) => x.id === id).versions.find((x) => x.id === v.id);
          Object.assign(y, { text: text.value.trim(), date: dt });
          if (label.value.trim()) y.label = label.value.trim(); else delete y.label;
        });
      } });
  };
  const rename = () => {
    const topic = h('input', { value: a.topic, 'aria-label': '话题' });
    const sel = h('select', { 'aria-label': '放在哪一栏' }, ABOUT_SECS.map(([k, t]) => h('option', { value: k, selected: k === a.sec }, t)));
    openSheet({ title: '改话题', body: h('div', { class: 'form' }, topic, h('label', {}, '放在哪一栏', sel)), confirmText: '存好',
      onConfirm: () => saveRender('关于我：改话题', (data) => { const x = data.about.find((y) => y.id === id); x.topic = topic.value.trim(); x.sec = sel.value; }) });
  };
  return h('div', {},
    back('#/about', '关于我'),
    headerSub(a.topic || ABOUT_SECS.find(([k]) => k === a.sec)?.[1], ABOUT_SECS.find(([k]) => k === a.sec)?.[1], h('button', { class: 'icon-btn', 'aria-label': '改话题', onclick: rename }, icon('pen'))),
    h('div', { class: 'versions' }, vs.map((v, i) => h('button', { type: 'button', class: `version${i === vs.length - 1 ? ' now' : ''}`, onclick: () => editV(v) },
      h('span', { class: 'v-when' }, versionWhen(d, v) || (i === vs.length - 1 ? '现在' : '以前'), i === vs.length - 1 && vs.length > 1 ? ' · 现在' : ''),
      h('span', { class: 'v-text' }, v.text),
      v.from?.talk ? h('span', { class: 'muted small block' }, '来自一次聊天') : v.from?.diary ? h('span', { class: 'muted small block' }, '来自日记') : null))),
    h('button', { class: 'wide secondary', onclick: () => aboutSheet(a.sec, a) }, '＋ 加一个时期（想法变了）'));
}

// ---------- 履历 ----------

function resumeView() {
  const d = store.data;
  return h('div', {},
    back('#/more', '更多'),
    header('履历', h('button', { class: 'icon-btn', 'aria-label': '加一条', onclick: () => resumeSheet() }, icon('plus')),
      helpButton('履历', [['这一页', ['学历、考试、奖、论文、报告、兼职、技能。', '有开始日期的会自动出现在年表上（标着「履历」）。', '点一条可以改。']]])),
    RESUME_KINDS.map(([k, name]) => {
      const list = d.resume.filter((r) => r.kind === k).sort((a, b) => (dateStart(b.from) || '').localeCompare(dateStart(a.from) || ''));
      if (!list.length) return null;
      return [h('div', { class: 'section-title' }, name),
        h('div', { class: 'group' }, list.map((r) => h('button', { type: 'button', class: 'cell', onclick: () => resumeSheet(r) },
          h('span', { class: 'grow' }, resumeTitle(r), r.detail ? h('span', { class: 'muted small block' }, r.detail) : null),
          h('span', { class: 'meta' }, [shortDate(r.from), r.to ? shortDate(r.to) : ''].filter(Boolean).join('–')))))];
    }),
    d.resume.length ? null : h('div', { class: 'card muted' }, '还没有。点右上角 ＋。'));
}
function resumeSheet(r = null) {
  let kind = r?.kind || 'edu';
  const kindBox = h('div');
  const drawKind = () => kindBox.replaceChildren(chipRow('种类', RESUME_KINDS, kind, (v) => { kind = v || kind; drawKind(); }));
  drawKind();
  const title = h('input', { value: r?.title || '', placeholder: '比如 数学与应用数学 / 全国大学生数学竞赛', 'aria-label': '名称' });
  const org = h('input', { value: r?.org || '', placeholder: '学校、单位、主办方', 'aria-label': '单位' });
  const from = dateInput(r?.from, '开始');
  const to = dateInput(r?.to, '结束');
  const detail = h('textarea', { rows: 2, placeholder: '分数、名次、导师、合作者……', 'aria-label': '细节' }); detail.value = r?.detail || '';
  openSheet({
    title: r ? '改这一条' : '加一条履历',
    body: h('div', { class: 'form' }, kindBox, title, org, h('div', { class: 'row-2' }, h('label', {}, '从', from), h('label', {}, '到', to)), detail),
    confirmText: '存好',
    extra: r ? h('button', { class: 'danger wide', onclick: () => { document.querySelector('.sheet-overlay')?.remove(); saveUndoable('删履历', (data) => { data.resume = data.resume.filter((x) => x.id !== r.id); }, '删掉了').then(render); } }, '删掉') : null,
    onConfirm: () => {
      const f = readDate(from, '开始');
      const t = readDate(to, '结束');
      if (f === null || t === null) return false;
      if (!title.value.trim() && !org.value.trim()) { toast('写个名称', 'error'); return false; }
      const rec = { id: r?.id || newId('r'), kind, title: title.value.trim(), org: org.value.trim(), from: f, to: t, detail: detail.value.trim(), at: r?.at || nowIso() };
      return saveRender(r ? '改履历' : '加履历', (data) => {
        const i = data.resume.findIndex((x) => x.id === rec.id);
        if (i >= 0) data.resume[i] = rec; else data.resume.push(rec);
      });
    },
  });
}

// ---------- 日记 ----------

function diaryListView() {
  const d = store.data;
  const list = [...d.diary].sort((a, b) => b.date.localeCompare(a.date));
  const byYear = new Map();
  for (const x of list) { const y = x.date.slice(0, 4); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(x); }
  return h('div', {},
    back('#/more', '更多'),
    headerSub('日记', `${d.diary.length} 篇`, h('a', { class: 'icon-btn', href: '#/diary/new', 'aria-label': '写一篇' }, icon('plus'))),
    [...byYear.entries()].map(([y, xs]) => [h('div', { class: 'section-title' }, `${y} 年`),
      h('div', { class: 'group' }, xs.map((x) => cell({ href: `#/diary/${x.id}`, title: firstLine(x.text, 26), sub: [x.place, x.weather].filter(Boolean).join(' · '), meta: x.date.slice(5).replace('-', '.') })))]),
    list.length ? null : h('div', { class: 'card muted' }, '还没有日记。'));
}
function diaryView(id) {
  const d = store.data;
  const list = [...d.diary].sort((a, b) => a.date.localeCompare(b.date));
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return notFound();
  const x = list[i];
  const st = stageOfDate(d.stages, x.date);
  const prev = list[i - 1];
  const next = list[i + 1];
  const del = () => saveUndoable('删日记', (data) => { data.diary = data.diary.filter((y) => y.id !== id); }, '删掉了').then(() => go('#/diary'));
  return h('div', {},
    back('#/diary', '日记'),
    headerSub(dateText(x.date), [x.place, x.weather, st?.title].filter(Boolean).join(' · '), h('a', { class: 'icon-btn', href: `#/diary/${id}/edit`, 'aria-label': '改' }, icon('pen'))),
    h('article', { class: 'card memoir' }, paras(x.text)),
    h('div', { class: 'pager' },
      prev ? h('a', { href: `#/diary/${prev.id}` }, '‹ ', shortDate(prev.date)) : h('span'),
      next ? h('a', { href: `#/diary/${next.id}` }, shortDate(next.date), ' ›') : h('span')),
    h('div', { class: 'actions top' }, h('button', { class: 'danger small', onclick: del }, '删掉这篇')));
}
function diaryEditView(id) {
  const d = store.data;
  const isNew = id === 'new';
  const x = isNew ? { date: todayKey(), place: '', weather: '', text: '' } : d.diary.find((y) => y.id === id);
  if (!x) return notFound();
  const date = h('input', { type: 'date', value: x.date, 'aria-label': '日期' });
  const place = h('input', { value: x.place, placeholder: '在哪', 'aria-label': '在哪' });
  const weather = h('input', { value: x.weather, placeholder: '天气', 'aria-label': '天气' });
  const text = h('textarea', { rows: 16, 'aria-label': '日记' }); text.value = x.text;
  const submit = async () => {
    if (!date.value || !text.value.trim()) { toast('日期和内容都要有', 'error'); return; }
    const rec = { ...x, id: isNew ? newId('d') : id, date: date.value, place: place.value.trim(), weather: weather.value.trim(), text: text.value.trim() };
    if (await saveRender(isNew ? '写日记' : '改日记', (data) => {
      const i = data.diary.findIndex((y) => y.id === rec.id);
      if (i >= 0) data.diary[i] = rec; else data.diary.push(rec);
    })) go(`#/diary/${rec.id}`, true);
  };
  return h('div', {},
    back(isNew ? '#/diary' : `#/diary/${id}`),
    header(isNew ? '写一篇' : '改日记'),
    h('div', { class: 'card form' }, h('label', {}, '日期', date), h('div', { class: 'row-2' }, place, weather), text),
    h('div', { class: 'actions sticky' }, h('button', { onclick: submit }, '存好'), h('a', { class: 'button secondary', href: isNew ? '#/diary' : `#/diary/${id}` }, '算了')));
}

// ---------- 每一年 ----------

function yearsView() {
  const d = store.data;
  return h('div', {},
    back('#/more', '更多'),
    header('每一年', helpButton('每一年', [['这一页', ['每一年一页：这一年的事、日记，还有账本、物品档案、生活网站里这一年的数字（网站建起来以后才有）。', '年底和 ChatGPT 聊聊这一年，回忆存进这一年。以前的年份也可以补。']]])),
    h('div', { class: 'group' }, yearsSpan(d).map((y) => {
      const it = yearItems(d, y);
      const talked = d.talks.some((t) => t.topic?.kind === 'year' && t.topic.id === String(y));
      return cell({ href: `#/year/${y}`, title: `${y} 年`, sub: it.stages.map((s) => s.title).join(' → '), meta: [it.events.length ? `${it.events.length} 件事` : '', talked ? '聊过' : ''].filter(Boolean).join(' · ') });
    })));
}
const yearFactsCache = {};
const yearStatsCache = {};
async function loadYearStats(y) {
  if (yearStatsCache[y]?.busy) return;
  yearStatsCache[y] = { busy: true };
  const [fin, inv, life] = await Promise.all([
    readOther('ledger-settings', 'finance-data', 'finance.json'),
    readOther('inventory-settings', 'inventory-data', 'inventory.json'),
    readOther('life-settings', 'life-data', 'life.json'),
  ]);
  const s = yearStats(y, { fin, inv, life });
  yearStatsCache[y] = { stats: s };
  yearFactsCache[y] = statsLines(s).join('\n');
  render();
}
function statsLines(s) {
  const out = [];
  if (s.money) out.push(`账本：花了 ¥${s.money.spend}，收入 ¥${s.money.income}${s.money.bought.length ? `；心愿单买了：${s.money.bought.join('、')}` : ''}`);
  if (s.things) out.push(`物品档案：新添了 ${s.things.added} 样东西${s.things.big.length ? `，大件有：${s.things.big.join('、')}` : ''}`);
  if (s.life) {
    const l = s.life;
    const bits = [l.visits ? `出去走了 ${l.visits} 次（${l.places.slice(0, 8).join('、')}）` : '', l.goals.length ? `做到了：${l.goals.join('、')}` : '',
      l.people ? `身边的人里新记了 ${l.people} 个` : '', l.sick ? `生病 ${l.sick} 次` : '', l.prayed ? `有 ${l.prayed} 天祷告了` : ''].filter(Boolean);
    if (bits.length) out.push(`生活：${bits.join('；')}`);
  }
  return out;
}
function yearView(y) {
  const d = store.data;
  const it = yearItems(d, y);
  const talks = d.talks.filter((t) => t.topic?.kind === 'year' && t.topic.id === String(y));
  const cache = yearStatsCache[y];
  if (!cache) loadYearStats(y);
  const lines = cache?.stats ? statsLines(cache.stats) : null;
  return h('div', {},
    back('#/years', '每一年'),
    headerSub(`${y} 年`, it.stages.map((s) => s.title).join(' → ')),
    h('div', { class: 'card' },
      h('h3', {}, '这一年的数字'),
      lines === null ? h('p', { class: 'muted small' }, '正在从另外三个网站读……')
        : lines.length ? h('ul', { class: 'small' }, lines.map((l) => h('li', {}, l))) : h('p', { class: 'muted small' }, '那时候网站还没建起来，没有数字。')),
    talks.length ? talks.map((t) => h('a', { class: 'card memoir-link', href: `#/talk/${t.id}` }, h('h3', {}, t.title), h('p', { class: 'small' }, firstLine(t.memoir, 90))))
      : null,
    h('a', { class: 'button wide', href: `#/talk/go?k=year&id=${y}` }, icon('mic'), talks.length ? '再聊聊这一年' : '聊聊这一年'),
    h('div', { class: 'section-title' }, `这一年的事（${it.events.length + it.resume.length}）`),
    it.events.length || it.resume.length ? h('div', { class: 'tl' }, timelineItems({ ...d, events: it.events, resume: it.resume }).map(tlRow)) : h('p', { class: 'muted small pad' }, '还没有。'),
    it.diary.length ? [h('div', { class: 'section-title' }, `日记（${it.diary.length}）`), h('div', { class: 'group' }, it.diary.map((x) => cell({ href: `#/diary/${x.id}`, ic: 'book', title: firstLine(x.text, 24), meta: shortDate(x.date) })))] : null);
}

// ---------- 地图 ----------

const PLACE_KINDS = [['home', '家'], ['school', '上学'], ['live', '住过'], ['trip', '去过']];
let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletLoading) {
    leafletLoading = new Promise((resolve, reject) => {
      document.head.append(h('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' }));
      const s = h('script', { src: 'vendor/leaflet/leaflet.js' });
      s.onload = () => resolve(window.L);
      s.onerror = () => { leafletLoading = null; reject(new Error('地图加载失败')); };
      document.head.append(s);
    });
  }
  return leafletLoading;
}
const AMAP_TILES = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
const mapState = { placing: null };
function mapView() {
  const d = store.data;
  const el = h('div', { class: 'map' });
  const placed = d.places.filter((p) => p.lat);
  const unplaced = d.places.filter((p) => !p.lat);
  loadLeaflet().then((L) => {
    if (!el.isConnected) return;
    const map = L.map(el, { zoomControl: false, attributionControl: false });
    L.tileLayer(AMAP_TILES, { subdomains: '1234', maxZoom: 18 }).addTo(map);
    const pts = [];
    for (const p of placed) {
      const evs = d.events.filter((e) => e.placeId === p.id);
      const m = L.marker([p.lat, p.lng], { draggable: true, title: p.name, icon: L.divIcon({ className: `pin pin-${p.kind || 'live'}`, html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -10] }) }).addTo(map);
      m.bindPopup(`${p.name}${evs.length ? `（${evs.length} 件事）` : ''}${p.approx ? '<br><small>位置是大概的，可以拖动</small>' : ''}`);
      m.on('dragend', () => { const ll = m.getLatLng(); save(`地图：挪 ${p.name}`, (data) => { const x = data.places.find((y) => y.id === p.id); x.lat = +ll.lat.toFixed(5); x.lng = +ll.lng.toFixed(5); delete x.approx; }).then(() => toast('挪好了')).catch(() => {}); });
      pts.push([p.lat, p.lng]);
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
    else map.setView(pts[0] || [36.0, 117.5], pts.length ? 11 : 5);
    if (pts.length > 1) {
      const order = placed.filter((p) => p.from).sort((a, b) => a.from.localeCompare(b.from)).map((p) => [p.lat, p.lng]);
      if (order.length > 1) L.polyline(order, { color: '#7a68b0', weight: 2, dashArray: '4 6', opacity: 0.7 }).addTo(map);
    }
    map.on('click', (ev) => {
      if (!mapState.placing) return;
      const id = mapState.placing;
      mapState.placing = null;
      saveRender('地图：放一个地方', (data) => { const x = data.places.find((y) => y.id === id); x.lat = +ev.latlng.lat.toFixed(5); x.lng = +ev.latlng.lng.toFixed(5); });
    });
  }).catch((e) => { el.textContent = e.message; });
  const addPlace = () => {
    const name = h('input', { placeholder: '比如 老家、高中老校区', 'aria-label': '地方的名字' });
    let kind = 'live';
    const kb = h('div');
    const drawK = () => kb.replaceChildren(chipRow('种类', PLACE_KINDS, kind, (v) => { kind = v || kind; drawK(); }));
    drawK();
    const from = dateInput('', '从什么时候');
    openSheet({ title: '加一个地方', body: h('div', { class: 'form' }, name, kb, h('label', {}, '从什么时候（用来连线，可以不写）', from)), confirmText: '加上，去地图上点位置',
      onConfirm: () => {
        const f = readDate(from, '时间');
        if (f === null || !name.value.trim()) return false;
        const id = newId('pl');
        mapState.placing = id;
        return saveRender('地图：加地方', (data) => { data.places.push({ id, name: name.value.trim(), kind, from: f }); }).then(() => toast('在地图上点一下它在哪'));
      } });
  };
  return h('div', {},
    back('#/timeline', '年表'),
    header('地图', h('button', { class: 'icon-btn', 'aria-label': '加一个地方', onclick: addPlace }, icon('plus')),
      helpButton('地图', [['这一页', ['住过、上过学、去过的地方。按时间先后用虚线连起来。', '标着「大概」的位置是估的：按住拖到准确的地方。', '记事的时候可以选「地图上的地方」，这里点开就能看到那里发生过几件事。']]])),
    mapState.placing ? h('div', { class: 'banner soon' }, '在地图上点一下，放「', d.places.find((p) => p.id === mapState.placing)?.name || '', '」') : null,
    el,
    unplaced.length ? h('div', { class: 'card' }, h('h3', {}, '还没放到地图上'), h('div', { class: 'chips' }, unplaced.map((p) => h('button', { type: 'button', class: 'chip', onclick: () => { mapState.placing = p.id; render(); } }, p.name)))) : null,
    placed.length ? h('div', { class: 'group' }, [...placed].sort((a, b) => (a.from || '9').localeCompare(b.from || '9')).map((p) => h('div', { class: 'cell' },
      h('span', { class: 'grow' }, p.name, h('span', { class: 'muted small block' }, [PLACE_KINDS.find(([k]) => k === p.kind)?.[1], p.from ? `${shortDate(p.from)} 起` : '', p.approx ? '位置是大概的' : ''].filter(Boolean).join(' · '))),
      h('button', { class: 'link small', onclick: () => saveUndoable(`地图：删 ${p.name}`, (data) => { data.places = data.places.filter((x) => x.id !== p.id); for (const e of data.events) if (e.placeId === p.id) delete e.placeId; }, '删掉了').then(render) }, '删')))) : null);
}

// ---------- 给 AI 的简介 ----------

const PROFILE_HELP = [
  ['这是什么', ['从年表、阶段、关于我、履历整理出来的一份简介。', '账本、生活、物品档案里的 DeepSeek 每次都会带上它，给你的建议会更贴近你。', '下面「给 ChatGPT 的」那份短一些，可以复制进 ChatGPT 的「自定义指令」或者「记忆」。']],
  ['什么时候重新整理', ['写了不少新东西以后点一下「重新整理」。DeepSeek 写好先给你看，你点「用这一版」才换。', '也可以直接改文字。']],
];
const profileState = { busy: false, draft: null };
function profileView() {
  const d = store.data;
  const p = d.profile;
  lifeSnap();
  const regen = async () => {
    profileState.busy = true; render();
    try {
      const system = [
        '你帮一个人写一份「关于我」的简介，给别的 AI 助手当背景（他用这些助手记账、管理物品、照顾生活和身体）。',
        '材料是他自己的人生记录。要求：',
        '- text：800–1500 字，第三人称（「他」），分几段：基本情况和现在的生活；一路走来的经历（按阶段，几句话一段，重要的事优先）；性格和看重的；喜欢和不喜欢的；身体；信仰；对重要事情的看法（写出是怎么变的，以现在的为准）；和他说话要注意什么。',
        '- 只写材料里有的，不要编，不要评价和拔高，不写鼓励的话。',
        '- chatgpt：300 字以内，第一人称（「我」），给 ChatGPT 的自定义指令：我是谁、现在的情况、希望怎么和我说话。',
        '只输出 JSON：{"text":"","chatgpt":""}',
      ].join('\n');
      const out = await askJson(await aiConfig(), system, `今天 ${todayKey()}。\n\n${storyDigest(d, personName)}`, { maxTokens: 8000, timeout: 180000 });
      if (!out.text) throw new Error('DeepSeek 没写出来，再试一次');
      profileState.draft = { text: String(out.text).trim(), chatgpt: String(out.chatgpt || '').trim() };
    } catch (e) { toast(e.message, 'error'); }
    profileState.busy = false; render();
  };
  const useDraft = async (rec) => {
    try {
      await saving('正在保存…', async () => {
        const full = { ...rec, at: nowIso() };
        await store.save('给 AI 的简介', (data) => { data.profile = full; });
        // 另外三个网站读的是这一份小文件（不用整个读 story.json）
        await store.saveJson('profile.json', () => ({ text: full.text, at: full.at }), '给 AI 的简介（另外三个网站用）');
        writeJson('story-profile', { text: full.text, fetched: Date.now() }); // 同一个网址下另外三个网站读的缓存，马上换成新的
      });
      profileState.draft = null; toast('换好了'); render();
    } catch { /* 已提示 */ }
  };
  const editSheet = () => {
    const ta = h('textarea', { rows: 16, 'aria-label': '简介' }); ta.value = p?.text || '';
    const tb = h('textarea', { rows: 6, 'aria-label': '给 ChatGPT 的' }); tb.value = p?.chatgpt || '';
    openSheet({ title: '改简介', body: h('div', { class: 'form' }, h('label', {}, '简介', ta), h('label', {}, '给 ChatGPT 的', tb)), confirmText: '存好',
      onConfirm: () => useDraft({ text: ta.value.trim(), chatgpt: tb.value.trim() }) });
  };
  const dr = profileState.draft;
  return h('div', {},
    back('#/more', '更多'),
    headerSub('给 AI 的简介', p?.at ? `${p.at.slice(0, 10)} 整理的` : '还没整理过', helpButton('给 AI 的简介', PROFILE_HELP)),
    dr ? h('div', { class: 'card draft' },
      h('h3', {}, '新的一版（还没用）'),
      h('div', { class: 'prose small' }, paras(dr.text)),
      dr.chatgpt ? [h('h3', {}, '给 ChatGPT 的'), h('div', { class: 'prose small' }, paras(dr.chatgpt))] : null,
      h('div', { class: 'actions' }, h('button', { onclick: () => useDraft(dr) }, '用这一版'), h('button', { class: 'secondary', onclick: () => { profileState.draft = null; render(); } }, '不要'))) : null,
    h('div', { class: 'card' },
      p?.text ? h('div', { class: 'prose small' }, paras(p.text)) : h('p', { class: 'muted small' }, '还没有。写了一些东西以后，点下面「整理」。'),
      h('div', { class: 'actions' },
        h('button', { class: 'secondary small', disabled: profileState.busy, onclick: regen }, icon('sparkle'), profileState.busy ? 'DeepSeek 正在写……' : p ? '重新整理' : '整理'),
        p ? h('button', { class: 'secondary small', onclick: editSheet }, icon('pen'), '自己改') : null)),
    p?.chatgpt ? h('div', { class: 'card' }, h('h3', {}, '给 ChatGPT 的'), h('div', { class: 'prose small' }, paras(p.chatgpt)),
      h('button', { class: 'secondary small', onclick: () => copyText(p.chatgpt) }, icon('copy'), '复制')) : null);
}

// ---------- 更多 ----------

function moreView() {
  const d = store.data;
  return h('div', {},
    header('更多'),
    h('div', { class: 'group' },
      cell({ href: '#/resume', ic: 'receipt', title: '履历', meta: d.resume.length ? `${d.resume.length} 条` : '' }),
      cell({ href: '#/diary', ic: 'book', title: '日记', meta: d.diary.length ? `${d.diary.length} 篇` : '' }),
      cell({ href: '#/years', ic: 'calendar', title: '每一年', sub: '年度回顾' }),
      cell({ href: '#/map', ic: 'globe', title: '地图', sub: '住过、上过学、去过的地方' })),
    h('div', { class: 'group' },
      cell({ href: '#/profile', ic: 'sparkle', title: '给 AI 的简介', sub: '另外三个网站的 AI 会用它', meta: d.profile?.at ? d.profile.at.slice(0, 10) : '还没整理' })),
    h('div', { class: 'group' },
      cell({ href: '#/settings', ic: 'gear', title: '设置' })));
}

// ---------- 设置 ----------

function setupView() {
  const start = async () => {
    try {
      await saving('正在创建…', () => store.create(defaultData(todayKey()), '开始写我的故事'));
      toast('建好了');
      go('#/', true);
    } catch { /* 已提示 */ }
  };
  return h('div', {},
    headerSub('开始', '数据仓库里还没有记录'),
    h('div', { class: 'card' }, h('p', {}, '点下面的按钮，在数据仓库里建一份空的记录。'), h('button', { class: 'wide', onclick: start }, '开始')));
}

function settingsView() {
  const repo = h('input', { value: settings.repo || DEFAULT_REPO, 'aria-label': '数据仓库' });
  const token = h('input', { type: 'password', value: settings.shared ? '' : settings.token || '', placeholder: settings.shared ? '正在用另外几个网站的令牌' : 'github_pat_…', 'aria-label': '令牌' });
  const saveSettings = () => {
    const t = token.value.trim();
    const old = readJson(SETTINGS_KEY);
    writeJson(SETTINGS_KEY, { repo: repo.value.trim() || DEFAULT_REPO, ...(t ? { token: t } : old.token ? { token: old.token } : {}) });
    settings = readSettings();
    if (!settings.token) return toast('请填写令牌', 'error');
    connect();
    loadError = null;
    const after = sessionStorage.getItem('story-after-login');
    sessionStorage.removeItem('story-after-login');
    go(after || '#/', true);
    refresh();
  };
  const logout = () => {
    if (!confirm('退出这台设备？\n数据在 GitHub 上，不会丢；以后重新填令牌就能回来。')) return;
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem('story-cache');
    settings = {};
    store = null;
    go('#/settings', true);
  };
  return h('div', {},
    header('设置'),
    h('div', { class: 'card' },
      h('h3', {}, '连接数据仓库'),
      h('p', { class: 'small' }, '记录存在你的 GitHub 私有仓库 story-data 里。和另外三个网站用同一个令牌，只要让令牌多授权这个仓库：'),
      h('ol', { class: 'small' },
        h('li', {}, '打开 github.com → 右上角头像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens。'),
        h('li', {}, '点物品档案用的那个令牌 → Edit。'),
        h('li', {}, 'Repository access 里把 story-data 也勾上（Contents 权限已经是 Read and write）→ Update。'),
        h('li', {}, '回到这里点「保存并连接」。令牌本身没变，不用重新复制。')),
      h('div', { class: 'form' },
        h('label', {}, '数据仓库', repo),
        h('label', {}, settings.shared ? '令牌（留空 = 用另外几个网站的）' : '令牌', token)),
      h('button', { class: 'wide', onclick: saveSettings }, '保存并连接')),
    settings.token ? h('div', { class: 'card' },
      h('p', { class: 'small' }, '数据仓库：', settings.repo || DEFAULT_REPO, '（每次修改都是一次提交，可以在 GitHub 上查看历史）'),
      lifeCache.error ? h('p', { class: 'small warn-text' }, '读不到生活网站的「身边的人」：', lifeCache.error) : null,
      h('div', { class: 'actions' }, h('button', { class: 'danger', onclick: logout }, '退出这台设备'))) : null);
}

boot();
