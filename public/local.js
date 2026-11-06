// Mono 기기 안 저장소
// 서버 없이 브라우저(IndexedDB)에 모든 기록을 두고, Gemini는 이 기기에서 직접 호출한다.
// app.js는 예전 서버 API와 같은 모양(method, path, body)으로 localApi를 부른다.

export const COLORS = ["orange","brown","cyan","pink","indigo","purple","green","red","yellow","mint","blue","gray"];
export const DEFAULT_CATS = [
  {id:"food",name:"식비",color:"orange",keys:["점심","저녁","아침","밥","식당","김밥","치킨","피자","배달","배민","쿠팡이츠","요기요","맥도날드","버거","라면","분식","국밥","마트","장보기","이마트","홈플러스","편의점","gs25","cu","세븐일레븐","식사","도시락","떡볶이","초밥","고기","삼겹살","짜장","짬뽕","냉면","샐러드","야식"]},
  {id:"cafe",name:"카페",color:"brown",keys:["커피","카페","스타벅스","스벅","라떼","아메리카노","디저트","빵","베이커리","케이크","투썸","메가커피","컴포즈","빽다방","이디야","블루보틀","바나프레소","음료"]},
  {id:"move",name:"교통",color:"cyan",keys:["택시","버스","지하철","주유","기름","카카오t","기차","ktx","srt","주차","톨게이트","통행료","교통","따릉이","항공","비행기"]},
  {id:"shop",name:"쇼핑",color:"pink",keys:["옷","신발","쿠팡","무신사","다이소","올리브영","쇼핑","가방","화장품","29cm","지그재그","이케아","전자","애플"]},
  {id:"life",name:"생활",color:"indigo",keys:["관리비","전기","가스","수도","통신","핸드폰","휴대폰","인터넷","월세","세탁","생필품","보험","미용실","헤어"]},
  {id:"fun",name:"문화",color:"purple",keys:["영화","cgv","메가박스","넷플릭스","유튜브","구독","공연","책","게임","스포티파이","멜론","전시","티빙","쿠팡플레이","여행","숙소","호텔"]},
  {id:"med",name:"의료",color:"green",keys:["병원","약국","약","치과","한의원","안과","진료","피부과"]},
  {id:"meet",name:"모임",color:"red",keys:["술","맥주","소주","회식","모임","선물","경조사","축의금","부조","생일"]},
  {id:"night",name:"유흥",color:"mint",keys:["노래방","코인노래방","클럽","라운지","펍","포차","이자카야","호프","술집","와인바","칵테일","pc방","피시방","당구","볼링","오락실","방탈출"]},
  {id:"etc",name:"기타",color:"gray",keys:[]}
];
const INCOME = "수입";
const FALLBACK = "기타";
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
const DEFAULT_SETTINGS = {
  budget: 1500000,
  methods: [{ id: "card", name: "카드", alias: ["체크", "신용"] }, { id: "cash", name: "현금", alias: [] }],
  def: "card",
  cats: DEFAULT_CATS,
  recurring: [],
};

/* ---------- IndexedDB ---------- */
const dbp = new Promise((resolve, reject) => {
  const r = indexedDB.open("mono", 1);
  r.onupgradeneeded = () => {
    const d = r.result;
    d.createObjectStore("items", { keyPath: "id" });
    d.createObjectStore("merchants", { keyPath: "key" });
    d.createObjectStore("kv");
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = async (name, mode = "readonly") => (await dbp).transaction(name, mode).objectStore(name);
const get = async (st, k) => req((await store(st)).get(k));
const getAll = async (st) => req((await store(st)).getAll());
const put = async (st, v, k) => req(k === undefined ? (await store(st, "readwrite")).put(v) : (await store(st, "readwrite")).put(v, k));
const del = async (st, k) => req((await store(st, "readwrite")).delete(k));
const clear = async (st) => req((await store(st, "readwrite")).clear());

// 브라우저가 공간이 부족할 때 이 사이트 데이터를 지우지 않도록 요청
try { navigator.storage?.persist?.(); } catch {}

const settings = async () => ({ ...DEFAULT_SETTINGS, ...((await get("kv", "settings")) || {}) });
const saveSettings = (s) => put("kv", s, "settings");
const catNames = (s) => [...s.cats.map((c) => c.name), INCOME];
const geminiKey = async () => ((await get("kv", "gemini")) || {}).key || "";

/* ---------- 상호명 기억 ---------- */
const norm = (s) => String(s || "").toLowerCase().replace(/[\s.,·\-_'"()[\]]/g, "");
async function learn(s, memo, name, cat, src) {
  const key = norm(memo);
  if (!key || !catNames(s).includes(cat)) return;
  for (const k of new Set([key, norm(name)])) {
    if (!k) continue;
    const old = await get("merchants", k);
    if (old && old.src === "user" && src !== "user") continue; // 직접 고친 기억은 Gemini가 덮어쓰지 않는다
    await put("merchants", { key: k, name: name || memo, cat, src, updated: Date.now() });
  }
}

// 앱 업데이트로 새로 생긴 기본 카테고리를 이미 쓰던 기기에도 한 번만 추가 (지운 뒤에는 다시 넣지 않는다)
const NEW_DEFAULT_CATS = ["night"];
async function addNewDefaultCats() {
  const saved = await get("kv", "settings");
  if (!saved || !Array.isArray(saved.cats)) return;
  const seeded = new Set(saved.seeded || []);
  let changed = false;
  for (const id of NEW_DEFAULT_CATS) {
    if (seeded.has(id)) continue;
    seeded.add(id); changed = true;
    const def = DEFAULT_CATS.find((c) => c.id === id);
    if (def && !saved.cats.some((c) => c.id === id || c.name === def.name)) {
      const at = saved.cats.findIndex((c) => c.name === FALLBACK);
      saved.cats.splice(at < 0 ? saved.cats.length : at, 0, { ...def, keys: def.keys.slice() });
    }
  }
  if (changed) await saveSettings({ ...saved, seeded: [...seeded] });
}

/* ---------- 정기 결제 ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
const daysIn = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };

// 결제일이 지난 달마다 한 번씩 기록한다. 이미 기록한 달(last)은 다시 만들지 않아서 지운 항목이 되살아나지 않는다.
async function materializeRecurring() {
  const s = await settings();
  if (!s.recurring?.length) return;
  const now = new Date(), thisYm = ymOf(now);
  let changed = false;
  for (const r of s.recurring) {
    if (r.paused) continue;
    for (let ym = r.last ? shiftYm(r.last, 1) : r.start || thisYm; ym <= thisYm; ym = shiftYm(ym, 1)) {
      const day = Math.min(r.day, daysIn(ym));
      if (ym === thisYm && now.getDate() < day) break;
      const id = `rec-${r.id}-${ym}`;
      if (!(await get("items", id))) {
        const method = s.methods.find((x) => x.id === r.p);
        await put("items", { id, d: `${ym}-${pad2(day)}`, t: "out", a: r.amount, c: r.cat || FALLBACK, m: r.name,
          p: r.p || null, pn: method?.name || null, r: "정기 결제", ts: Date.now(), rec: r.id });
      }
      r.last = ym; changed = true;
    }
  }
  if (changed) await saveSettings(s);
}

/* ---------- Gemini ---------- */
// 한 모델에 한 번 요청. parts는 텍스트·이미지 조각, schema는 받고 싶은 JSON 모양
async function geminiOnce(key, model, parts, schema, timeoutMs) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0,
        // 깊은 생각은 필요 없다: 3.x Flash 계열은 생각을 최소로 해서 빠르게
        ...(/^gemini-3\.\d+-flash/.test(model) ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e) => { e.retryable = true; throw e; });
  if (!res.ok) {
    const err = new Error(`Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    err.retryable = res.status === 429 || res.status === 404 || res.status >= 500;
    throw err;
  }
  const data = await res.json();
  return JSON.parse(data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}");
}

// 앞 모델이 붐비거나 한도에 걸리면 다음 모델로. 503(일시적 혼잡)은 같은 모델로 한 번 더
async function gemini(key, parts, schema, timeoutMs = 12000) {
  let lastErr;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await geminiOnce(key, model, parts, schema, timeoutMs); }
      catch (e) {
        lastErr = e;
        if (!e.retryable) throw e;
        if (attempt === 0 && e.status === 503) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        break;
      }
    }
  }
  throw lastErr;
}

const catLines = (s) => [
  ...s.cats.map((c) => `   - ${c.name}${c.keys.length ? ` (${c.keys.slice(0, 8).join(", ")})` : ""}`),
  `   - ${INCOME}`,
];

function askGemini(key, s, text, memo, methods) {
  const prompt = [
    "너는 한국어 가계부 입력을 이해하는 도우미다.",
    `오늘 날짜: ${new Date().toISOString().slice(0, 10)}`,
    `사용자가 쓴 한 줄: "${text}"`,
    `금액·날짜·결제수단을 뺀 나머지: "${memo}"`,
    `사용자의 결제수단: ${methods.join(", ") || "(없음)"}`,
    "",
    "할 일:",
    "1. merchant: 상호명이나 지출 대상을 찾아 널리 쓰이는 정식 이름으로 바꿔라. 줄임말·오타·영문 표기·지점명을 바로잡아라 (예: 스벅→스타벅스, 맥날→맥도날드, 다이소 강남점→다이소). 확실히 아는 상호가 아니면 사용자가 쓴 그대로 두고, 이름을 지어내거나 덧붙이지 마라. 상호가 없으면 품목이나 용도를 짧게 적어라 (예: 점심, 택시).",
    "2. category: 아래 분류 중 정확히 하나. 괄호는 그 분류에 속하는 예시. 월급·환급·용돈처럼 돈이 들어온 경우만 수입. 어디에도 안 맞으면 " + FALLBACK + ".",
    ...catLines(s),
    "3. kind: 그 가게나 항목의 업종을 2~6자로 (예: 커피전문점, 편의점, 택시).",
    "4. confident: 상호를 확실히 안다면 true, 추측이면 false.",
    "5. payment: 카드사·간편결제·현금 같은 결제수단이 적혀 있으면 그 이름 (예: 현대카드, 토스페이), 없으면 빈 문자열. merchant에는 결제수단·금액·날짜를 절대 넣지 마라.",
  ].join("\n");
  return gemini(key, [{ text: prompt }], {
    type: "OBJECT",
    properties: {
      merchant: { type: "STRING" }, category: { type: "STRING", enum: catNames(s) }, kind: { type: "STRING" },
      confident: { type: "BOOLEAN" }, payment: { type: "STRING" },
    },
    required: ["merchant", "category", "kind", "confident", "payment"],
  });
}

// 영수증 사진 읽기: 상호, 최종 결제 금액, 날짜, 결제수단
export async function readReceipt(key, s, { data, mime }) {
  const prompt = [
    "이 사진은 한국 영수증(카드 전표, 배달 앱 영수증 화면 포함)이다. 가계부에 한 줄로 기록할 정보를 뽑아라.",
    `오늘 날짜: ${new Date().toISOString().slice(0, 10)}`,
    `사용자의 결제수단: ${s.methods.map((m) => m.name).join(", ") || "(없음)"}`,
    "",
    "1. merchant: 가게의 정식 상호. 지점명·법인 표기(주식회사, (주))·사업자 정보는 빼라 (예: 스타벅스 강남R점 → 스타벅스).",
    "2. total: 실제로 결제한 최종 금액(합계, 받을금액, 결제금액, 승인금액). 할인 뒤 금액이고 원 단위 숫자만. 부가세·공급가액·개별 품목 금액이 아니다.",
    "3. date: 결제 날짜 YYYY-MM-DD. 연도가 없으면 오늘 기준 가장 최근 날짜. 안 보이면 빈 문자열.",
    "4. payment: 영수증에 찍힌 카드사·결제수단 이름 그대로 (예: 현대카드, 신한카드, 카카오페이, 현금). \"카드\"처럼 뭉뚱그리지 마라. 안 보이면 빈 문자열.",
    "5. category: 아래 분류 중 정확히 하나.",
    ...catLines(s),
    "6. readable: 영수증으로 읽을 수 있으면 true, 영수증이 아니거나 금액을 못 읽으면 false.",
  ].join("\n");
  return gemini(key, [{ text: prompt }, { inline_data: { mime_type: mime || "image/jpeg", data } }], {
    type: "OBJECT",
    properties: {
      merchant: { type: "STRING" }, total: { type: "NUMBER" }, date: { type: "STRING" }, payment: { type: "STRING" },
      category: { type: "STRING", enum: catNames(s) }, readable: { type: "BOOLEAN" },
    },
    required: ["merchant", "total", "date", "payment", "category", "readable"],
  }, 30000);
}

async function understand({ text = "", memo = "", methods = [] }) {
  const s = await settings();
  const hit = await get("merchants", norm(memo));
  if (hit && catNames(s).includes(hit.cat)) return { merchant: hit.name, category: hit.cat, source: "memory" };
  const key = await geminiKey();
  if (!key || !memo.trim()) return { source: "none" };
  const r = await askGemini(key, s, text, memo, methods);
  if (!catNames(s).includes(r.category)) r.category = FALLBACK;
  const base = (r.payment ? memo.replace(r.payment, " ") : memo).replace(/\s+/g, " ").trim() || memo;
  if (!r.confident || !r.merchant?.trim()) r.merchant = base;
  await learn(s, base, r.merchant, r.category, "gemini");
  return { merchant: r.merchant, category: r.category, kind: r.kind, confident: r.confident, payment: r.payment || "", source: "gemini" };
}

/* ---------- 설정 정리 ---------- */
function cleanSettings(s, b) {
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
    s.recurring = b.recurring.filter((r) => r && r.id && String(r.name || "").trim() && Number(r.amount) > 0).map((r) => {
      const old = prev.get(String(r.id));
      return {
        id: String(r.id), name: String(r.name).trim().slice(0, 30), amount: Math.round(Number(r.amount)),
        day: Math.min(31, Math.max(1, Math.round(Number(r.day) || 1))),
        cat: catNames(s).includes(r.cat) ? r.cat : FALLBACK, p: r.p ? String(r.p) : null, paused: !!r.paused,
        start: old?.start || thisYm,
        // 일시정지했다가 다시 시작하면 멈춰 있던 달은 채우지 않는다
        last: old?.paused && !r.paused ? [old.last, shiftYm(thisYm, -1)].filter(Boolean).sort().pop() : old?.last || null,
      };
    });
  }
  return s;
}
const ITEM_FIELDS = ["d", "t", "a", "c", "m", "p", "pn", "r", "ts", "rec"];
function cleanItem(b, names) {
  const it = {};
  for (const k of ITEM_FIELDS) if (b[k] !== undefined) it[k] = b[k];
  if (it.a !== undefined) it.a = Math.round(Number(it.a)) || 0;
  if (it.t !== undefined && it.t !== "in") it.t = "out";
  if (it.c !== undefined && !names.includes(it.c)) it.c = FALLBACK;
  return it;
}

/* ---------- 예전 서버 API와 같은 모양 ---------- */
export async function localApi(method, path, body = {}) {
  const [name, id] = path.split("/");
  const s = await settings();

  if (name === "state" && method === "GET") {
    await addNewDefaultCats();
    await materializeRecurring();
    const items = (await getAll("items")).sort((a, b) => b.d.localeCompare(a.d) || b.ts - a.ts);
    return { items, settings: await settings(), ai: !!(await geminiKey()) };
  }
  if (name === "items" && method === "POST") {
    if (!body.id || !body.d || !body.a) throw new Error("id, d, a가 필요해요.");
    const it = { p: null, pn: null, r: null, ts: Date.now(), t: "out", c: FALLBACK, m: "", ...cleanItem(body, catNames(s)), id: body.id };
    await put("items", it);
    return it;
  }
  if (name === "items" && id && method === "PATCH") {
    const cur = await get("items", id);
    if (!cur) throw new Error("없는 항목이에요.");
    const next = { ...cur, ...cleanItem(body, catNames(s)) };
    await put("items", next);
    // 직접 분류를 고치면 그 상호는 다음부터 이 분류로
    if (body.learn && body.c) await learn(s, next.m, next.m, next.c, "user");
    return next;
  }
  if (name === "items" && id && method === "DELETE") { await del("items", id); return { ok: true }; }

  if (name === "settings" && method === "PUT") { const n = cleanSettings(s, body); await saveSettings(n); return n; }

  if (name === "categories" && id === "rename" && method === "POST") {
    const { from, to } = body;
    for (const it of await getAll("items")) if (it.c === from) await put("items", { ...it, c: to });
    for (const m of await getAll("merchants")) if (m.cat === from) await put("merchants", { ...m, cat: to });
    if (s.recurring?.some((r) => r.cat === from)) { s.recurring.forEach((r) => { if (r.cat === from) r.cat = to; }); await saveSettings(s); }
    return { ok: true };
  }

  if (name === "receipt" && method === "POST") {
    const key = await geminiKey();
    if (!key) return { error: "설정에서 Gemini 키를 넣으면 영수증을 읽을 수 있어요." };
    try {
      const r = await readReceipt(key, s, body);
      if (!r.readable || !(r.total > 0)) return { error: "영수증 금액을 읽지 못했어요. 영수증 전체가 보이게 다시 찍어 주세요." };
      return { merchant: r.merchant, total: Math.round(r.total), date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "", payment: r.payment || "", category: r.category };
    } catch (e) {
      console.warn("[receipt]", e.message);
      return { error: e.status === 429 ? "Gemini 사용 한도에 걸렸어요. 잠시 뒤 다시 찍어 주세요." : "영수증을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요." };
    }
  }
  if (name === "understand" && method === "POST") {
    try { return await understand(body); }
    catch (e) { console.warn("[understand]", e.message); return { source: "error", error: e.message }; }
  }

  // Gemini 키: 이 기기 안에만 저장, 백업 파일에도 넣지 않는다
  if (name === "gemini" && method === "GET") { const k = await geminiKey(); return { set: !!k, hint: k ? k.slice(0, 4) + "…" + k.slice(-4) : "" }; }
  if (name === "gemini" && method === "PUT") {
    const key = String(body.key || "").trim();
    if (key) await put("kv", { key }, "gemini"); else await del("kv", "gemini");
    return { set: !!key };
  }

  if (name === "export" && method === "GET")
    return { app: "mono", version: 1, exportedAt: new Date().toISOString(), settings: s, items: await getAll("items"), merchants: await getAll("merchants") };
  if (name === "import" && method === "POST") {
    if (body.app !== "mono" || !Array.isArray(body.items)) throw new Error("Mono 백업 파일이 아니에요.");
    await clear("items"); await clear("merchants");
    for (const it of body.items) if (it && it.id && it.d) await put("items", it);
    for (const m of body.merchants || []) if (m && m.key) await put("merchants", m);
    await saveSettings({ ...DEFAULT_SETTINGS, ...(body.settings || {}) });
    return { ok: true, items: body.items.length };
  }
  throw new Error("없는 경로예요: " + path);
}
