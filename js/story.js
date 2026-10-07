// 我的故事：纯计算（不碰页面）。日期、阶段、线、人生地图、那年今天、一年的汇总。
//
// 日期可以不完整：'2015'、'2015-09'、'2015-09-01'。approx = 记不清、大概；label = 自己的说法（「大概初二」「高考完那个暑假」）。

export const DATA_VERSION = 1;

// 主线按上学分（用户 2026-10-06 定）。初中只上了两年，初三直升到高中老校区；高一换到新校区。
export const DEFAULT_STAGES = [
  ['s-family', '出生和家'],
  ['s-pre', '上学前'],
  ['s-primary', '小学'],
  ['s-middle', '初中', '初一、初二'],
  ['s-middle3', '初三 · 直升', '在高中老校区'],
  ['s-high', '高中', '新校区'],
  ['s-summer', '高考后的暑假'],
  ['s-college', '本科'],
  ['s-gap', '本科毕业到读博'],
  ['s-phd', '读博'],
];

// 横着穿过所有阶段的线
export const DEFAULT_THREADS = [
  ['t-family', '家'],
  ['t-friend', '友情'],
  ['t-love', '感情'],
  ['t-math', '数学'],
  ['t-music', '音乐'],
  ['t-faith', '信仰'],
  ['t-body', '身体'],
];

// 一个阶段里记什么
export const STAGE_FIELDS = [
  ['city', '在哪里', '城市、学校、住在哪（家里 / 寄宿 / 宿舍几人间）'],
  ['busy', '在忙什么', '那时候每天在忙什么、最在意什么'],
  ['me', '那时候的我', '性格、成绩、爱好、是什么样的人'],
  ['good', '开心的事', ''],
  ['hard', '难的事', ''],
  ['left', '留下了什么', '回头看，这一段留给我的'],
];

export const EVENT_KINDS = [
  ['study', '学业'], ['home', '家'], ['move', '搬家'], ['health', '健康'], ['faith', '信仰'],
  ['first', '第一次'], ['gain', '得到'], ['loss', '失去'], ['turn', '转折'], ['other', '其他'],
];

export const ABOUT_SECS = [
  ['basic', '基本'],
  ['character', '性格'],
  ['values', '看重的'],
  ['views', '我怎么看'],
  ['likes', '喜欢的'],
  ['dislikes', '不喜欢的'],
  ['habits', '习惯'],
  ['body', '身体'],
  ['faith', '信仰'],
  ['talk', '和我说话'],
];

export const RESUME_KINDS = [
  ['edu', '学历'], ['exam', '考试'], ['award', '奖和荣誉'], ['paper', '论文和研究'],
  ['report', '报告和会议'], ['work', '兼职和工作'], ['skill', '技能'],
];

// 阶段 → 生活网站「身边的人」的分组（新认识的人默认放这里，可以改）
export const STAGE_GROUP = {
  's-family': 'family', 's-pre': 'family', 's-primary': 'primary', 's-middle': 'middle', 's-middle3': 'high',
  's-high': 'high', 's-summer': 'high', 's-college': 'college', 's-gap': 'college', 's-phd': 'grad',
};
export const PEOPLE_GROUPS = [
  ['family', '家人'], ['relative', '亲戚'], ['primary', '小学'], ['middle', '初中'], ['high', '高中'], ['college', '本科'], ['grad', '研究生'],
];

export function defaultData(today) {
  return {
    version: DATA_VERSION,
    startDate: today,
    settings: {},
    stages: DEFAULT_STAGES.map(([id, title, sub]) => ({ id, title, ...(sub ? { sub } : {}) })),
    threads: DEFAULT_THREADS.map(([id, name]) => ({ id, name })),
    events: [], // { id, date, approx?, label?, resume?（代表的履历 id）, title, text, feel, place, placeId?, people: [人 id], stage?, threads: [], kind, big?, from?: { talk | diary }, at }
    talks: [], // { id, topic: { kind: stage|thread|year|free, id, title }, title, memoir, chat, at }
    diary: [], // { id, date, place, weather, text, from? }
    about: [], // { id, sec, topic, versions: [{ id, date, label?, text, from? }] }
    resume: [], // { id, kind, title, org, from, to, detail }
    places: [], // { id, name, kind: home|school|live|trip, lat, lng, approx?, note }
    cities: [], // 年表的线路：住过的城市 { id, name, from, color }，换城市就是换乘
    songs: [], // 展示柜里最喜欢的歌：{ id, name, artist?, album?, since?, note?, at }（按放进去的顺序）
    answers: [], // 每天一个小问题：{ id, qid, q, stage?, thread?, text?, talk?（用 ChatGPT 聊的那次）, day, at }
    years: {}, // { '2026': { memoir, at } }
    profile: null, // { text, chatgpt, at }
  };
}

export function migrate(data) {
  const d = defaultData(data.startDate || '');
  for (const k of ['events', 'talks', 'diary', 'about', 'resume', 'places', 'cities', 'answers', 'songs']) data[k] ||= [];
  data.settings ||= {};
  data.years ||= {};
  if (!data.stages?.length) data.stages = d.stages;
  if (!data.threads?.length) data.threads = d.threads;
  if (data.profile === undefined) data.profile = null;
  return data;
}

// ---------- 日期 ----------

const pad = (n) => String(n).padStart(2, '0');
export function ymd(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export function todayKey() { return ymd(new Date()); }

// 不完整的日期补成可以比较的样子：开头（'2015' → '2015-01-01'）、结尾（'2015' → '2015-12-31'）
export function dateStart(s) {
  if (!s) return '';
  const [y, m = '01', d = '01'] = s.split('-');
  return `${y}-${m}-${d}`;
}
export function dateEnd(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  if (d) return s;
  if (m) return `${y}-${m}-${pad(new Date(Number(y), Number(m), 0).getDate())}`;
  return `${y}-12-31`;
}
export const yearOf = (s) => (s ? Number(s.slice(0, 4)) : null);

// 「2015 年 9 月 1 日」「2015 年 9 月」「2015 年」；approx 加「大概」；label 优先
export function dateText(s, { approx = false, label = '' } = {}) {
  if (label) return label;
  if (!s) return '还没定时间';
  const [y, m, d] = s.split('-').map(Number);
  const t = d ? `${y} 年 ${m} 月 ${d} 日` : m ? `${y} 年 ${m} 月` : `${y} 年`;
  return approx ? `大概 ${t}` : t;
}
export function shortDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return d ? `${y}.${m}.${d}` : m ? `${y}.${m}` : `${y}`;
}
// 把用户随手写的日期认成 'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD'；认不出返回 null
export function parseDate(text) {
  const t = String(text || '').trim().replace(/[年月/.]/g, '-').replace(/[日号\s]/g, '').replace(/-+$/, '');
  const m = t.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (mo && (Number(mo) < 1 || Number(mo) > 12)) return null;
  if (d && (Number(d) < 1 || Number(d) > 31)) return null;
  return [y, mo && pad(Number(mo)), d && pad(Number(d))].filter(Boolean).join('-');
}

// 阶段的时间段：from / to 是不完整日期，to 空着 = 到现在
export function stageRange(s) {
  return { from: s.from ? dateStart(s.from) : '', to: s.to ? dateEnd(s.to) : s.from ? '9999-12-31' : '' };
}
export function stageYears(s) {
  if (!s.from && !s.to) return '';
  const a = s.from ? yearOf(s.from) : '?';
  const b = s.to ? yearOf(s.to) : '现在';
  return a === b ? `${a}` : `${a}–${b}`;
}

// 一个日期落在哪个阶段（几个重叠时取开始得最晚的那个）
export function stageOfDate(stages, s) {
  if (!s) return null;
  const x = dateStart(s);
  let best = null;
  for (const st of stages) {
    const r = stageRange(st);
    if (!r.from || x < r.from || x > r.to) continue;
    if (!best || r.from >= stageRange(best).from) best = st;
  }
  return best;
}
// 事情属于哪个阶段：自己选的优先，没选就按时间
export function eventStage(data, e) {
  return (e.stage && data.stages.find((s) => s.id === e.stage)) || stageOfDate(data.stages, e.date);
}

// 年表排序：按开始日期；同一天按记下的先后
export function sortEvents(list) {
  return [...list].sort((a, b) => (dateStart(a.date) || '9999').localeCompare(dateStart(b.date) || '9999') || (a.at || '').localeCompare(b.at || ''));
}

// 年表上的一行：自己的事 + 履历里有日期的（不用记两遍）。事情的 resume = 履历 id 时，那条履历就由这件事代表
export function timelineItems(data) {
  const out = data.events.map((e) => ({ kind: 'event', id: e.id, date: e.date, approx: e.approx, label: e.label, title: e.title, big: e.big, threads: e.threads || [], people: e.people || [], stage: e.stage, at: e.at, e }));
  const linked = new Set(data.events.map((e) => e.resume).filter(Boolean)); // 已经有一件事写着它的，不再单独出现
  for (const r of data.resume) {
    if (!r.from || linked.has(r.id)) continue;
    out.push({ kind: 'resume', id: r.id, date: r.from, title: resumeTitle(r), threads: r.kind === 'paper' || r.kind === 'report' ? ['t-math'] : [], people: [], at: r.at || '', r });
  }
  return sortEvents(out);
}
export function resumeTitle(r) {
  const k = RESUME_KINDS.find(([id]) => id === r.kind)?.[1] || '';
  return [r.title, r.org].filter(Boolean).join(' · ') || k;
}

// ---------- 人生地图：每个阶段写了多少 ----------

export function stageFill(data, st) {
  const events = data.events.filter((e) => eventStage(data, e)?.id === st.id).length;
  const talks = data.talks.filter((t) => t.topic?.kind === 'stage' && t.topic.id === st.id).length;
  const fields = STAGE_FIELDS.filter(([k]) => (st[k] || '').trim()).length + ((st.line || '').trim() ? 1 : 0);
  const r = stageRange(st);
  const diary = r.from ? data.diary.filter((x) => x.date >= r.from && x.date <= r.to).length : 0;
  const answers = (data.answers || []).filter((a) => a.stage === st.id).length;
  // 0–4 档：空着 / 有一点 / 有些 / 不少 / 很满
  const score = talks * 3 + Math.min(events, 12) + fields + Math.min(diary, 6) / 2 + Math.min(answers, 6) / 2;
  const level = score === 0 ? 0 : score < 4 ? 1 : score < 9 ? 2 : score < 15 ? 3 : 4;
  return { events, talks, fields, diary, level };
}

// 建议下一次聊什么：按时间顺序第一个还没聊过的阶段；都聊过就挑写得最少的；再看线
export function suggestTopic(data) {
  const talked = new Set(data.talks.filter((t) => t.topic?.kind === 'stage').map((t) => t.topic.id));
  const first = data.stages.find((s) => !talked.has(s.id));
  if (first) return { kind: 'stage', id: first.id, title: first.title };
  const threadTalked = new Set(data.talks.filter((t) => t.topic?.kind === 'thread').map((t) => t.topic.id));
  const th = data.threads.find((t) => !threadTalked.has(t.id));
  if (th) return { kind: 'thread', id: th.id, title: `${th.name}这条线` };
  const least = [...data.stages].sort((a, b) => stageFill(data, a).level - stageFill(data, b).level)[0];
  return { kind: 'stage', id: least.id, title: least.title };
}

// 每天一个小问题：没答过的里面，写得少的阶段、线先问；同一天固定，skip 是「换一个」点了几次
export function dailyQuestion(data, questions, day, skip = 0) {
  const done = new Set((data.answers || []).map((a) => a.qid));
  const pool = questions.filter((q) => !done.has(q.id)
    && (!q.stage || data.stages.some((s) => s.id === q.stage)) && (!q.thread || data.threads.some((t) => t.id === q.thread)));
  if (!pool.length) return null;
  const level = (q) => {
    if (q.stage) return stageFill(data, data.stages.find((s) => s.id === q.stage)).level;
    if (q.thread) return Math.min(4, Math.floor(data.events.filter((e) => e.threads?.includes(q.thread)).length / 3));
    return 1;
  };
  const min = Math.min(...pool.map(level));
  const near = pool.filter((q) => level(q) <= min + 1);
  let seed = 0;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) % 100003;
  return near[(seed + skip) % near.length];
}

// ---------- 展示柜里的歌 ----------

// 一次放好几首：一行一首「歌名 — 歌手 — 专辑」（也认 | ｜ 分隔；破折号两边要有空格，免得拆开歌名里的连字符）
export function parseSongLines(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name = '', artist = '', album = ''] = line.split(/\s*[|｜]\s*|\s+[—–-]{1,2}\s+/).map((x) => x.trim());
    return { name, artist, album };
  }).filter((x) => x.name);
}
// 柜子：每个歌手一层，层里按专辑分开（都按第一次放进去的顺序）；没写专辑的放在最后
export function songShelves(songs) {
  const shelves = new Map();
  for (const x of songs) {
    const a = x.artist || '';
    if (!shelves.has(a)) shelves.set(a, new Map());
    const albums = shelves.get(a);
    const al = x.album || '';
    if (!albums.has(al)) albums.set(al, []);
    albums.get(al).push(x);
  }
  return [...shelves.entries()].map(([artist, albums]) => ({
    artist,
    albums: [...albums.entries()].sort((p, q) => (p[0] ? 0 : 1) - (q[0] ? 0 : 1)).map(([album, list]) => ({ album, songs: list })),
  }));
}

// ---------- 那年今天 ----------

export function onThisDay(data, today = todayKey()) {
  const md = today.slice(5);
  const y = Number(today.slice(0, 4));
  const ev = data.events.filter((e) => e.date?.length === 10 && e.date.slice(5) === md && yearOf(e.date) < y)
    .map((e) => ({ kind: 'event', id: e.id, date: e.date, title: e.title }));
  const di = data.diary.filter((x) => x.date.slice(5) === md && yearOf(x.date) < y)
    .map((x) => ({ kind: 'diary', id: x.id, date: x.date, title: firstLine(x.text) }));
  return [...ev, ...di].sort((a, b) => b.date.localeCompare(a.date));
}
export function firstLine(text, n = 40) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}……` : t;
}

// ---------- 关于我：一条可以有好几个时期的说法 ----------

export function sortVersions(vs) {
  return [...(vs || [])].sort((a, b) => (dateStart(a.date) || '0000').localeCompare(dateStart(b.date) || '0000'));
}
export const latestVersion = (entry) => sortVersions(entry.versions).at(-1) || null;

// 某一时期的说法写成「2023 年 8 月（本科）：……」
export function versionWhen(data, v) {
  const st = v.date ? stageOfDate(data.stages, v.date) : null;
  const t = v.label || (v.date ? dateText(v.date) : '');
  return [t, st && !v.label ? st.title : ''].filter(Boolean).join(' · ');
}

// DeepSeek 提议的「关于我」：同一栏同一个话题就加成新的时期，不然新建一条
export function applyAbout(data, prop, newId, from) {
  const topic = (prop.topic || '').trim();
  const text = (prop.text || '').trim();
  if (!text) return null;
  let entry = topic && data.about.find((a) => a.sec === prop.sec && a.topic === topic);
  const v = { id: newId('v'), date: prop.date || '', text, ...(prop.label ? { label: prop.label } : {}), ...(from ? { from } : {}) };
  if (entry) {
    if (entry.versions.some((x) => x.text === text)) return entry;
    entry.versions.push(v);
  } else {
    entry = { id: newId('a'), sec: ABOUT_SECS.some(([k]) => k === prop.sec) ? prop.sec : 'character', topic, versions: [v] };
    data.about.push(entry);
  }
  return entry;
}

// ---------- 一年 ----------

export function yearsSpan(data, today = todayKey()) {
  const ys = [
    ...data.events.map((e) => yearOf(e.date)), ...data.diary.map((x) => yearOf(x.date)),
    ...data.stages.flatMap((s) => [yearOf(s.from), yearOf(s.to)]),
  ].filter(Boolean);
  const now = yearOf(today);
  const from = ys.length ? Math.min(...ys) : now;
  return Array.from({ length: now - from + 1 }, (_, i) => now - i);
}

export function yearItems(data, y) {
  const ys = String(y);
  return {
    events: sortEvents(data.events.filter((e) => e.date?.startsWith(ys))),
    diary: data.diary.filter((x) => x.date.startsWith(ys)).sort((a, b) => a.date.localeCompare(b.date)),
    resume: data.resume.filter((r) => r.from?.startsWith(ys)),
    stages: data.stages.filter((s) => { const r = stageRange(s); return r.from && r.from <= `${ys}-12-31` && r.to >= `${ys}-01-01`; }),
  };
}

// 另外三个网站这一年的数字（读不到的那一块就是 null）
export function yearStats(y, { fin, inv, life }) {
  const ys = String(y);
  const out = {};
  if (fin) {
    const tx = (fin.tx || []).filter((t) => (t.date || '').startsWith(ys));
    const spend = tx.filter((t) => t.type === 'expense' || t.type === 'writeoff').reduce((a, t) => a + Number(t.cny ?? t.amount ?? 0), 0);
    const income = tx.filter((t) => t.type === 'income').reduce((a, t) => a + Number(t.cny ?? t.amount ?? 0), 0);
    const bought = (fin.wishes || []).filter((w) => w.status === 'bought' && (w.boughtAt || '').startsWith(ys)).map((w) => w.name);
    out.money = tx.length ? { spend: Math.round(spend), income: Math.round(income), bought } : null;
  }
  if (inv) {
    const items = (inv.items || []).filter((i) => (i.createdAt || '').startsWith(ys));
    const big = items.filter((i) => Number(i.purchasePrice) >= 300).sort((a, b) => Number(b.purchasePrice) - Number(a.purchasePrice)).map((i) => i.name);
    out.things = items.length ? { added: items.length, big: big.slice(0, 8) } : null;
  }
  if (life) {
    const visits = (life.places || []).flatMap((p) => (p.visits || []).filter((v) => (v.day || '').startsWith(ys)).map(() => p.name));
    const goals = (life.goals || []).filter((g) => g.status === 'done' && (g.doneAt || '').startsWith(ys)).map((g) => g.title || g.wish);
    const people = (life.people || []).filter((p) => (p.at || '').startsWith(ys)).length;
    const sick = (life.sick?.history || []).filter((s) => (s.start || '').startsWith(ys)).length;
    const prayed = Object.entries(life.days || {}).filter(([d, v]) => d.startsWith(ys) && (v.prayer?.night || v.prayer?.times?.length)).length;
    out.life = { places: [...new Set(visits)], visits: visits.length, goals, people, sick, prayed };
  }
  return out;
}

// ---------- 给 AI 的材料 ----------

// 把整个故事写成一段给 DeepSeek 整理简介用的文字（不含日记全文和聊天原文，回忆只取开头）
export function storyDigest(data, peopleName) {
  const names = (ids) => (ids || []).map(peopleName).filter(Boolean).join('、');
  const lines = [];
  lines.push('【阶段】');
  for (const s of data.stages) {
    const parts = [stageYears(s), s.sub, ...STAGE_FIELDS.map(([k, t]) => (s[k] ? `${t}：${s[k]}` : '')), s.line ? `一句话：${s.line}` : ''].filter(Boolean);
    if (parts.length > 1 || s.line) lines.push(`${s.title}：${parts.join('；')}`);
  }
  lines.push('', '【年表】');
  for (const e of sortEvents(data.events)) {
    lines.push(`${dateText(e.date, e)}${e.big ? '（重要）' : ''}：${e.title}${e.people?.length ? `（和${names(e.people)}）` : ''}${e.feel ? `。感受：${e.feel}` : ''}`);
  }
  lines.push('', '【关于我】');
  for (const [sec, name] of ABOUT_SECS) {
    const list = data.about.filter((a) => a.sec === sec);
    if (!list.length) continue;
    lines.push(`${name}：`);
    for (const a of list) {
      const vs = sortVersions(a.versions);
      if (vs.length === 1) lines.push(`- ${a.topic ? `${a.topic}：` : ''}${vs[0].text}`);
      else lines.push(`- ${a.topic || ''}：${vs.map((v) => `${versionWhen(data, v) || '某时'}——${v.text}`).join(' → ')}（最后一条是现在的）`);
    }
  }
  if (data.songs?.length) {
    lines.push('', '【最喜欢的歌】');
    for (const x of data.songs) lines.push(`${x.name}${x.artist ? ` — ${x.artist}` : ''}${x.album ? `《${x.album}》` : ''}${x.since ? `（${dateText(x.since)}起）` : ''}${x.note ? `：${x.note}` : ''}`);
  }
  const answered = (data.answers || []).filter((a) => a.text);
  if (answered.length) {
    lines.push('', '【小问题】');
    for (const a of answered) lines.push(`${a.q} ${a.text}`);
  }
  if (data.resume.length) {
    lines.push('', '【履历】');
    for (const r of data.resume) lines.push(`${RESUME_KINDS.find(([k]) => k === r.kind)?.[1] || ''}：${resumeTitle(r)}${r.from ? `（${shortDate(r.from)}${r.to ? `–${shortDate(r.to)}` : ''}）` : ''}${r.detail ? `，${r.detail}` : ''}`);
  }
  return lines.join('\n');
}

// 把 ChatGPT 的整理按「### 标题」分开
export function splitSections(text) {
  const out = {};
  let cur = '_';
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*#{2,4}\s*(.+?)\s*$/);
    if (m) { cur = m[1].replace(/[：:]$/, ''); out[cur] = ''; continue; }
    out[cur] = (out[cur] || '') + line + '\n';
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}



// ---------- 年表：地铁线路图 ----------

export const LINE_COLORS = ['#b9824f', '#4f86a8', '#7a68b0', '#5f9a6a', '#b55d6a', '#8a7b5c'];

export function ageAt(birth, s) {
  if (!birth || !s) return null;
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m = 12, d = 28] = s.split('-').map(Number); // 只有年份时按年底算
  const age = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  return age >= 0 ? age : null;
}

export function sortedCities(data) {
  const list = [...(data.cities || [])].filter((c) => c.from).sort((a, b) => dateStart(a.from).localeCompare(dateStart(b.from)));
  return list.length ? list : [{ id: 'c-me', name: '', from: '0000', color: LINE_COLORS[2] }];
}
// 某个日期在哪条线上（还没到第一条线的日子，算第一条线）
export function cityIndex(cities, s) {
  const x = dateStart(s);
  let i = 0;
  cities.forEach((c, k) => { if (dateStart(c.from) <= x) i = k; });
  return i;
}

// 年表的一行一行：line（线路起点）、stage（区间：阶段名）、station（站：一件事）、transfer（换乘）、now（现在）
export function metroRows(data, items, today = todayKey()) {
  const cities = sortedCities(data);
  const dated = items.filter((x) => x.date);
  const rows = [];
  let ci = dated.length ? cityIndex(cities, dated[0].date) : cityIndex(cities, today);
  rows.push({ type: 'line', city: cities[ci], col: ci % 2 });
  let stageId = null;
  const moveTo = (k) => {
    while (ci < k) {
      rows.push({ type: 'transfer', from: cities[ci], to: cities[ci + 1], fromCol: ci % 2, toCol: (ci + 1) % 2 });
      ci++;
    }
  };
  for (const x of dated) {
    moveTo(cityIndex(cities, x.date));
    const st = x.kind === 'event' ? eventStage(data, x.e) : stageOfDate(data.stages, x.date);
    if (st && st.id !== stageId) { rows.push({ type: 'stage', stage: st, col: ci % 2, color: cities[ci].color }); stageId = st.id; }
    rows.push({ type: 'station', item: x, col: ci % 2, color: cities[ci].color });
  }
  moveTo(cityIndex(cities, today));
  rows.push({ type: 'now', col: ci % 2, color: cities[ci].color, city: cities[ci] });
  return rows;
}
