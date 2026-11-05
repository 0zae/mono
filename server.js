// Mono 로컬 서버
// - public/ 정적 파일 제공 (PWA)
// - /api/* : SQLite 저장, Gemini로 상호명 이해
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}

const PORT = Number(process.env.PORT) || 5173;
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
// 쉼표로 여러 개: 앞 모델이 한도 초과(429)·과부하(503)면 다음 모델로 넘어간다
const GEMINI_MODELS = (process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-lite-latest")
  .split(",").map((s) => s.trim()).filter(Boolean);
const GEMINI_MODEL = GEMINI_MODELS[0];
const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), ".moa");
const PUBLIC = path.join(ROOT, "public");

const INCOME = "수입";
const FALLBACK = "기타";
const COLORS = ["orange", "brown", "cyan", "pink", "indigo", "purple", "green", "red", "yellow", "mint", "blue", "gray"];
const DEFAULT_CATS = [
  { id: "food", name: "식비", color: "orange", keys: ["점심", "저녁", "아침", "밥", "식당", "김밥", "치킨", "피자", "배달", "배민", "쿠팡이츠", "요기요", "맥도날드", "버거", "라면", "분식", "국밥", "마트", "장보기", "이마트", "홈플러스", "편의점", "gs25", "cu", "세븐일레븐", "식사", "도시락", "떡볶이", "초밥", "고기", "삼겹살", "짜장", "짬뽕", "냉면", "샐러드", "야식"] },
  { id: "cafe", name: "카페", color: "brown", keys: ["커피", "카페", "스타벅스", "스벅", "라떼", "아메리카노", "디저트", "빵", "베이커리", "케이크", "투썸", "메가커피", "컴포즈", "빽다방", "이디야", "블루보틀", "바나프레소", "음료"] },
  { id: "move", name: "교통", color: "cyan", keys: ["택시", "버스", "지하철", "주유", "기름", "카카오t", "기차", "ktx", "srt", "주차", "톨게이트", "통행료", "교통", "따릉이", "항공", "비행기"] },
  { id: "shop", name: "쇼핑", color: "pink", keys: ["옷", "신발", "쿠팡", "무신사", "다이소", "올리브영", "쇼핑", "가방", "화장품", "29cm", "지그재그", "이케아", "전자", "애플"] },
  { id: "life", name: "생활", color: "indigo", keys: ["관리비", "전기", "가스", "수도", "통신", "핸드폰", "휴대폰", "인터넷", "월세", "세탁", "생필품", "보험", "미용실", "헤어"] },
  { id: "fun", name: "문화", color: "purple", keys: ["영화", "cgv", "메가박스", "넷플릭스", "유튜브", "구독", "공연", "책", "게임", "스포티파이", "멜론", "전시", "티빙", "쿠팡플레이", "여행", "숙소", "호텔"] },
  { id: "med", name: "의료", color: "green", keys: ["병원", "약국", "약", "치과", "한의원", "안과", "진료", "피부과"] },
  { id: "meet", name: "모임", color: "red", keys: ["술", "맥주", "소주", "회식", "모임", "선물", "경조사", "축의금", "부조", "생일"] },
  { id: "etc", name: FALLBACK, color: "gray", keys: [] },
];

/* ---------- database ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "moa.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, d TEXT NOT NULL, t TEXT NOT NULL, a INTEGER NOT NULL,
    c TEXT NOT NULL, m TEXT NOT NULL, p TEXT, pn TEXT, r TEXT, ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS items_d ON items(d);
  CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS merchants (
    key TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT NOT NULL,
    src TEXT NOT NULL, updated INTEGER NOT NULL
  );
`);
// 정기 결제로 자동 기록된 항목 표시용 (예전 DB에도 컬럼 추가)
try { db.exec("ALTER TABLE items ADD COLUMN rec TEXT"); } catch {}

const DEFAULT_SETTINGS = {
  budget: 1500000,
  methods: [{ id: "card", name: "카드", alias: ["체크", "신용"] }, { id: "cash", name: "현금", alias: [] }],
  def: "card",
  cats: DEFAULT_CATS,
  recurring: [],
};
const ITEM_FIELDS = ["d", "t", "a", "c", "m", "p", "pn", "r", "ts", "rec"];

const q = {
  items: db.prepare("SELECT * FROM items ORDER BY d DESC, ts DESC"),
  item: db.prepare("SELECT * FROM items WHERE id = ?"),
  insert: db.prepare("INSERT INTO items (id,d,t,a,c,m,p,pn,r,ts) VALUES (?,?,?,?,?,?,?,?,?,?)"),
  insertRec: db.prepare("INSERT OR IGNORE INTO items (id,d,t,a,c,m,p,pn,r,ts,rec) VALUES (?,?,?,?,?,?,?,?,?,?,?)"),
  del: db.prepare("DELETE FROM items WHERE id = ?"),
  getSetting: db.prepare("SELECT v FROM settings WHERE k = 'app'"),
  putSetting: db.prepare("INSERT INTO settings (k,v) VALUES ('app', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v"),
  merchant: db.prepare("SELECT * FROM merchants WHERE key = ?"),
  putMerchant: db.prepare(`INSERT INTO merchants (key,name,cat,src,updated) VALUES (?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET name = excluded.name, cat = excluded.cat, src = excluded.src, updated = excluded.updated
    WHERE merchants.src != 'user' OR excluded.src = 'user'`),
};

const settings = () => {
  const row = q.getSetting.get();
  return row ? { ...DEFAULT_SETTINGS, ...JSON.parse(row.v) } : DEFAULT_SETTINGS;
};
// 지금 쓸 수 있는 분류 이름 (사용자 분류 + 수입)
const catNames = () => [...settings().cats.map((c) => c.name), INCOME];
/* ---------- 정기 결제 ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
const daysIn = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };

// 결제일이 지난 달마다 한 번씩 내역에 기록한다. 이미 기록한 달(last)은 다시 만들지 않는다
// (그래서 자동으로 들어간 항목을 지워도 되살아나지 않는다).
function materializeRecurring() {
  const s = settings();
  if (!s.recurring?.length) return;
  const now = new Date(), thisYm = ymOf(now);
  let changed = false;
  for (const r of s.recurring) {
    if (r.paused) continue;
    for (let ym = r.last ? shiftYm(r.last, 1) : r.start || thisYm; ym <= thisYm; ym = shiftYm(ym, 1)) {
      const day = Math.min(r.day, daysIn(ym));
      if (ym === thisYm && now.getDate() < day) break;
      const method = s.methods.find((x) => x.id === r.p);
      q.insertRec.run(`rec-${r.id}-${ym}`, `${ym}-${pad2(day)}`, "out", r.amount, r.cat || FALLBACK, r.name,
        r.p || null, method?.name || null, "정기 결제", Date.now(), r.id);
      r.last = ym; changed = true;
    }
  }
  if (changed) q.putSetting.run(JSON.stringify(s));
}

// 상호명 기억의 키: 공백·기호 제거, 소문자
const norm = (s) => String(s || "").toLowerCase().replace(/[\s.,·\-_'"()[\]]/g, "");

function learn(memo, name, cat, src) {
  const key = norm(memo);
  if (!key || !catNames().includes(cat)) return;
  q.putMerchant.run(key, name || memo, cat, src, Date.now());
  const canon = norm(name);
  if (canon && canon !== key) q.putMerchant.run(canon, name, cat, src, Date.now());
}

/* ---------- Gemini ---------- */
async function askGemini(text, memo, methods) {
  let lastErr;
  for (const model of GEMINI_MODELS) {
    // 503(일시적 혼잡)은 같은 모델로 한 번 더 기다렸다가 시도: 똑똑한 모델을 최대한 쓴다
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await askModel(model, text, memo, methods); }
      catch (e) {
        lastErr = e;
        if (!e.retryable) throw e;
        if (attempt === 0 && / 503:/.test(e.message)) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        console.warn(`[gemini] ${model} 건너뜀: ${e.message.slice(0, 80)}`);
        break;
      }
    }
  }
  throw lastErr;
}

async function askModel(model, text, memo, methods) {
  const cats = settings().cats;
  const names = [...cats.map((c) => c.name), INCOME];
  const today = new Date().toISOString().slice(0, 10);
  const prompt = [
    "너는 한국어 가계부 입력을 이해하는 도우미다.",
    `오늘 날짜: ${today}`,
    `사용자가 쓴 한 줄: "${text}"`,
    `금액·날짜·결제수단을 뺀 나머지: "${memo}"`,
    `사용자의 결제수단: ${methods.join(", ") || "(없음)"}`,
    "",
    "할 일:",
    "1. merchant: 상호명이나 지출 대상을 찾아 널리 쓰이는 정식 이름으로 바꿔라. 줄임말·오타·영문 표기·지점명을 바로잡아라 (예: 스벅→스타벅스, 맥날→맥도날드, 다이소 강남점→다이소). 확실히 아는 상호가 아니면 사용자가 쓴 그대로 두고, 이름을 지어내거나 덧붙이지 마라. 상호가 없으면 품목이나 용도를 짧게 적어라 (예: 점심, 택시).",
    "2. category: 아래 분류 중 정확히 하나. 괄호는 그 분류에 속하는 예시. 월급·환급·용돈처럼 돈이 들어온 경우만 수입. 어디에도 안 맞으면 " + FALLBACK + ".",
    ...cats.map((c) => `   - ${c.name}${c.keys.length ? ` (${c.keys.slice(0, 8).join(", ")})` : ""}`),
    `   - ${INCOME}`,
    "3. kind: 그 가게나 항목의 업종을 2~6자로 (예: 커피전문점, 편의점, 택시).",
    "4. confident: 상호를 확실히 안다면 true, 추측이면 false.",
    "5. payment: 카드사·간편결제·현금 같은 결제수단이 적혀 있으면 그 이름 (예: 현대카드, 토스페이), 없으면 빈 문자열. merchant에는 결제수단·금액·날짜를 절대 넣지 마라.",
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          // 상호명 분류에 깊은 생각은 필요 없다: 3.x Flash 계열은 생각을 최소로 해서 빠르고 싸게
          ...(/^gemini-3\.\d+-flash/.test(model) ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              merchant: { type: "STRING" },
              category: { type: "STRING", enum: names },
              kind: { type: "STRING" },
              confident: { type: "BOOLEAN" },
              payment: { type: "STRING" },
            },
            required: ["merchant", "category", "kind", "confident", "payment"],
          },
        },
      }),
      signal: AbortSignal.timeout(12000),
    },
  ).catch((e) => { e.retryable = true; throw e; });
  if (!res.ok) {
    const err = new Error(`Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.retryable = res.status === 429 || res.status === 404 || res.status >= 500;
    throw err;
  }
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return JSON.parse(out);
}

async function understand({ text = "", memo = "", methods = [] }) {
  const hit = q.merchant.get(norm(memo));
  if (hit && catNames().includes(hit.cat)) return { merchant: hit.name, category: hit.cat, source: "memory" };
  if (!GEMINI_KEY || !memo.trim()) return { source: "none" };
  const r = await askGemini(text, memo, methods);
  if (!catNames().includes(r.category)) r.category = FALLBACK;
  // 결제수단이 메모에 섞여 들어왔으면 빼고 기억한다
  const base = (r.payment ? memo.replace(r.payment, " ") : memo).replace(/\s+/g, " ").trim() || memo;
  if (!r.confident || !r.merchant?.trim()) r.merchant = base;
  learn(base, r.merchant, r.category, "gemini");
  return { merchant: r.merchant, category: r.category, kind: r.kind, confident: r.confident, payment: r.payment || "", source: "gemini" };
}

/* ---------- http ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json",
};
const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((ok, fail) => {
  let s = "";
  req.on("data", (c) => { s += c; if (s.length > 1e6) req.destroy(); });
  req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { fail(e); } });
  req.on("error", fail);
});
function cleanItem(b) {
  const it = {};
  for (const k of ITEM_FIELDS) if (b[k] !== undefined) it[k] = b[k];
  if (it.a !== undefined) it.a = Math.round(Number(it.a)) || 0;
  if (it.t !== undefined && it.t !== "in") it.t = "out";
  if (it.c !== undefined && !catNames().includes(it.c)) it.c = FALLBACK;
  return it;
}

async function api(req, res, url) {
  const [, , name, id] = url.pathname.split("/");
  const m = req.method;

  if (name === "state" && m === "GET") {
    materializeRecurring();
    return send(res, 200, { items: q.items.all(), settings: settings(), ai: !!GEMINI_KEY, model: GEMINI_MODELS.join(", ") });
  }

  if (name === "items" && m === "POST") {
    const b = await readBody(req);
    const it = { p: null, pn: null, r: null, ts: Date.now(), ...cleanItem(b) };
    if (!b.id || !it.d || !it.a) return send(res, 400, { error: "id, d, a가 필요해요." });
    q.insert.run(b.id, it.d, it.t || "out", it.a, it.c || FALLBACK, it.m || "", it.p, it.pn, it.r, it.ts);
    return send(res, 201, q.item.get(b.id));
  }
  if (name === "items" && id && m === "PATCH") {
    const b = await readBody(req);
    const cur = q.item.get(id);
    if (!cur) return send(res, 404, { error: "없는 항목이에요." });
    const patch = cleanItem(b);
    const keys = Object.keys(patch);
    if (keys.length) db.prepare(`UPDATE items SET ${keys.map((k) => k + " = ?").join(", ")} WHERE id = ?`).run(...keys.map((k) => patch[k]), id);
    const next = q.item.get(id);
    // 사용자가 직접 분류를 고치면 그 상호명은 다음부터 이 분류로
    if (b.learn && patch.c) learn(next.m, next.m, next.c, "user");
    return send(res, 200, next);
  }
  if (name === "items" && id && m === "DELETE") { q.del.run(id); return send(res, 200, { ok: true }); }

  if (name === "settings" && m === "PUT") {
    const b = await readBody(req);
    const s = { ...settings() };
    if (Number(b.budget) > 0) s.budget = Math.round(Number(b.budget));
    if (Array.isArray(b.methods)) s.methods = b.methods.filter((x) => x && x.id && x.name)
      .map((x) => ({ id: String(x.id), name: String(x.name), alias: Array.isArray(x.alias) ? x.alias.map(String) : [] }));
    if (typeof b.def === "string") s.def = b.def;
    if (Array.isArray(b.cats)) {
      const seen = new Set([INCOME]);
      const cats = b.cats.filter((c) => c && c.id && String(c.name || "").trim())
        .map((c) => ({ id: String(c.id), name: String(c.name).trim().slice(0, 10), color: COLORS.includes(c.color) ? c.color : "gray",
          keys: Array.isArray(c.keys) ? c.keys.map((k) => String(k).trim()).filter(Boolean).slice(0, 200) : [] }))
        .filter((c) => !seen.has(c.name) && seen.add(c.name));
      if (!cats.some((c) => c.name === FALLBACK)) cats.push({ id: "etc", name: FALLBACK, color: "gray", keys: [] });
      s.cats = cats;
    }
    if (Array.isArray(b.recurring)) {
      const prev = new Map((s.recurring || []).map((r) => [r.id, r]));
      const thisYm = ymOf(new Date());
      s.recurring = b.recurring.filter((r) => r && r.id && String(r.name || "").trim() && Number(r.amount) > 0)
        .map((r) => {
          const old = prev.get(String(r.id));
          return {
            id: String(r.id), name: String(r.name).trim().slice(0, 30), amount: Math.round(Number(r.amount)),
            day: Math.min(31, Math.max(1, Math.round(Number(r.day) || 1))),
            cat: catNames().includes(r.cat) ? r.cat : FALLBACK, p: r.p ? String(r.p) : null,
            paused: !!r.paused,
            // 시작 달과 마지막 기록 달은 서버가 관리한다
            start: old?.start || (r.fromThisMonth === false ? shiftYm(thisYm, 1) : thisYm),
            // 일시정지했다가 다시 시작하면 멈춰 있던 달은 채우지 않는다
            last: old?.paused && !r.paused ? [old.last, shiftYm(thisYm, -1)].filter(Boolean).sort().pop() : old?.last || null,
          };
        });
    }
    q.putSetting.run(JSON.stringify(s));
    return send(res, 200, s);
  }

  // 분류 이름을 바꾸거나 지울 때: 내역과 기억해 둔 상호를 함께 옮긴다
  if (name === "categories" && id === "rename" && m === "POST") {
    const { from, to } = await readBody(req);
    if (!from || !catNames().includes(to)) return send(res, 400, { error: "바꿀 분류가 없어요." });
    db.prepare("UPDATE items SET c = ? WHERE c = ?").run(to, from);
    db.prepare("UPDATE merchants SET cat = ? WHERE cat = ?").run(to, from);
    const st = settings();
    if (st.recurring?.some((r) => r.cat === from)) {
      st.recurring.forEach((r) => { if (r.cat === from) r.cat = to; });
      q.putSetting.run(JSON.stringify(st));
    }
    return send(res, 200, { ok: true });
  }

  if (name === "understand" && m === "POST") {
    try { return send(res, 200, await understand(await readBody(req))); }
    catch (e) { console.error("[understand]", e.message); return send(res, 200, { source: "error", error: e.message }); }
  }
  return send(res, 404, { error: "없는 경로예요." });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "서버에서 문제가 생겼어요." });
  }
}).listen(PORT, "0.0.0.0", () => {
  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  console.log(`\n  Mono 실행 중`);
  console.log(`  이 컴퓨터:  http://localhost:${PORT}`);
  if (lan) console.log(`  같은 와이파이의 폰: http://${lan}:${PORT}`);
  console.log(`  데이터: ${path.join(DATA_DIR, "moa.db")}`);
  console.log(`  Gemini: ${GEMINI_KEY ? GEMINI_MODELS.join(" → ") : "꺼짐 (.env에 GEMINI_API_KEY를 넣으면 켜져요)"}\n`);
});
