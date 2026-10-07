# 我的故事 — 给 Claude Code 的说明

用户的人生档案网站（第四个，仿照 `../life`、`../ledger`、`../inventory`）。用中文交流。目的：把整个人生一点点写下来，并整理成「给 AI 的简介」，让另外三个网站的 AI 更懂他。

外观（用户 2026-10-06 定）：**米色为主，带一些紫色**（藤紫 `--accent` 和生活网站一样）；标题、回忆、日记用宋体 `--serif`；回忆和日记用纸色 `--paper` 卡片、首行缩进。话要温柔、安静、短，不喊口号、不说教；每页右上角「?」写怎么用（`helpButton`）。**不推送、不提醒**（用户说不要）。

## 结构

- **本仓库 `ThreeLu/story`（公开）**：纯静态网页，GitHub Pages 发布在 https://threelu.github.io/story/ 。推送到 main 自动上线。
- **数据仓库 `ThreeLu/story-data`（私有）**：`story.json`（全部记录）、`profile.json`（给 AI 的简介，另外三个网站读这个小文件）。和另外三个网站同一个 fine-grained 令牌（要额外授权 story-data），没有自己的令牌时用 `localStorage['life-settings' | 'inventory-settings' | 'ledger-settings']` 的。
- **代码公开：绝不写个人信息**。人名、经历、日记、提示词里的个人情况都只在 `story.json`。`content.js` 只放通用的提示词。测试只用编的内容。
- 用户不想在本地留数据：不要把数据仓库 clone 到本地长期保存。用户给过的日记 PDF（`../main.pdf`）已经录进 `diary`。
- **隐私（生活网站「小记」那一块）完全不进这个网站**，也不进简介。其他内容 AI 都可以看，不需要每条设权限（用户定的）。
- 不要照片；不要「往后看」（将来、规划留给生活网站「想做到的事」）。

## 数据格式（story.json）

```
{ version, startDate, settings: {},
  stages: [{ id, title, sub?, from?, to?（空 = 到现在）, city, busy, me, good, hard, left, line, people: [人 id] }],
  threads: [{ id, name }],
  events: [{ id, date（'2015' | '2015-09' | '2015-09-01'）, approx?, label?（「大概初二」）, title, text, feel, place, placeId?, people: [人 id], threads: [], kind, big?, stage?（不写就按时间）, resume?（代表的履历 id）, from?: { talk | diary }, at }],
  talks: [{ id, topic: { kind: stage|thread|year|free, id, title }, title, memoir（ChatGPT 写的第一人称回忆）, chat（贴回来的原文）, at }],
  diary: [{ id, date, place, weather, text, from? }],
  about: [{ id, sec, topic, icon?（展品的样子，pieces.js 的键）, versions: [{ id, date, label?, text, from? }] }],
  resume: [{ id, kind: edu|exam|award|paper|report|work|skill, title, org, from, to, detail, at }],
  places: [{ id, name, kind: home|school|live|trip, lat, lng（高德坐标）, approx?, from? }]（住处只定位到小区，用户说的）,
  cities: [{ id, name, from, color }]（年表的线路）, settings: { birth? },
  answers: [{ id, qid, q, stage?, thread?, text?, talk?, day, at }]（每天一个小问题）,
  years: {}, profile: { text, chatgpt, at } | null }
```

- 阶段（用户定的）：出生和家 → 上学前 → 小学 → 初中（初一、初二）→ 初三 · 直升（高中老校区）→ 高中（新校区）→ 高考后的暑假 → 本科 → 本科毕业到读博 → 读博。线：家、友情、感情、数学、音乐、信仰、身体。
- 人都存生活网站 `life-data/life.json` 的 `people` id（「身边的人」），不在这里另存名单。`lifeSnap()` 读一次存 5 分钟；拆聊天前 `ensureLife()` 必须读到名单（不然认识的人都会被当成新的）。新认识的人在「看一看」里确认后用 `updateLife()` 加进 life.json（分组按阶段猜 `STAGE_GROUP`，可改；男 / 女必选）。人名链接到生活网站 `#/person/:id`。生活网站人的页面里有「在我的故事里」（读 story.json 里带这个人的事）。
- 「关于我」是一个**展示柜**（用户 2026-10-07 定：不要列表，也不是给 AI 看的资料，要「像展示的柜子」）：木框玻璃柜，每个栏目一层，层板正面铜牌写栏目名；每一条是一件**展品**（`js/pieces.js` 的线描小物件，按话题猜 `guessPiece`，可以「换个样子」存 `about[].icon`）+ 白色展签（话题，有几个时期就几个小点）；每层最后「＋」放一件。点开是展品说明页（玻璃展台 + 展签：展品 · 栏目、话题、年代）和「年代」（各个时期）。
- **看法会变**（用户强调）：「关于我」一条（`sec` + `topic`）可以有好几个时期 `versions`，按 `date` 排，最后一个是现在的；想法变了加一个时期，不删以前的。DeepSeek 提议的同一栏同一话题加成新时期（`applyAbout`）。
- 年表 `timelineItems`：事情 + 有开始日期的履历（事情写了 `resume` 的那条履历不再单独出现）。**画成地铁线路图**（用户 2026-10-07 选的，之前的细线列表他嫌没设计感）：`cities`（住过的城市，`from` 起）每个一条线、一种颜色（`LINE_COLORS`），换城市是换乘站（两列轨道 `METRO_X` 交替，中间白色圆角换乘标志）；每件事一个站（重要的大站、宋体加粗，履历是方形站），站名上写日子 · 大概 · 几岁（`ageAt`，生日 `settings.birth`）；阶段变了插一个灰色小牌子（点了进阶段）；最后「现在」脉动圆点 + 虚线。`metroRows` 算行，`linesSheet` 改线路。没日期的事放在下面「还没定时间」。其他页面（线、年份、聊天）里的小时间线还是 `tlRow`。
- 和 ChatGPT 聊（`#/talk`、`#/talk/go?k=stage|thread|year|free&id=&t=`）：`talkPrompt` / `yearPrompt`（content.js，带上这一题已经写下的 `knownFor`，免得重问）→ ChatGPT 语音聊 15–30 分钟 → 说「整理一下」，固定格式（### 回忆 / 事情 / 人 / 那时候的我 / 履历）→ 贴回 → `splitSections` 取回忆原文，`splitTalk`（DeepSeek）拆成 events / people / stage / about / resume → `talkReview` 一条条勾 → 存。原话（回忆）和拆出来的要点都留（用户定的）。建议下一个话题 `suggestTopic`：按时间第一个没聊过的阶段，再到线。
- 人生地图（首页，`shelfCard`）：**一排书脊**（用户 2026-10-07 选的，之前的列表他嫌丑）。每个阶段一本书，宋体竖排书名；宽度按年数开方长（`30 + √年 × 9`），高度按名字长短；颜色按 `stageFill` 的 0–4 档（空的是米白纸色，满的是藤紫）；现在这一段夹一条金色书签；下面是书架板和开始年份。书架可以左右滑，打开时停在最右边（现在），滑到哪里记在 `shelfScroll`。
- 每一年（`#/year/:y`）：这一年的事、日记、阶段 + 另外三个网站的数字（`yearStats`：账本花了 / 收入 / 心愿单买了什么，物品档案新添几样和 300 元以上的大件，生活网站出去走了哪些地方、做到的事、新记的人、生病几次、祷告天数），只读。年底聊「这一年」（`yearPrompt` 带这些数字）。
- 给 AI 的简介（`#/profile`）：`storyDigest` 把阶段、年表、关于我（多个时期都给，标明最后是现在）、履历写成材料 → DeepSeek 写 `text`（第三人称 800–1500 字）和 `chatgpt`（第一人称、给 ChatGPT 自定义指令）→ 用户点「用这一版」才换，同时写 `profile.json`。**另外三个网站的 `js/ai.js` 读 `story-data/profile.json`（缓存一天）加在每次 DeepSeek 请求的 system 后面。**
- 地图（`#/map`）：Leaflet（`vendor/leaflet`，按需加载）+ 高德底图（不用密钥）；紫色圆点可拖动改位置，`approx` 的是估的；有 `from` 的按时间虚线连起来。
- DeepSeek 密钥读物品档案仓库 `config/ai.json`（`aiConfig`）。

- 提示（toast）一次只出一条，新的换掉旧的；底部有「撤销」时普通提示放在它上面（`.toast.raised`）。四个网站一样。

## 代码

- `js/story.js` 纯计算；`js/content.js` 提示词；`js/main.js` 路由和页面；`js/store.js`、`github.js`、`util.js`、`icons.js`、`ai.js`、`picker.js` 和生活网站同一套（先存手机、后台上传）。语法检查 `node --input-type=module --check < js/main.js`。

## 测试

- `python3 tests/test_app.py`：真浏览器 + 本地假 GitHub（假的 story-data、life-data、finance-data、inventory-data），DeepSeek 和地图底图是假的。推送后 GitHub Actions 自动跑。**改了功能就加对应步骤。绝不拿真实数据仓库做写入测试。**
- 按下去的手感（2026-10-07）：按钮、卡片轻轻缩一点，列表行变深，在 `app.css` 最后（四个网站同一段）。
- 每天一个小问题（2026-10-07，首页最上面 `questionCard`）：题库 `QUESTIONS`（content.js，通用的短问题，带 stage / thread）；`dailyQuestion` 在没答过的里挑写得少的阶段、线（同一天固定，「换一个」次数存 localStorage `story-question`）。两种答法：「写几句」→ `answers[].text`；「和 ChatGPT 聊」→ `#/talk/go?k=question&id=`，提示词说只聊 5–10 分钟，存聊天时记一条带 `talk` 的回答，拆出来的事没日期就放进那一段、自动带上那条线。答过的出现在阶段页、线页「小问题」，`#/questions`（更多 → 答过的小问题）可改、删（可撤销）；有文字的进 `storyDigest`「小问题」。首页的「线」那块 2026-10-07 去掉了（用户说后面有详细的）。
