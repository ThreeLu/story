"""端到端测试：真浏览器打开「我的故事」，连本地的假 GitHub（tests/fake_github.py），把主要功能走一遍。

    pip install playwright && python -m playwright install chromium
    python tests/test_app.py            # 全部
    python tests/test_app.py 聊 关于我    # 只跑名字里含这些字的步骤（前面的「开始」总会跑）

不联网、不需要令牌。失败时截图在 tests/artifacts/。测试里只用编的内容。
"""

import json
import sys
import threading
import traceback
from datetime import date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from fake_github import FakeRepo, serve  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "tests" / "artifacts"
APP_PORT, API_PORT = 8795, 8796
URL = f"http://127.0.0.1:{APP_PORT}/"
API = f"http://127.0.0.1:{API_PORT}"
REPO = "test/story-data"
TODAY = date.today().isoformat()
YEAR = date.today().year

STEPS = []
AI_LOG = []


def step(name):
    def wrap(fn):
        STEPS.append((name, fn))
        return fn
    return wrap


def js(obj):
    return json.dumps(obj, ensure_ascii=False).encode()


LIFE = FakeRepo({"life.json": js({
    "version": 1, "startDate": "2026-01-01", "days": {f"{YEAR}-01-02": {"prayer": {"night": {"at": "x"}}}},
    "places": [{"id": "pl1", "name": "编的公园", "visits": [{"id": "v1", "day": f"{YEAR}-03-01"}]}],
    "goals": [{"id": "g1", "title": "编的目标", "status": "done", "doneAt": f"{YEAR}-05-01"}],
    "sick": {"history": [{"start": f"{YEAR}-02-01"}]},
    "people": [
        {"id": "p-a", "name": "甲同学", "sex": "m", "groups": ["primary"], "rel": "同学", "at": "2026-01-01"},
        {"id": "p-b", "name": "乙老师", "sex": "f", "groups": ["high"], "rel": "老师", "at": "2026-01-01"},
    ],
})})
LEDGER = FakeRepo({"finance.json": js({"tx": [
    {"id": "t1", "type": "expense", "date": f"{YEAR}-03-01", "amount": 120},
    {"id": "t2", "type": "income", "date": f"{YEAR}-03-15", "amount": 4000},
], "wishes": [{"id": "w1", "name": "编的耳机", "status": "bought", "boughtAt": f"{YEAR}-04-01"}]})})
INVENTORY = FakeRepo({
    "inventory.json": js({"items": [{"id": "i1", "name": "编的台灯", "purchasePrice": 399, "createdAt": f"{YEAR}-06-01T00:00:00Z"}]}),
    "config/ai.json": js({"deepseek": {"key": "test-key", "model": "deepseek-flash"}}),
})


class Ctx:
    def __init__(self, page, repo):
        self.page, self.repo = page, repo

    def data(self):
        self.page.wait_for_function(
            "() => { try { const q = JSON.parse(localStorage.getItem('story-queue')); return !q || !q.items.length; } catch { return true; } }",
            timeout=15000)
        return json.loads(self.repo.read("story.json"))

    def wait(self, check, what):
        for _ in range(60):
            try:
                if check(self.data()):
                    return
            except (KeyError, TypeError, IndexError, StopIteration):
                pass
            self.page.wait_for_timeout(200)
        raise AssertionError(f"等不到：{what}\n{json.dumps(self.data(), ensure_ascii=False)[:2000]}")

    def go(self, hash_):
        same = self.page.url == URL + hash_
        self.page.goto(URL + hash_)
        if same:
            self.page.reload()

    def sheet(self):
        return self.page.locator(".sheet")


TALK_PASTE = """### 回忆
我小学在编的小学上，每天走路去。三年级的时候和甲同学一起参加了编的比赛。

### 事情
2013｜参加编的比赛｜编的小学｜甲同学｜很紧张

### 人
丙同桌｜女｜同桌｜三年级坐一起

### 那时候的我
那时候很内向。

### 履历
2013 编的比赛 三等奖"""


def fake_ai(page):
    def handle(route):
        body = route.request.post_data or ""
        AI_LOG.append(body)
        if "拆成结构化" in body:
            content = {
                "title": "编的小学",
                "stage": {"busy": "上学、写作业", "line": "编的一句话"},
                "events": [
                    {"date": "2013", "approx": False, "label": "", "title": "参加编的比赛", "text": "和同学一起去的", "feel": "很紧张",
                     "place": "编的小学", "people": ["甲同学", "丙同桌"], "threads": ["t-friend", "t-xxx"], "kind": "first", "big": True},
                ],
                "people": [{"name": "丙同桌", "sex": "f", "rel": "同桌", "how": "三年级坐一起"}],
                "about": [{"sec": "character", "topic": "内向", "date": "2013", "label": "小学时", "text": "那时候很内向"}],
                "resume": [{"kind": "award", "title": "编的比赛三等奖", "org": "编的主办方", "from": "2013-06", "to": "", "detail": "三等奖"}],
            }
        elif "简介" in body:
            content = {"text": "他是一个编的人。\n第二段。", "chatgpt": "我是一个编的人。"}
        else:
            content = {}
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
                      body=json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content, ensure_ascii=False)}}]}))
    page.route("https://api.deepseek.com/**", handle)
    page.route("https://webrd0*.is.autonavi.com/**", lambda r: r.fulfill(status=200, content_type="image/png", body=b""))


# ---------- 测试步骤 ----------

@step("开始：用生活网站的令牌连上，建好空记录")
def _(c):
    p = c.page
    p.goto(URL)
    p.evaluate(f"""() => {{
        localStorage.clear();
        localStorage.setItem('story-api-base', '{API}');
        localStorage.setItem('life-settings', JSON.stringify({{ repo: 'test/life-data', token: 'test-token' }}));
        localStorage.setItem('inventory-settings', JSON.stringify({{ repo: 'test/inventory-data', token: 'test-token' }}));
        localStorage.setItem('ledger-settings', JSON.stringify({{ repo: 'test/finance-data', token: 'test-token' }}));
        localStorage.setItem('story-settings', JSON.stringify({{ repo: '{REPO}' }}));
    }}""")
    p.goto(URL)
    expect(p.get_by_role("heading", name="开始")).to_be_visible()
    p.get_by_role("button", name="开始", exact=True).click()
    expect(p.get_by_role("heading", name="我的故事")).to_be_visible()
    d = c.data()
    assert len(d["stages"]) == 10 and d["stages"][4]["title"] == "初三 · 直升", d["stages"]
    assert any(t["name"] == "友情" for t in d["threads"])
    expect(p.locator(".next-title")).to_have_text("出生和家")
    expect(p.locator(".lm-row")).to_have_count(10)


@step("阶段：定时间、写一段，年表按时间分进去")
def _(c):
    p = c.page
    c.go("#/stage/s-primary/edit")
    p.get_by_label("从什么时候").fill("2010-9")
    p.get_by_label("到什么时候").fill("2016-6")
    p.get_by_label("在忙什么").fill("编的忙")
    p.get_by_label("一句话").fill("编的小学一句话")
    p.get_by_role("button", name="存好").click()
    expect(p.locator("blockquote.line")).to_have_text("编的小学一句话")
    c.wait(lambda d: next(s for s in d["stages"] if s["id"] == "s-primary")["from"] == "2010-09", "小学时间")
    s = next(s for s in c.data()["stages"] if s["id"] == "s-primary")
    assert s["to"] == "2016-06" and s["busy"] == "编的忙", s


@step("记一件事：大概的时间、线、和谁，年表上出现在对的阶段")
def _(c):
    p = c.page
    c.go("#/event/new")
    p.get_by_label("这件事").fill("编的第一次")
    p.get_by_label("什么时候").fill("2012年3月")
    p.get_by_label("记不太清，是大概的时间").check()
    p.get_by_role("group", name="线").get_by_role("button", name="友情").click()
    p.get_by_label("和谁").fill("甲")
    p.get_by_role("option", name="甲同学").click()
    p.get_by_label("经过").fill("编的经过")
    p.get_by_role("button", name="存好").click()
    expect(p.get_by_role("heading", name="编的第一次")).to_be_visible()
    expect(p.get_by_text("大概 2012 年 3 月 · 小学")).to_be_visible()
    expect(p.locator("a.chip.person", has_text="甲同学")).to_be_visible()
    d = c.data()
    e = d["events"][0]
    assert e["date"] == "2012-03" and e["approx"] and e["people"] == ["p-a"] and e["threads"] == ["t-friend"], e
    c.go("#/timeline")
    sec = p.locator(".tl-stage", has=p.locator(".tl-name", has_text="小学"))
    expect(sec.locator(".tl-row", has_text="编的第一次")).to_be_visible()
    # 认不出的日期不让存
    c.go("#/event/new")
    p.get_by_label("这件事").fill("编的坏日期")
    p.get_by_label("什么时候").fill("去年夏天")
    p.get_by_role("button", name="存好").click()
    expect(p.locator(".toast.error")).to_contain_text("认不出来")


@step("聊：复制提示词、贴回整理、DeepSeek 拆开、看一看、存好（新的人进生活网站）")
def _(c):
    p = c.page
    c.go("#/talk/go?k=stage&id=s-primary")
    expect(p.get_by_role("heading", name="聊：小学")).to_be_visible()
    p.get_by_role("button", name="复制提示词").click()
    clip = p.evaluate("navigator.clipboard.readText()")
    assert "「小学」" in clip and "### 回忆" in clip and "编的第一次" in clip and "编的忙" in clip, clip[:500]
    p.get_by_label("ChatGPT 的整理").fill(TALK_PASTE)
    p.get_by_role("button", name="让 DeepSeek 拆开").click()
    expect(p.get_by_role("heading", name="看一看")).to_be_visible()
    assert any("甲同学" in b and "拆成结构化" in b for b in AI_LOG)
    expect(p.get_by_label("回忆", exact=True)).to_have_value("我小学在编的小学上，每天走路去。三年级的时候和甲同学一起参加了编的比赛。")
    card = p.locator(".pick", has_text="丙同桌")
    expect(card.get_by_role("button", name="女")).to_have_class("chip on")
    expect(card.get_by_label("丙同桌的分组")).to_have_value("primary")
    p.get_by_role("button", name="存好").click()
    expect(p.locator("article.memoir")).to_contain_text("每天走路去")
    life = json.loads(LIFE.read("life.json"))
    new = next(x for x in life["people"] if x["name"] == "丙同桌")
    assert new["sex"] == "f" and new["groups"] == ["primary"] and new["rel"] == "同桌", new
    d = c.data()
    t = d["talks"][0]
    assert t["topic"]["id"] == "s-primary" and t["title"] == "编的小学" and "### 事情" in t["chat"], t
    e = next(e for e in d["events"] if e["title"] == "参加编的比赛")
    assert e["people"] == ["p-a", new["id"]] and e["threads"] == ["t-friend"] and e["big"] and e["from"] == {"talk": t["id"]}, e
    s = next(s for s in d["stages"] if s["id"] == "s-primary")
    assert s["busy"] == "编的忙\n上学、写作业" and s["line"] == "编的一句话", s
    a = d["about"][0]
    assert a["sec"] == "character" and a["topic"] == "内向" and a["versions"][0]["label"] == "小学时", a
    r = d["resume"][0]
    assert r["kind"] == "award" and r["from"] == "2013-06", r


@step("友情线：按人看")
def _(c):
    p = c.page
    c.go("#/thread/t-friend")
    expect(p.get_by_role("heading", name="友情")).to_be_visible()
    card = p.locator(".person-thread", has=p.locator(".pt-name", has_text="甲同学"))
    expect(card).to_contain_text("2 件事")
    expect(card.locator(".pt-row")).to_have_count(2)
    expect(p.locator(".person-thread", has=p.locator(".pt-name", has_text="丙同桌"))).to_be_visible()


@step("关于我：同一个话题加一个时期，按时间排，最后是现在")
def _(c):
    p = c.page
    c.go("#/about")
    p.locator(".about-row", has_text="内向").click()
    p.get_by_role("button", name="＋ 加一个时期（想法变了）").click()
    c.sheet().get_by_label("内容").fill("现在开朗多了")
    c.sheet().get_by_label("这是什么时候的").fill("2026")
    c.sheet().get_by_role("button", name="加上").click()
    expect(p.locator(".version")).to_have_count(2)
    expect(p.locator(".version.now")).to_contain_text("现在开朗多了")
    expect(p.locator(".version").first).to_contain_text("小学时")
    c.go("#/about")
    expect(p.locator(".about-row", has_text="内向")).to_contain_text("2 个时期")
    # 新的一条
    p.locator(".section-title").filter(has=p.get_by_text("喜欢的", exact=True)).get_by_role("button", name="＋ 加一条").click()
    c.sheet().get_by_label("话题").fill("音乐")
    c.sheet().get_by_label("内容").fill("编的古典")
    c.sheet().get_by_role("button", name="加上").click()
    c.wait(lambda d: any(a["topic"] == "音乐" and a["sec"] == "likes" for a in d["about"]), "加了喜欢的")


@step("履历：加一条，年表上也有")
def _(c):
    p = c.page
    c.go("#/resume")
    p.get_by_role("button", name="加一条").click()
    c.sheet().get_by_role("button", name="考试").click()
    c.sheet().get_by_label("名称").fill("编的考试")
    c.sheet().get_by_label("开始").fill("2016-6")
    c.sheet().get_by_role("button", name="存好").click()
    expect(p.locator(".cell", has_text="编的考试")).to_be_visible()
    c.go("#/timeline")
    expect(p.locator(".tl-row.resume", has_text="编的考试")).to_be_visible()
    p.get_by_role("button", name="重要的").click()
    expect(p.locator(".tl-row")).to_have_count(1)


@step("日记：写一篇，那年今天出现在首页")
def _(c):
    p = c.page
    last = f"{YEAR - 3}{TODAY[4:]}" if TODAY[5:] != "02-29" else f"{YEAR - 4}-02-29"
    c.go("#/diary/new")
    p.get_by_label("日期").fill(last)
    p.get_by_label("在哪").fill("编的地方")
    p.get_by_label("日记").fill("编的日记第一段\n编的第二段")
    p.get_by_role("button", name="存好").click()
    expect(p.locator("article.memoir p")).to_have_count(2)
    c.go("#/")
    expect(p.locator(".otd")).to_contain_text("编的日记第一段")


@step("每一年：另外三个网站的数字")
def _(c):
    p = c.page
    c.go(f"#/year/{YEAR}")
    card = p.locator(".card", has=p.locator("h3", has_text="这一年的数字"))
    expect(card).to_contain_text("花了 ¥120")
    expect(card).to_contain_text("编的耳机")
    expect(card).to_contain_text("编的台灯")
    expect(card).to_contain_text("编的目标")
    expect(card).to_contain_text("生病 1 次")
    p.get_by_role("link", name="聊聊这一年").click()
    p.get_by_role("button", name="复制提示词").click()
    clip = p.evaluate("navigator.clipboard.readText()")
    assert f"我的 {YEAR} 年" in clip and "花了 ¥120" in clip, clip[:400]


@step("给 AI 的简介：DeepSeek 写一版，用了才换，写出 profile.json")
def _(c):
    p = c.page
    c.go("#/profile")
    p.get_by_role("button", name="整理").click()
    expect(p.locator(".draft")).to_contain_text("他是一个编的人")
    body = next(b for b in reversed(AI_LOG) if "简介" in b)
    assert "参加编的比赛" in body and "内向" in body and "现在开朗多了" in body, body[:800]
    p.get_by_role("button", name="用这一版").click()
    expect(p.locator(".draft")).to_have_count(0)
    prof = json.loads(c.repo.read("profile.json"))
    assert prof["text"].startswith("他是一个编的人"), prof
    c.wait(lambda d: d["profile"]["chatgpt"] == "我是一个编的人。", "简介存进 story.json")


@step("地图：加一个地方，点地图放上去")
def _(c):
    p = c.page
    c.go("#/map")
    p.get_by_role("button", name="加一个地方").click()
    c.sheet().get_by_label("地方的名字").fill("编的老家")
    c.sheet().get_by_role("button", name="家").click()
    c.sheet().get_by_role("button", name="加上，去地图上点位置").click()
    expect(p.locator(".banner")).to_contain_text("编的老家")
    p.locator(".map").click(position={"x": 150, "y": 150})
    c.wait(lambda d: d["places"][0]["lat"] and d["places"][0]["kind"] == "home", "放到地图上")


@step("删掉一件事可以撤销")
def _(c):
    p = c.page
    eid = next(e["id"] for e in c.data()["events"] if e["title"] == "编的第一次")
    c.go(f"#/event/{eid}")
    p.get_by_role("button", name="删掉这件事").click()
    c.wait(lambda d: not any(e["id"] == eid for e in d["events"]), "删掉")
    p.get_by_role("button", name="撤销").click()
    c.wait(lambda d: any(e["id"] == eid for e in d["events"]), "撤销回来")


def main():
    only = sys.argv[1:]
    ART.mkdir(exist_ok=True)
    repo = FakeRepo({"README.md": b"# story-data\n"})
    serve({REPO: repo, "test/life-data": LIFE, "test/finance-data": LEDGER, "test/inventory-data": INVENTORY}, API_PORT)

    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    app = ThreadingHTTPServer(("127.0.0.1", APP_PORT), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=app.serve_forever, daemon=True).start()

    failed, errors, ran = [], [], 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="zh-CN")
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=URL.rstrip("/"))
        ctx.set_default_timeout(10000)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())
        fake_ai(page)
        c = Ctx(page, repo)
        for i, (name, fn) in enumerate(STEPS):
            if i and only and not any(k in name for k in only):
                continue
            ran += 1
            try:
                fn(c)
                print(f"  ✓ {name}")
            except Exception:
                failed.append(name)
                page.screenshot(path=ART / f"fail-{i:02d}.png", full_page=True)
                print(f"  ✗ {name}\n{traceback.format_exc()}")
                if i == 0:
                    break
        browser.close()
    if errors:
        print("页面报错：", *errors, sep="\n  ")
    print(f"\n{ran - len(failed)}/{ran} 通过" + ("" if ran == len(STEPS) else f"（共 {len(STEPS)} 项，没跑完）"))
    sys.exit(1 if failed or errors else 0)


if __name__ == "__main__":
    main()
