// Mono 화면 로직
/* ---------- vocabulary ---------- */
// 분류는 설정에서 바꿀 수 있다. 서버에서 받아 오기 전까지 쓰는 기본값.
import { localApi, COLORS, DEFAULT_CATS } from "./local.js";
const COLOR_NAMES = {"lemon": "레몬", "amber": "앰버", "cherry": "체리 레드", "rose": "핫핑크", "violet": "바이올렛", "iris": "인디고", "royal": "로열 블루", "sky": "스카이", "aqua": "터쿼이즈", "emerald": "에메랄드", "lime": "라임"};
const IN_KEYS = ["월급","급여","보너스","상여","용돈","이자","환급","입금","수입","부수입","캐시백","받음","받았","들어옴","정산"];
const INCOME = "수입", FALLBACK = "기타";
const allCats = () => [...S.cats.map(c=>c.name), INCOME];
const catByName = n => S.cats.find(c=>c.name===n);
const FILLER = /(썼음|썼어요?|썼다|씀|사용|결제함?|지출|냈음|냈어|샀음|샀어|구매|했음|에서|으로|에)(?=\s|$)/g;

/* ---------- utils ---------- */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const ymd = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const won = n => Math.round(n).toLocaleString("ko-KR");
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// 카테고리 색: 팔레트 이름이면 토큰, 직접 고른 색(#RRGGBB)이면 그대로
const colorValue = c => /^#[0-9a-f]{6}$/i.test(c||"") ? c : `var(--k-${c||"lime"})`;
const color = n => n===INCOME ? "var(--k-teal)" : colorValue((catByName(n)||{}).color);
const today = new Date(); today.setHours(0,0,0,0);
const TODAY = ymd(today), THIS_YM = TODAY.slice(0,7);
const daysIn = ym => { const [y,m]=ym.split("-").map(Number); return new Date(y,m,0).getDate(); };
const shiftYm = (ym,n) => { const [y,m]=ym.split("-").map(Number); const t=new Date(y,m-1+n,1); return t.getFullYear()+"-"+pad(t.getMonth()+1); };
const WD = ["일","월","화","수","목","금","토"];
function dayLabel(d){
  if(d===TODAY) return "오늘";
  const y=new Date(today); y.setDate(y.getDate()-1); if(d===ymd(y)) return "어제";
  const t=new Date(d+"T00:00:00"); return (t.getMonth()+1)+"월 "+t.getDate()+"일 "+WD[t.getDay()]+"요일";
}

/* ---------- natural language ---------- */
function cut(text, m){ return (text.slice(0,m.index)+" "+text.slice(m.index+m[0].length)).replace(/\s+/g," ").trim(); }
function parseDate(text){
  let d = new Date(today), m;
  if((m = text.match(/(오늘|어제|그제|그저께|엊그제)/))){
    d.setDate(d.getDate() - ({"오늘":0,"어제":1,"그제":2,"그저께":2,"엊그제":2}[m[1]]));
  } else if((m = text.match(/(\d{1,2})\s*일\s*전/))){
    d.setDate(d.getDate() - +m[1]);
  } else if((m = text.match(/(지난주|저번주|이번주)?\s*([월화수목금토일])요일/))){
    const target = WD.indexOf(m[2]);
    if(m[1]==="지난주"||m[1]==="저번주"){
      const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay()+6)%7) - 7);
      d = new Date(mon); d.setDate(mon.getDate() + ((target+6)%7));
    } else {
      let back = (d.getDay() - target + 7) % 7; d.setDate(d.getDate()-back);
    }
  } else if((m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)) || (m = text.match(/(?<![\d.,])(\d{1,2})\s*[\/.]\s*(\d{1,2})(?![\d만천원])/))){
    d = new Date(today.getFullYear(), +m[1]-1, +m[2]);
    if(d > today) d.setFullYear(d.getFullYear()-1);
  } else if((m = text.match(/(?<![\d.,])(\d{1,2})\s*일(?![\d가-힣])/))){
    d = new Date(today.getFullYear(), today.getMonth(), +m[1]);
    if(d > today) d.setMonth(d.getMonth()-1);
  }
  return m ? {date:ymd(d), rest:cut(text,m)} : {date:TODAY, rest:text};
}
function parseAmount(text){
  const re = /(\d[\d,]*(?:\.\d+)?)\s*만(?:\s*(\d[\d,]*)\s*(천)?)?\s*원?|(\d[\d,]*(?:\.\d+)?)\s*천\s*원?|(\d[\d,]*)\s*원?/g;
  let m, last=null;
  while((m = re.exec(text))) if(m[0].trim()) last = m;
  if(!last) return {amount:0, rest:text};
  const n = s => parseFloat(String(s).replace(/,/g,""));
  let v;
  if(last[1]!==undefined){ v = n(last[1])*1e4; if(last[2]) v += n(last[2])*(last[3]?1000:1); }
  else if(last[4]!==undefined) v = n(last[4])*1000;
  else v = n(last[5]);
  return {amount: isFinite(v)?Math.round(v):0, rest: cut(text,last)};
}
function localCat(memo, type){
  if(type==="in") return "수입";
  const low = memo.toLowerCase();
  for(const c of S.cats) if(c.keys.some(k=>k && low.includes(k.toLowerCase()))) return c.name;
  const prev = items().find(i=>i.m.toLowerCase()===low && i.c!==FALLBACK && catByName(i.c));
  return prev ? prev.c : null;
}
// 결제수단은 단어 단위로만 찾는다 ("현대카드" 속의 "카드"는 무시)
const reEsc = k => k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const PAY_TAIL = "(?:으로|로|결제|에서)?";
function parseMethod(text){
  const keys = [];
  S.methods.forEach(m=>[m.name,...m.alias].forEach(k=>{ k=k.trim(); if(k) keys.push([k,m]); }));
  keys.sort((a,b)=>b[0].length-a[0].length);
  for(const [k,m] of keys){
    const hit = text.match(new RegExp("(^|\\s)"+reEsc(k)+PAY_TAIL+"(?=\\s|$)","i"));
    if(hit) return {method:m, rest:cut(text,hit)};
  }
  // 별칭은 단어 안에 들어 있어도 그 수단으로 ("현대" 별칭 → "현대카드로", "현대카드" 모두) — 그 단어는 메모에서 뺀다
  const aliases = [];
  S.methods.forEach(m=>m.alias.forEach(k=>{ k=k.trim(); if(k) aliases.push([k,m]); }));
  aliases.sort((a,b)=>b[0].length-a[0].length);
  for(const [k,m] of aliases){
    const hit = text.match(new RegExp("(^|\\s)(\\S*"+reEsc(k)+"\\S*)(?=\\s|$)","i"));
    if(hit) return {method:m, rest:cut(text,hit)};
  }
  // 등록 안 된 카드·간편결제 이름: 상호로 착각하지 않게 떼어 두고 이름만 남긴다
  const other = text.match(new RegExp("(^|\\s)([^\\s\\d]{1,10}?(?:카드|페이|pay))"+PAY_TAIL+"(?=\\s|$)","i"));
  if(other) return {method:{id:null,name:other[2]}, rest:cut(text,other), unregistered:true};
  return {method:methodById(S.def)||S.methods[0]||null, rest:text, fallback:true};
}
// 이름이나 별칭으로 등록된 결제수단 찾기
function matchMethod(name){
  const n = String(name||"").toLowerCase().replace(/\s/g,"");
  if(!n) return null;
  const norm = k=>String(k).toLowerCase().replace(/\s/g,"");
  return S.methods.find(m=>[m.name,...m.alias].some(k=>{ k=norm(k); return k && k===n; }))
    // 별칭이 결제 이름 안에 들어 있으면 그 수단 (예: 별칭 "현대" → "현대카드")
    || S.methods.find(m=>m.alias.some(k=>{ k=norm(k); return k && n.includes(k); })) || null;
}
const methodById = id => S.methods.find(m=>m.id===id);
const methodName = it => (methodById(it.p)||{}).name || it.pn || "";
function parse(raw){
  let text = raw.trim(); if(!text) return null;
  let type = "out";
  if(/^\+/.test(text)){ type="in"; text=text.slice(1).trim(); }
  const pm = parseMethod(text); text = pm.rest;
  const dt = parseDate(text);
  const am = parseAmount(dt.rest);
  let memo = am.rest.replace(FILLER," ").replace(/\s+/g," ").trim();
  if(type==="out" && IN_KEYS.some(k=>memo.includes(k))) type="in";
  const cat = localCat(memo, type);
  return {date:dt.date, amount:am.amount, type, memo: memo || (type==="in"?"수입":"지출"), cat, raw, method:pm.method, methodGuessed:!!pm.fallback, unregistered:!!pm.unregistered};
}

/* ---------- state + server ---------- */
const S = { months:{}, budget:1500000, view:THIS_YM, ai:false,
  methods:[{id:"card",name:"카드",alias:["체크","신용"]},{id:"cash",name:"현금",alias:[]}], def:"card",
  cats: DEFAULT_CATS.map(c=>({...c, keys:c.keys.slice()})), recurring: [] };
function items(ym){ return (ym ? (S.months[ym]||[]) : Object.values(S.months).flat()).slice().sort((a,b)=>b.d.localeCompare(a.d)||b.ts-a.ts); }
// 모든 기록은 이 기기 안(local.js)에 저장한다
const api = (method, path, body) => localApi(method, path, body ? JSON.parse(JSON.stringify(body)) : undefined);
const fail = () => flash("저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.");
const saveSettings = (extra) => api("PUT","settings",{budget:S.budget, methods:S.methods, def:S.def, cats:S.cats, recurring:S.recurring, skin:S.skin, links:S.links, ...extra}).catch(fail);
// 테마(default / liquid): <html data-skin>으로 켜고, 다음 실행 때 바로 칠하도록 localStorage에도
const SKINS=[["default","default"],["liquid","liquid"]];
function applySkin(k){
  S.skin = SKINS.some(s=>s[0]===k) ? k : "default";
  if(S.skin==="default") delete document.documentElement.dataset.skin; else document.documentElement.dataset.skin=S.skin;
  try{ localStorage.setItem("mono-skin", S.skin); }catch(e){}
  wall(S.skin==="liquid");
}
// liquid 배경: 뿌연 원들이 천천히 떠다니며 서로·벽에 부딪혀 튕긴다 (저해상도 캔버스라 가볍고 저절로 흐릿)
const wall = (()=>{
  const cv = document.getElementById("wall"), ctx = cv.getContext("2d"), K = .25; // 1/4 해상도
  const dark = matchMedia("(prefers-color-scheme: dark)"), still = matchMedia("(prefers-reduced-motion: reduce)");
  const LIGHT = ["#F2CFC1","#F3DFCB","#E9D3DD","#F0C4B4","#DDD6EA"], DARK = ["#4A2A20","#3A2632","#55301F","#2E2A3A","#40261D"];
  let on=false, raf=0, last=0, W=0, H=0, balls=[];
  const size = ()=>{ W=innerWidth; H=innerHeight; cv.width=Math.ceil(W*K); cv.height=Math.ceil(H*K); };
  const seed = ()=>{
    const m=Math.min(W,H);
    balls = [.62,.5,.56,.44,.4].map((r,i)=>{ const a=Math.random()*Math.PI*2, sp=14+Math.random()*12;
      return { r:m*r, x:Math.random()*W, y:Math.random()*H, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, c:i }; });
  };
  const step = dt=>{
    for(const b of balls){
      b.x+=b.vx*dt; b.y+=b.vy*dt;
      const e=b.r*.35; // 원의 가운데 부분이 화면 밖으로 너무 나가지 않게
      if(b.x<-e&&b.vx<0||b.x>W+e&&b.vx>0) b.vx*=-1;
      if(b.y<-e&&b.vy<0||b.y>H+e&&b.vy>0) b.vy*=-1;
    }
    // 서로 부딪히기: 보이는 크기의 절반쯤에서 탄성 충돌 (같은 무게)
    for(let i=0;i<balls.length;i++) for(let j=i+1;j<balls.length;j++){
      const a=balls[i], b=balls[j], dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1, min=(a.r+b.r)*.45;
      if(d>=min) continue;
      const nx=dx/d, ny=dy/d, rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if(rel<0){ a.vx+=rel*nx; a.vy+=rel*ny; b.vx-=rel*nx; b.vy-=rel*ny; }
      const push=(min-d)/2; a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;
    }
  };
  const draw = ()=>{
    const pal = dark.matches ? DARK : LIGHT, al = dark.matches ? .8 : .75;
    ctx.clearRect(0,0,cv.width,cv.height);
    for(const b of balls){
      const x=b.x*K, y=b.y*K, r=b.r*K, g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0, pal[b.c]); g.addColorStop(1, pal[b.c]+"00");
      ctx.globalAlpha=al; ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    ctx.globalAlpha=1;
  };
  const tick = t=>{ // 약 30fps로만 다시 그린다
    if(!on) return;
    if(t-last >= 32){ step(Math.min(.1,(t-last)/1000)); last=t; draw(); }
    raf=requestAnimationFrame(tick);
  };
  addEventListener("resize", ()=>{ if(on){ size(); draw(); } });
  document.addEventListener("visibilitychange", ()=>{ if(!on) return; cancelAnimationFrame(raf); if(document.visibilityState==="visible" && !still.matches){ last=performance.now(); raf=requestAnimationFrame(tick); } });
  dark.addEventListener?.("change", ()=>on&&draw());
  return go=>{
    if(go===on) return; on=go; cancelAnimationFrame(raf);
    if(!on) return;
    size(); if(!balls.length) seed(); draw();
    if(!still.matches){ last=performance.now(); raf=requestAnimationFrame(tick); }
  };
})();
function applySettings(v){
  if(typeof v.budget==="number") S.budget=v.budget;
  if(Array.isArray(v.methods)) S.methods=v.methods.map(m=>({id:m.id,name:m.name,alias:Array.isArray(m.alias)?m.alias.slice():[]}));
  if(typeof v.def==="string") S.def=v.def;
  if(typeof v.skin==="string") applySkin(v.skin);
  if(v.links && typeof v.links==="object") S.links={pay:+v.links.pay||0, sms:+v.links.sms||0};
  if(Array.isArray(v.recurring)) S.recurring=v.recurring.map(r=>({...r}));
  if(Array.isArray(v.cats) && v.cats.length) S.cats=v.cats.map(c=>({id:c.id,name:c.name,color:c.color||"gray",keys:Array.isArray(c.keys)?c.keys.slice():[]}));
}
async function boot(){
  renderHome();
  await load();
}
// 서버에서 내역과 설정을 다시 받는다 (정기 결제는 이때 서버가 자동 기록)
async function load(){
  try{
    const s = await api("GET","state");
    S.months = {};
    s.items.forEach(i=>(S.months[i.d.slice(0,7)] ||= []).push(i));
    applySettings(s.settings); S.ai = s.ai;
    loaded = true;
    $("ai").textContent = s.ai ? "Gemini가 텍스트를 인식해요" : "Gemini 꺼짐 · 설정에서 키를 넣으면 켜져요";
  }catch(e){ flash("저장된 기록을 불러오지 못했어요. 개인정보 보호 모드에서는 저장이 안 될 수 있어요."); }
  renderHome(); if(sheetOpen) renderSheet();
}

/* ---------- home ---------- */
const q=$("q"), under=$("under"), go=$("go");
let draft=null, lastAdded=null, flashTimer;
function preview(){
  draft = parse(q.value);
  go.hidden = !(draft && draft.amount>0);
  $("cam").hidden = !!q.value.trim();
  if(!draft){ under.innerHTML=""; return; }
  const c = draft.cat || "카테고리 자동";
  const pm = draft.method ? `<span class="sep">·</span><span class="tag" style="${draft.methodGuessed?"":"color:var(--label)"}">${esc(draft.method.name)}${draft.unregistered?" (미등록)":""}</span>` : "";
  // 비어 있다가 처음 뜰 때만 움직인다 (타자 칠 때마다 다시 움직이지 않게)
  const entering = !under.firstChild;
  under.innerHTML =
    `<span class="amt num ${draft.type}">${draft.amount ? (draft.type==="in"?"+":"")+won(draft.amount)+"원" : "금액?"}</span><span class="sep">·</span>`+
    `<span class="tag"><span class="dot" style="background:${draft.cat?color(draft.cat):"var(--label3)"}"></span>${esc(c)}</span>${pm}<span class="sep">·</span>`+
    `<span>${dayLabel(draft.date)}</span><span class="sep">·</span><span>${esc(draft.memo)}</span>`;
  // 처음 뜰 때만 아래에서 살짝 올라오고, 이후 글자를 칠 때는 제자리에서 글자만 바뀐다
  if(entering){ under.classList.remove("enter"); void under.offsetWidth; under.classList.add("enter"); }
  else under.classList.remove("enter");
}
q.addEventListener("input", ()=>{ lastAdded=null; preview(); });
// 첫 화면의 빈 곳을 누르면 키보드 내리기
document.querySelector(".home").addEventListener("pointerdown", e=>{ if(!e.target.closest("form, button, a")) q.blur(); });
$("form").addEventListener("submit", e=>{
  e.preventDefault();
  if(!q.value.trim()){ q.blur(); return; } // 빈 칸에서 ✓: 키보드 내리기
  if(!draft || !(draft.amount>0)){ flash("금액을 함께 적어 주세요. 예: 점심 9,000원"); return; }
  const it = {id:uid(), ts:Date.now(), d:draft.date, t:draft.type, a:draft.amount, c:draft.cat||FALLBACK, m:draft.memo};
  if(draft.method){ it.p = draft.method.id; it.pn = draft.method.name; }
  it.r = draft.raw;
  const ym = it.d.slice(0,7);
  (S.months[ym] ||= []).push(it);
  const d = draft;
  q.value=""; go.hidden=true; $("cam").hidden=false; lastAdded=it;
  showDone(it, !d.cat);
  renderHome(); if(sheetOpen) renderSheet();
  api("POST","items",it).then(()=>understandItem(it, d)).catch(fail);
});
function showDone(it, pending){
  const mn = methodName(it);
  under.innerHTML = `<span class="done"><span class="tag"><span class="dot" style="background:${pending?"var(--label3)":color(it.c)}"></span><b class="m"></b></span> · ${pending?"알아보는 중…":esc(it.c)} · ${it.t==="in"?"+":""}${won(it.a)}원${mn?" · "+esc(mn):""} · ${dayLabel(it.d)}</span> <button id="undo">실행 취소</button>`;
  under.querySelector(".m").textContent = it.m;
  $("undo").onclick = ()=>{ remove(it.id); under.innerHTML=""; q.focus(); };
  clearTimeout(flashTimer); flashTimer=setTimeout(()=>{ if(lastAdded && lastAdded.id===it.id) under.innerHTML=""; },5000);
}
// 서버에 물어본다: 기억해 둔 상호면 즉시, 처음 보는 상호면 Gemini
async function understandItem(it, d, retry){
  const patch = {};
  try{
    const r = await api("POST","understand",{text:d.raw, memo:d.memo, methods:S.methods.map(m=>m.name)});
    // Gemini가 붐벼서 실패하면 20초 뒤 한 번 더
    if(r.source==="error" && !retry) setTimeout(()=>{ if(find(it.id)[0]) understandItem(it, d, true); }, 20000);
    if(r.source==="memory" || r.source==="gemini"){
      // 결제수단을 입력에서 못 찾았는데 Gemini가 찾았으면 반영
      if(r.payment && (d.methodGuessed || d.unregistered)){
        const m = matchMethod(r.payment);
        if(m){ patch.p=m.id; patch.pn=m.name; }
        else if(d.methodGuessed){ patch.p=null; patch.pn=r.payment; }
      }
      if(r.category && allCats().includes(r.category) && r.category!==it.c && !(d.type==="in" && r.category!==INCOME)){ patch.c=r.category; patch.t=r.category===INCOME?"in":"out"; }
      if(r.merchant && r.merchant!==it.m) patch.m=r.merchant;
    }
  }catch(e){}
  if(Object.keys(patch).length) update(it.id, patch);
  if(lastAdded && lastAdded.id===it.id){ lastAdded={...lastAdded,...patch}; showDone(lastAdded,false); }
}
function flash(msg){ under.innerHTML=`<span class="done"></span>`; under.firstChild.textContent=msg; }
// 화살표: 목록은 iOS처럼 가늘고 연한 화살표, 첫 화면 '내역 보기' 하나만 동그란 원 화살표
const CHEV = `<svg class="chv" width="7" height="12" viewBox="0 0 7 12" aria-hidden="true"><path d="M1.2 1.2 5.8 6l-4.6 4.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEV_ROUND = `<svg class="chv-round" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle class="chv-bg" cx="9" cy="9" r="9"/><path d="M7.6 5.6 11 9l-3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
let shownOut = null, animId = 0, loaded = false;
function renderHome(){
  const list = items(THIS_YM);
  const out = list.filter(i=>i.t==="out").reduce((s,i)=>s+i.a,0);
  // 기록을 불러온 뒤에 비어 있으면 0원에서 시작: 이번 달 첫 기록도 숫자가 올라가게
  if(!list.length){ $("open").innerHTML = `내역 보기 ${CHEV_ROUND}`; shownOut = loaded ? 0 : null; return; }
  $("open").innerHTML = `이번 달 <b class="num" id="outNum"></b> 사용 ${CHEV_ROUND}`;
  countTo(out);
}
// 금액이 바뀌면 숫자가 굴러가듯 바뀐다 (처음 열 때는 바로 표시)
function countTo(target){
  const el = $("outNum");
  cancelAnimationFrame(animId);
  const from = shownOut ?? target;
  if(from===target){ shownOut = target; el.textContent = won(target)+"원"; return; }
  // 숫자가 올라가는 건 항상, 커졌다 작아지는 효과는 '동작 줄이기'가 꺼져 있을 때만
  if(target>from && !matchMedia("(prefers-reduced-motion: reduce)").matches){ el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  const t0 = performance.now(), dur = 900;
  const step = now=>{
    const p = Math.min(1,(now-t0)/dur), e = 1-Math.pow(1-p,3);
    shownOut = Math.round(from+(target-from)*e);
    el.textContent = won(shownOut)+"원";
    if(p<1) animId = requestAnimationFrame(step); else setTimeout(()=>el.classList.remove("bump"), 300);
  };
  animId = requestAnimationFrame(step);
}

/* ---------- 결제 알림 (단축어 → iOS 앱 → 여기) ---------- */
// iOS 쪽이 Preferences(monoPending)에 쌓아 둔 결제를 읽어서 기록한다.
// approved: 알림에서 [기록]을 누름 → 바로 기록 / review·pending: 앱 안에서 다시 묻기 / ignored: 버림
const nativePrefs = ()=> window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Preferences;
async function readPending(P){ const {value} = await P.get({key:"monoPending"}); try{ return JSON.parse(value||"[]"); }catch(e){ return []; } }
async function recordParsed(r, x){
  if(r.cancel || !(r.total>0)) return null;
  const memo = r.merchant || "결제";
  const method = matchMethod(r.payment) || (r.payment ? {id:null, name:r.payment} : (methodById(S.def)||null));
  const cat = (r.category && allCats().includes(r.category)) ? r.category : (localCat(memo,"out") || FALLBACK);
  const d = r.date || ymd(new Date(x.ts || Date.now()));
  const it = {id:uid(), ts:Date.now(), d, t: cat===INCOME?"in":"out", a:r.total, c:cat, m:memo, r:x.text};
  if(method){ it.p = method.id; it.pn = method.name; }
  (S.months[d.slice(0,7)] ||= []).push(it);
  await api("POST","items",it);
  // Gemini가 없으면 기억해 둔 상호로 분류 보강
  if(!S.ai) understandItem(it, {raw:`${memo} ${r.total}`, memo, type:it.t, cat:null, methodGuessed:false, unregistered:false});
  return it;
}
let syncing = false;
async function syncPending(){
  const P = nativePrefs();
  if(!P || syncing || !document.documentElement.classList.contains("splash-done")) return;
  syncing = true;
  try{
    const q = await readPending(P);
    if(!q.length) return;
    const handled = new Set(q.map(x=>x.id));
    noteLinks(q);
    const added = [];
    for(const x of q.filter(x=>x.status==="approved")){
      const it = await recordParsed(await api("POST","payment/parse",{text:x.text}), x);
      if(it) added.push(it);
    }
    const ask = q.filter(x=>x.status==="review" || x.status==="pending");
    // 처리한 것만 지운다 (그 사이 새로 들어온 건 남김)
    const latest = await readPending(P);
    await P.set({key:"monoPending", value: JSON.stringify(latest.filter(x=>!handled.has(x.id)))});
    renderHome(); if(sheetOpen) renderSheet();
    if(added.length===1){ lastAdded = added[0]; showDone(added[0], false); }
    else if(added.length>1) flash(`결제 알림에서 ${added.length}건 기록했어요.`);
    if(ask.length) askPayments(ask);
  } finally { syncing = false; }
}
// 문자인지 애플페이인지 대강 가려서 마지막으로 들어온 때를 남긴다 (설정에 '연결됨' 표시용)
function noteLinks(q){
  S.links = S.links || {pay:0, sms:0};
  let changed=false;
  for(const x of q){
    const k = /승인|Web발신|일시불|할부|누적|잔액|\[.*카드\]/.test(x.text) ? "sms" : "pay";
    const t = x.ts || Date.now();
    if(t > (S.links[k]||0)){ S.links[k]=t; changed=true; }
  }
  if(changed) saveSettings();
}
// 알림에 답하지 않은 결제: 앱 안에서 한 건씩 묻기
async function askPayments(list){
  const x = list[0]; if(!x) return;
  const r = await api("POST","payment/parse",{text:x.text});
  const next = ()=>{ closeAS(); setTimeout(()=>askPayments(list.slice(1)), 250); };
  if(r.cancel || !(r.total>0)) return askPayments(list.slice(1));
  const as = showAS(`<div class="g"><div class="h"></div><div class="pay-ask"></div>
    <button class="btn b" id="payOk">기록</button></div><div class="g"><button class="btn b" id="payNo">무시</button></div>`);
  as.querySelector(".h").textContent = "이 결제를 기록할까요?";
  as.querySelector(".pay-ask").textContent = `${r.merchant || "결제"} · ${won(r.total)}원${r.payment ? " · "+r.payment : ""}${r.date && r.date!==TODAY ? " · "+dayLabel(r.date) : ""}`;
  $("payOk").onclick = async ()=>{ const it = await recordParsed(r, x); renderHome(); if(sheetOpen) renderSheet(); if(it){ lastAdded = it; showDone(it, false); } next(); };
  $("payNo").onclick = next;
}
window.addEventListener("monoPending", ()=>syncPending());
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") syncPending(); });

/* ---------- 시작 애니메이션 ---------- */
let appReady = false;
function runSplash(){
  const sp = $("splash"), svg = $("splashSvg"), logoImg = document.querySelector(".logo img");
  const finish = ()=>{ document.documentElement.classList.add("splash-done"); q.focus(); syncPending(); };
  if(!sp) return finish();
  const set = (id, k, v)=>$(id).setAttribute(k, v);
  const ease = t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2, out = t=>1-Math.pow(1-t,3), clamp = t=>Math.min(1,Math.max(0,t));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  let shrinkAt = null;
  const frame = now=>{
    const t = now - t0;
    // 1) o가 구멍에서 그대로 미끄러져 나오며 mono가 된다 (0.15~0.9초)
    const p = reduce ? 1 : ease(clamp((t-150)/750));
    set("spM","transform",`translate(${118.44*(1-p)} 0)`); set("spN","transform",`translate(${-6.93*(1-p)} 0)`);
    set("spO1","cx",245.03+6.93*p); set("spO2","cx",370.96+132.86*p);
    const moving = t >= 150 || reduce;
    set("spH1","opacity",moving?0:1); set("spH2","opacity",moving?0:1);
    // 겹친 곳 빼기: 움직이는 동안만 켠다 (멈춰 있을 땐 구멍을 꽉 채운 모양 그대로)
    if(moving && !$("spGlyphs").hasAttribute("mask")){ set("spGlyphs","mask","url(#spMaskG)"); set("spOs","mask","url(#spMaskO)"); }
    set("spMO1","cx",245.03+6.93*p); set("spMO2","cx",370.96+132.86*p);
    set("spMM","transform",`translate(${118.44*(1-p)} 0)`); set("spMN","transform",`translate(${-6.93*(1-p)} 0)`);
    // 2) n 아래 홈이 위에서 아래로 열린다 (0.9~1.25초)
    set("spSlotRect","y", 170 + 32*(reduce ? 1 : out(clamp((t-900)/350))));
    // 3) 기록을 다 불러왔고 최소 1.5초가 지나면(늦어도 3초) 검색창 위 로고 자리로 줄어든다
    if(shrinkAt===null && ((appReady && logoImg.getBoundingClientRect().width>0 && t>=1500) || t>=3000)) shrinkAt = t;
    if(shrinkAt!==null){
      const dur = reduce ? 200 : 600, q = out(clamp((t-shrinkAt)/dur));
      const ph = sp.getBoundingClientRect(), lg = logoImg.getBoundingClientRect();
      const w0 = Math.min(230, innerWidth*.62), h0 = w0*254.52/615.97;
      const cx = ph.width/2 - w0/2, cy = ph.height/2 - h0/2, s = lg.width / w0;
      const x = cx + (lg.left - cx)*q, y = cy + (lg.top - cy)*q, sc = 1 + (s-1)*q;
      svg.style.transform = `translate(${x - ph.width/2}px, ${y - ph.height/2}px) scale(${sc})`;
      const Lf = lg.left, Tf = lg.top, Rf = ph.width - lg.right, Bf = ph.height - lg.bottom;
      if(reduce){ sp.style.opacity = String(1-q); } else sp.style.clipPath = `inset(${Tf*q}px ${Rf*q}px ${Bf*q}px ${Lf*q}px)`;
      if(q >= 1) return finish();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ---------- 영수증 ---------- */
// 사진을 줄여서(긴 변 1600px JPEG) Gemini에 보낸다
async function shrinkImage(file){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((ok,no)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=no; i.src=url; });
    const k = Math.min(1, 1600/Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return { mime:"image/jpeg", data: c.toDataURL("image/jpeg", .85).split(",")[1] };
  } finally { URL.revokeObjectURL(url); }
}
// 읽은 결과를 입력칸에 한 줄로: 확인하고 ✓를 누르면 기록
function receiptLine(r){
  const parts = [];
  if(r.date && r.date!==TODAY){ const [,m,d] = r.date.split("-").map(Number); parts.push(`${m}월 ${d}일`); }
  parts.push(r.merchant || "영수증", won(r.total)+"원");
  if(r.payment) parts.push(r.payment);
  return parts.join(" ");
}
$("camFile").addEventListener("change", async e=>{
  const f = e.target.files[0]; e.target.value = "";
  if(!f) return;
  const cam = $("cam"); cam.classList.add("busy");
  flash("영수증 읽는 중…");
  try{
    const r = await api("POST","receipt", await shrinkImage(f));
    if(r.error){ flash(r.error); return; }
    q.value = receiptLine(r); preview();
    q.focus();
  }catch(err){ flash("영수증을 읽지 못했어요. 다시 찍어 주세요."); }
  finally{ cam.classList.remove("busy"); }
});

/* ---------- edits ---------- */
function find(id){ for(const ym in S.months){ const i=S.months[ym].findIndex(x=>x.id===id); if(i>-1) return [ym,i]; } return [null,-1]; }
function update(id, patch, learn){
  const [ym,i]=find(id); if(!ym) return;
  Object.assign(S.months[ym][i],patch);
  api("PATCH","items/"+id,{...patch, learn:!!learn}).catch(fail);
  renderHome(); if(sheetOpen) renderSheet();
}
function remove(id){
  const [ym,i]=find(id); if(!ym) return;
  S.months[ym].splice(i,1);
  api("DELETE","items/"+id).catch(fail);
  renderHome(); if(sheetOpen) renderSheet();
}

/* ---------- sheet ---------- */
let sheetOpen=false, editingBudget=false, view="list", txOpen=false, selDay=null;
let txMode = "list"; // 내역은 목록이 기본, 달력은 아이콘을 눌렀을 때만
function openSheet(v){
  q.blur(); window.scrollTo(0,0); txOpen=false; selDay=null; txMode="list"; filter=null; sheetOpen=true; view=v||"list"; S.view=THIS_YM; renderSheet();
  $("scroll").scrollTop = 0;
  requestAnimationFrame(()=>{ $("scrim").classList.add("on"); $("sheet").classList.add("on"); flyLogo(true); });
}
function closeSheet(){ sheetOpen=false; editingBudget=false; $("scrim").classList.remove("on"); $("sheet").classList.remove("on"); flyLogo(false); closeAS(); q.focus(); }
// 로고: 시트가 올라오면 작아지며 시트 위 빈 곳 가운데로, 내려가면 제자리로
let flyTimer=null, flyGeo=null;
const flyAt=(p)=>{ // p: 0=위쪽 가운데, 1=제자리
  const {a,b}=flyGeo, k=v=>a[v]+(b[v]-a[v])*p;
  return `translate(${k("x")}px, ${k("y")}px) scale(${k("s")})`;
};
function flyLogo(open){
  const real=document.querySelector(".logo img"), fl=$("flyLogo");
  clearTimeout(flyTimer);
  if(open){
    const r=real.getBoundingClientRect(); if(!r.width) return;
    const sheetTop=parseFloat(getComputedStyle($("sheet")).top)||57, h=20, s=h/r.height, w=r.width*s;
    flyGeo={ a:{x:(innerWidth-w)/2, y:sheetTop-28.5-h/2, s}, b:{x:r.left, y:r.top, s:1} };
    fl.style.width=r.width+"px"; fl.style.transition="none"; fl.style.transform=flyAt(1);
    fl.classList.add("on"); real.style.visibility="hidden"; void fl.offsetWidth;
    fl.style.transition=""; fl.style.transform=flyAt(0);
  }else{
    if(!fl.classList.contains("on") || !flyGeo) return;
    fl.style.transition=""; fl.style.transform=flyAt(1);
    flyTimer=setTimeout(()=>{ real.style.visibility=""; fl.classList.remove("on"); }, 620);
  }
}
// 시트를 끌어내리는 동안 로고도 손가락을 따라 내려온다
function flyDrag(p){ const fl=$("flyLogo"); if(!flyGeo || !fl.classList.contains("on")) return; fl.style.transition = p===null ? "" : "none"; fl.style.transform = flyAt(p===null ? 0 : p); }
$("open").onclick=()=>openSheet();
{
  const sheet = $("sheet"), scrim = $("scrim");
  let drag = null;
  const start = e=>{
    if(e.target.closest("button, a, input, label")) return;
    drag = {y:e.clientY, t:performance.now(), dy:0};
    sheet.style.transition = "none"; scrim.style.transition = "none";
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = e=>{
    if(!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    sheet.style.transform = `translateY(${drag.dy}px)`;
    scrim.style.opacity = String(Math.max(0, 1 - drag.dy / sheet.offsetHeight));
    flyDrag(Math.min(1, drag.dy / sheet.offsetHeight));
  };
  const end = ()=>{
    if(!drag) return;
    const fast = drag.dy / Math.max(1, performance.now()-drag.t) > .5;
    const close = drag.dy > 110 || (fast && drag.dy > 30);
    drag = null;
    sheet.style.transition = ""; scrim.style.transition = "";
    sheet.style.transform = ""; scrim.style.opacity = "";
    if(close) closeSheet(); else flyDrag(null);
  };
  for(const el of [sheet.querySelector(".grab"), sheet.querySelector(".bar")]){
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
} $("close").onclick=closeSheet; $("scrim").onclick=closeSheet;
// 화면 전환: 앞으로 가면 새 화면이 오른쪽에서 밀려 들어오고, 뒤로 가면 왼쪽에서 (iOS 방식)
let sliding = false;
function slide(dir, render){
  const sc = $("scroll"), sheet = $("sheet"), bar = sheet.querySelector(".bar");
  if(sliding || matchMedia("(prefers-reduced-motion: reduce)").matches){ render(); return; }
  sliding = true;
  const scrollY = sc.scrollTop;
  // 지금 화면을 본뜬 그림자 화면을 얹고, 진짜 화면에는 새 내용을 그린다
  const ghost = sc.cloneNode(true);
  ghost.removeAttribute("id"); ghost.querySelectorAll("[id]").forEach(e=>e.removeAttribute("id"));
  ghost.className = "scroll ghost";
  ghost.style.top = sc.offsetTop+"px";
  sheet.appendChild(ghost);
  ghost.scrollTop = scrollY;
  // 상단바 왼쪽 글자(설정 / ‹ 내역): 나가는 글자를 본떠 두고 밀면서 사라지게
  const leftOld = [$("gear"), $("back")].find(b=>!b.hidden);
  const rOld = leftOld.getBoundingClientRect(), rBar = bar.getBoundingClientRect();
  const oldLabel = leftOld.cloneNode(true);
  oldLabel.removeAttribute("id"); oldLabel.hidden = false;
  oldLabel.style.cssText = `position:absolute;left:${rOld.left-rBar.left}px;top:${rOld.top-rBar.top}px;margin:0;pointer-events:none`;
  bar.appendChild(oldLabel);
  render();
  const leftNew = [$("gear"), $("back")].find(b=>!b.hidden);
  // 위로 덮는 화면에 불투명 바탕과 왼쪽 그림자 (앞으로: 새 화면이 위, 뒤로: 나가는 화면이 위)
  const top = dir>0 ? sc : ghost, under = dir>0 ? ghost : sc;
  sc.style.position = "relative";
  top.style.zIndex = "2"; under.style.zIndex = "1";
  top.style.background = "var(--sheet-solid)"; top.style.boxShadow = "-10px 0 30px rgba(0,0,0,.08)";
  top.style.clipPath = "inset(0 0 0 -40px)"; // 그림자는 왼쪽 가장자리에만
  // 위쪽 가장자리를 부드럽게 흐려서 상단바와 경계선이 생기지 않게
  top.style.webkitMaskImage = top.style.maskImage = "linear-gradient(to bottom, transparent 0, #000 10px)";
  const ease = "transform .42s cubic-bezier(.32,.72,0,1), opacity .42s";
  const shift = 22;
  sc.style.transition = "none"; sc.style.transform = `translateX(${dir>0 ? 100 : -22}%)`;
  ghost.style.transition = "none"; ghost.style.transform = "translateX(0)";
  leftNew.style.transition = "none"; leftNew.style.transform = `translateX(${dir*shift}px)`; leftNew.style.opacity = "0";
  sc.offsetWidth; // 시작 위치를 먼저 그리게
  for(const el of [sc, ghost, leftNew]) el.style.transition = ease;
  oldLabel.style.transition = "transform .3s cubic-bezier(.32,.72,0,1), opacity .16s"; // 나가는 글자는 빨리 사라지게
  leftNew.style.transition = "transform .42s cubic-bezier(.32,.72,0,1), opacity .26s .1s"; // 들어오는 글자는 살짝 늦게
  sc.style.transform = "translateX(0)";
  ghost.style.transform = `translateX(${dir>0 ? -22 : 100}%)`; ghost.style.opacity = dir>0 ? ".6" : "1";
  leftNew.style.transform = "translateX(0)"; leftNew.style.opacity = "1";
  oldLabel.style.transform = `translateX(${-dir*shift}px)`; oldLabel.style.opacity = "0";
  const done = ()=>{
    ghost.remove(); oldLabel.remove();
    for(const k of ["transition","transform","position","zIndex","background","boxShadow","clipPath","maskImage","webkitMaskImage"]) sc.style[k] = "";
    for(const k of ["transition","transform","opacity"]) leftNew.style[k] = "";
    sliding = false;
  };
  setTimeout(done, 440);
}
$("gear").onclick=()=>slide(1, ()=>{ view="settings"; renderSheet(); });
$("back").onclick=()=>slide(-1, ()=>{ const fromFilter = view==="filter"; view="list"; filter=null; renderSheet(); if(fromFilter) $("scroll").scrollTop = listScroll; });
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ if(asOpen()) closeAS(); else if(sheetOpen) closeSheet(); } });

function sumBy(list, key){
  const o={}; list.forEach(i=>{ const k=key(i); o[k]=(o[k]||0)+i.a; });
  return Object.entries(o).sort((a,b)=>b[1]-a[1]);
}
function dayGroups(list){
  let h = "";
  const days={}; list.forEach(i=>(days[i.d] ||= []).push(i));
  Object.keys(days).sort().reverse().forEach(d=>{
    const net=days[d].reduce((s,i)=>s+(i.t==="in"?i.a:-i.a),0);
    h += `<div class="cap"><span>${dayLabel(d)}</span><span class="num">${net>0?"+":""}${won(net)}원</span></div><div class="group">`+
      days[d].map(i=>{ const mn=methodName(i);
        return `<button class="cell" data-id="${i.id}"><span class="cdot" style="background:${color(i.c)}"></span><span class="t"><span>${esc(i.m)}</span><small>${esc(i.c)}${mn?" · "+esc(mn):""}${i.rec?" · 정기":""}</small></span><span class="r num ${i.t}">${i.t==="in"?"+":"-"}${won(i.a)}원</span></button>`; }).join("")+`</div>`;
  });
  return h;
}
const CAL_ICON = `<svg class="pi" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.8h17M8.2 3v3.6M15.8 3v3.6"/><path d="M7.6 13.4h.01M12 13.4h.01M16.4 13.4h.01M7.6 17h.01M12 17h.01"/></svg>`;
// 달력: 날짜 아래에 그날 쓴 금액, 날짜를 누르면 그날 내역만 아래에
const shortWon = v=>v>=10000 ? (v/10000).toFixed(v%10000?1:0).replace(/\.0$/,"")+"만" : v>=1000 ? (v/1000).toFixed(v%1000?1:0).replace(/\.0$/,"")+"천" : String(v);
function calendar(ym, list){
  const [y,m] = ym.split("-").map(Number), first = new Date(y,m-1,1).getDay(), dim = daysIn(ym);
  const byDay = {}; list.forEach(i=>{ const d=+i.d.slice(8); (byDay[d] ||= {out:0,inc:0,items:[]}); byDay[d].items.push(i); if(i.t==="in") byDay[d].inc+=i.a; else byDay[d].out+=i.a; });
  const isNow = ym===THIS_YM, td = today.getDate();
  // 고른 날이 없으면: 이번 달은 오늘, 지난 달은 마지막으로 기록한 날
  if(!selDay || selDay.slice(0,7)!==ym){
    const lastDay = Object.keys(byDay).map(Number).sort((a,b)=>b-a)[0];
    selDay = `${ym}-${pad(isNow ? td : (lastDay||1))}`;
  }
  const sd = +selDay.slice(8);
  let h = `<div class="group cal"><div class="cal-wk">${WD.map(w=>`<span>${w}</span>`).join("")}</div><div class="cal-grid">`;
  for(let i=0;i<first;i++) h += `<span></span>`;
  for(let d=1; d<=dim; d++){
    const b = byDay[d], future = isNow && d>td;
    const amt = b ? (b.out ? "-"+shortWon(b.out) : "+"+shortWon(b.inc)) : "";
    h += `<button class="cal-d${isNow&&d===td?" today":""}${future?" future":""}${d===sd?" sel":""}" data-day="${ym}-${pad(d)}"${future?" disabled":""}><span class="n">${d}</span><span class="m${b&&!b.out?" in":""}">${amt}</span></button>`;
  }
  h += `</div></div>`;
  const dayItems = byDay[sd]?.items || [];
  h += dayItems.length ? dayGroups(dayItems) : `<div class="cap"><span>${dayLabel(selDay)}</span></div><div class="cal-empty">기록이 없어요</div>`;
  return h;
}
// 분석에서 카테고리·결제수단을 누르면 그 내역만 모아 보기
let filter = null, listScroll = 0;
function renderFilter(){
  const [, m] = S.view.split("-");
  const match = filter.kind==="c" ? (i=>i.c===filter.value) : (i=>(methodName(i)||"미지정")===filter.value);
  const list = items(S.view).filter(match);
  const out = list.filter(i=>i.t==="out").reduce((s,i)=>s+i.a,0);
  const dot = filter.kind==="c" ? `<span class="cdot" style="background:${color(filter.value)};width:14px;height:14px"></span>` : "";
  let h = `<div class="title-row"><h1 style="display:flex;align-items:center;gap:10px">${dot}${esc(filter.value)}</h1></div>`;
  h += `<div class="sum"><span class="k">${+m}월 · ${list.length}건</span><span class="v num">${won(out)}원</span></div>`;
  h += list.length ? dayGroups(list) : `<div class="empty">내역이 없어요.</div>`;
  $("scroll").innerHTML = h;
  $("scroll").scrollTop = 0;
}
function renderSheet(){
  $("gear").hidden = view!=="list"; $("back").hidden = view==="list";
  if(view==="settings") return renderSettings();
  if(view==="filter") return renderFilter();
  const ym=S.view, list=items(ym), [y,m]=ym.split("-");
  const outs = list.filter(i=>i.t==="out");
  const out = outs.reduce((s,i)=>s+i.a,0);
  const inc = list.filter(i=>i.t==="in").reduce((s,i)=>s+i.a,0);
  const left = S.budget-out, isNow = ym===THIS_YM, dim=daysIn(ym);
  const perDay = isNow ? Math.max(0,left)/(dim-today.getDate()+1) : out/dim;
  const pct = S.budget ? Math.min(100,out/S.budget*100) : 0;

  let h = `<div class="title-row"><h1>${+m}월${y!=String(today.getFullYear())?` <span style="color:var(--label2);font-weight:600;font-size:22px">${y}</span>`:""}</h1><div class="mnav" id="mnav"><button id="prev" aria-label="이전 달"><svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><path d="M7.5 2 1.5 8l6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button id="next" aria-label="다음 달"><svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><path d="M2.5 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>`;
  // 크게: 이 달에 쓴 돈 / 작게: 남은 예산·하루 쓸 수 있는 돈
  // 크게: 쓴 돈 / 예산, 아래 한 줄: 남은 예산 · 하루
  h += `<div class="sum"><span class="v num">${won(out)}원<small class="of"> / ${won(S.budget)}원</small></span>
    <div class="meter"><i class="${out>S.budget?"over":""}" style="width:${pct}%"></i></div>
    <div class="row"><span>${left>=0?`남은 예산 <b class="num">${won(left)}원</b>`:`<b class="num" style="color:var(--red)">${won(-left)}원 초과</b>`}</span>
    <span>${isNow?"하루":"하루 평균"} <b class="num">${won(perDay)}원</b></span></div></div>`;

  if(!list.length){ h += `<div class="empty">${+m}월에는 기록이 없어요.</div>`; }
  else{
    const cats=sumBy(outs, i=>i.c);
    h += `<h2 class="sec">분석</h2><div class="cap"><span>카테고리</span><span class="num">${inc?"수입 +"+won(inc)+"원":""}</span></div><div class="group">`+
      (cats.length?cats.map(([c,v])=>`<button class="cell" data-fc="${esc(c)}"><span class="cdot" style="background:${color(c)}"></span><span class="t"><span>${esc(c)}</span></span><span class="r num">${won(v)}원 · ${Math.round(v/out*100)}% ${CHEV}</span></button>`).join("")
        :`<div class="cell"><span class="t"><small>지출이 없어요</small></span></div>`)+`</div>`;
    const pays=sumBy(outs, i=>methodName(i)||"미지정");
    if(pays.length){
      h += `<div class="cap"><span>결제수단</span></div><div class="group">`+
        pays.map(([n,v])=>`<button class="cell" data-fp="${esc(n)}">${payTile(kindOf(methodByName(n)||{name:n}), methodByName(n)?.id===S.def)}<span class="t"><span>${esc(n)}</span></span><span class="r num">${won(v)}원 · ${Math.round(v/out*100)}% ${CHEV}</span></button>`).join("")+`</div>`;
    }
    // 내역: 목록 / 달력
    h += `<div class="sec-row"><h2 class="sec">내역</h2><button class="txm${txMode==="cal"?" on":""}" data-txm="${txMode==="cal"?"list":"cal"}" aria-label="${txMode==="cal"?"목록으로 보기":"달력으로 보기"}" aria-pressed="${txMode==="cal"}">${CAL_ICON}</button></div>`;
    if(txMode==="cal") h += calendar(ym, list);
    else {
      h += `<div class="group"><button class="cell toggle" id="txToggle" aria-expanded="${txOpen}"><span class="t"><span>내역 ${list.length}건</span><small></small></span><span class="r chev${txOpen?" open":""}">${CHEV}</span></button></div>`;
      if(txOpen) h += dayGroups(list);
    }
  }
  $("scroll").innerHTML = h;
  // 목록/달력 전환, 달력에서 날짜 고르기
  $("scroll").querySelectorAll("[data-txm]").forEach(b=>b.onclick=()=>{ txMode=b.dataset.txm; const y=$("scroll").scrollTop; renderSheet(); $("scroll").scrollTop=y; });
  $("scroll").querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>{ selDay=b.dataset.day; const y=$("scroll").scrollTop; renderSheet(); $("scroll").scrollTop=y; });
  const tt = $("txToggle");
  if(tt){
    const last = list[0];
    tt.querySelector("small").textContent = `최근: ${last.m} ${last.t==="in"?"+":"-"}${won(last.a)}원 · ${dayLabel(last.d)}`;
    tt.onclick = ()=>{ txOpen = !txOpen; const y = $("scroll").scrollTop; renderSheet(); $("scroll").scrollTop = y; };
  }
  $("prev").onclick=()=>{ S.view=shiftYm(S.view,-1); selDay=null; renderSheet(); };
  $("next").disabled = ym>=THIS_YM;
  $("next").onclick=()=>{ if(S.view<THIS_YM){ S.view=shiftYm(S.view,1); selDay=null; renderSheet(); } };
}
// 결제수단 아이콘: 종류 4가지(카드·현금·간편결제·계좌), 회색 타일 안의 선 아이콘. 색은 카테고리 전용이라 쓰지 않는다
const PAY_KINDS = [["card","카드"],["cash","현금"],["pay","간편결제"],["bank","계좌"],["point","포인트·상품권"]];
const PAY_PATHS = {
  card:'<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3 9.8h18M6.5 15h3.5"/>',
  cash:'<rect x="2.8" y="6" width="18.4" height="12" rx="2.2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.3 12h.01M17.7 12h.01"/>',
  pay:'<rect x="6.5" y="3" width="11" height="18" rx="2.8"/><path d="M10.5 18h3"/>',
  bank:'<path d="M3.5 9.3 12 4.5l8.5 4.8z"/><path d="M6 11.5v5.5M10 11.5v5.5M14 11.5v5.5M18 11.5v5.5M3.5 19.5h17"/>',
  point:'<circle cx="12" cy="12" r="8.6"/><path d="M10 16.3V7.9h2.7a2.4 2.4 0 0 1 0 4.8H10"/>'
};
// 종류를 정하지 않았으면 이름으로 짐작
const guessKind = name => /현금|cash/i.test(name||"") ? "cash" : /포인트|상품권|기프티|point|gift/i.test(name||"") ? "point" : /페이|pay/i.test(name||"") ? "pay" : /계좌|이체|은행|bank/i.test(name||"") ? "bank" : "card";
const kindOf = m => m?.kind || guessKind(m?.name);
const payGlyph = kind => `<svg class="pi" viewBox="0 0 24 24" aria-hidden="true">${PAY_PATHS[kind]||PAY_PATHS.card}</svg>`;
const payTile = (kind, isDef) => `<span class="ptile${isDef?" def":""}">${payGlyph(kind)}</span>`;
const methodByName = n => S.methods.find(m=>m.name===n);

/* ---------- settings ---------- */
let catsOpen = (()=>{ try{ return localStorage.getItem("moa-cats-open")==="1"; }catch(e){ return false; } })();
function renderSettings(){
  let h = `<h1>설정</h1>`;
  h += `<div class="cap"><span>월 예산</span></div><div class="group"><form class="cell" id="bForm"><span class="t"><input class="inline num" id="bIn" inputmode="numeric" value="${won(S.budget)}" aria-label="월 예산"></span><span class="r">원</span></form></div>`;
  h += `<div class="cap"><span>결제수단</span></div><div class="group">`+
    S.methods.map(m=>`<button class="cell" data-m="${m.id}">${payTile(kindOf(m), m.id===S.def)}<span class="t"><span></span><small></small></span><span class="r">${m.id===S.def?"기본 ":""}${CHEV}</span></button>`).join("")+
    `<button class="cell" data-m="__new"><span class="t"><span style="color:var(--accent)">결제수단 추가</span></span></button></div>`;
  h += `<p class="foot-note">입력에 결제수단 이름이나 별칭이 들어 있으면 그 수단으로 기록해요. 예: "점심 9천 현대카드", "택시 1.2만 토스로". 없으면 기본 수단으로 기록해요.</p>`;
  // 결제 알림 자동 기록 (단축어 연결 안내)
  const native = !!window.Capacitor?.isNativePlatform?.();
  h += `<div class="cap"><span>결제 알림 자동 기록</span></div><div class="group">
    ${[["pay","애플페이"],["sms","카드 문자"]].map(([k,n])=>{ const t=S.links?.[k]; return `<button class="cell" data-guide="${k}"><span class="t"><span>${t?n:n+" 연결하기"}</span><small>${t?`<span class="linked">연결됨</span> · 마지막 기록 ${linkWhen(t)}`:"아직 연결 안 됨"}</small></span><span class="r">${CHEV}</span></button>`; }).join("")}</div>
    <p class="foot-note">${native ? "결제하면 \"기록할까요?\" 알림이 와요. [기록]을 누르면 Mono가 열리며 바로 기록돼요. 카드사 앱 알림은 iOS가 막아 두어서, 스크린샷을 카메라 버튼으로 읽어 주세요." : "아이폰 앱(Mono)에서만 쓸 수 있어요."}</p>`;
  const recTotal = S.recurring.filter(r=>!r.paused).reduce((a,r)=>a+r.amount,0);
  h += `<div class="cap"><span>정기 결제</span><span class="num">${S.recurring.length?"매월 "+won(recTotal)+"원":""}</span></div><div class="group">`+
    S.recurring.slice().sort((a,b)=>a.day-b.day).map(r=>`<button class="cell" data-rec="${esc(r.id)}"><span class="cdot" style="background:${r.paused?"var(--label3)":color(r.cat)}"></span><span class="t"><span></span><small></small></span><span class="r num">${won(r.amount)}원 ${CHEV}</span></button>`).join("")+
    `<button class="cell" data-rec="__new"><span class="t"><span style="color:var(--accent)">정기 결제 추가</span></span></button></div>`;
  h += `<p class="foot-note">매월 결제일이 되면 내역에 자동으로 기록돼요. 앱을 며칠 안 열어도 다음에 열 때 빠짐없이 채워져요.</p>`;
  h += `<div class="cap"><span>카테고리</span></div><div class="group">
    <button class="cell toggle" id="catToggle" aria-expanded="${catsOpen}"><span class="t"><span>카테고리 ${S.cats.length}개</span><small>${esc(S.cats.map(c=>c.name).join(", "))}</small></span><span class="r chev${catsOpen?" open":""}">${CHEV}</span></button>`+
    (catsOpen ? S.cats.map(c=>`<button class="cell" data-cat="${c.id}"><span class="cdot" style="background:${color(c.name)}"></span><span class="t"><span>${esc(c.name)}</span><small>${c.keys.length?esc(c.keys.slice(0,4).join(", "))+(c.keys.length>4?` 외 ${c.keys.length-4}개`:""):"키워드 없음"}</small></span><span class="r">${CHEV}</span></button>`).join("")+
    `<button class="cell" data-cat="__new"><span class="t"><span style="color:var(--accent)">카테고리 추가</span></span></button>` : "")+`</div>`;
  h += `<p class="foot-note">키워드가 들어 있는 입력은 바로 그 카테고리로 들어가요. 키워드에 없는 상호는 Gemini가 이 카테고리 중에서 골라요.</p>`;
  h += `<div class="cap"><span>Gemini</span></div><div class="group"><form class="cell" id="gForm"><span class="t"><input class="inline" id="gKey" type="password" autocomplete="off" spellcheck="false" placeholder="API 키 붙여넣기" aria-label="Gemini API 키"></span><button class="edit" type="submit">저장</button></form></div>
    <p class="foot-note" id="gNote">키는 이 기기 안에만 저장되고 백업 파일에도 들어가지 않아요. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">키 발급받기</a></p>`;
  const CK = `<svg class="ck" width="16" height="13" viewBox="0 0 16 13" aria-hidden="true"><path d="M1.5 7 6 11.2 14.5 1.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  h += `<div class="cap"><span>테마</span></div><div class="group" role="radiogroup" aria-label="테마">`+
    SKINS.map(([k,n])=>`<button class="cell" data-skin="${k}" role="radio" aria-checked="${S.skin===k}"><span class="t"><span>${n}</span></span>${S.skin===k?CK:""}</button>`).join("")+`</div>`;
  h += `<div class="cap"><span>백업</span></div><div class="group">
    <button class="cell" id="exp"><span class="t"><span style="color:var(--accent)">백업 파일 내보내기</span></span></button>
    <label class="cell" for="impFile"><span class="t"><span style="color:var(--accent)">백업 파일에서 가져오기</span></span></label></div>
    <input type="file" id="impFile" accept="application/json,.json" hidden>
    <p class="foot-note">기록은 이 기기 안에만 있어요. 홈 화면 아이콘을 지우면 기록도 지워지니 가끔 내보내기로 백업해 두세요.</p>`;
  $("scroll").innerHTML = h;
  setupGemini(); setupBackup();
  $("scroll").querySelectorAll("[data-skin]").forEach(b=>b.onclick=()=>{ applySkin(b.dataset.skin); saveSettings(); renderSheet(); });
  $("scroll").querySelectorAll("[data-m]").forEach(b=>{
    const m = methodById(b.dataset.m); if(!m) return;
    b.querySelector(".t span").textContent = m.name;
    b.querySelector(".t small").textContent = m.alias.length ? "별칭: "+m.alias.join(", ") : "별칭 없음";
  });
  $("scroll").querySelectorAll("[data-rec]").forEach(b=>{
    const r = S.recurring.find(x=>x.id===b.dataset.rec); if(!r) return;
    b.querySelector(".t span").textContent = r.name;
    const mn = (methodById(r.p)||{}).name;
    b.querySelector(".t small").textContent = `매월 ${r.day}일 · ${r.cat}${mn?" · "+mn:""}${r.paused?" · 일시정지":""}`;
  });
  $("catToggle").onclick=()=>{ catsOpen=!catsOpen; try{ localStorage.setItem("moa-cats-open", catsOpen?"1":""); }catch(e){} renderSettings(); };
  const bIn=$("bIn");
  const commit=()=>{ const v=parseAmount(bIn.value).amount; if(v>0 && v!==S.budget){ S.budget=v; saveSettings(); } bIn.value=won(S.budget); };
  $("bForm").onsubmit=e=>{ e.preventDefault(); commit(); bIn.blur(); };
  bIn.onblur=commit;
}

async function setupGemini(){
  const g = await api("GET","gemini");
  $("gKey").placeholder = g.set ? `저장됨 (${g.hint}) · 바꾸려면 새 키 입력` : "API 키 붙여넣기";
  $("gForm").onsubmit = async e=>{
    e.preventDefault();
    const key = $("gKey").value.trim();
    if(!key && !g.set) return $("gKey").focus();
    await api("PUT","gemini",{key});
    $("gKey").value = "";
    $("ai").textContent = key ? "Gemini가 텍스트를 인식해요" : "Gemini 꺼짐 · 설정에서 키를 넣으면 켜져요";
    flash(key ? "Gemini 키를 저장했어요." : "Gemini 키를 지웠어요.");
    renderSettings();
  };
}
function setupBackup(){
  $("exp").onclick = async ()=>{
    const data = await api("GET","export");
    const name = `mono-backup-${TODAY}.json`;
    // iOS 앱: 임시 폴더에 파일을 쓰고 공유 시트로 넘긴다
    const P = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins;
    if(P && P.Filesystem && P.Share){
      try{
        const w = await P.Filesystem.writeFile({path:name, data:JSON.stringify(data), directory:"CACHE", encoding:"utf8"});
        await P.Share.share({title:name, files:[w.uri]});
      }catch(e){ if(!/cancel/i.test(e?.message||"")) flash("백업 파일을 만들지 못했어요."); }
      return;
    }
    const file = new File([JSON.stringify(data)], name, {type:"application/json"});
    // 웹(아이폰 Safari): 공유 시트로 파일 앱·AirDrop에 저장 / 그 밖: 바로 다운로드
    try{ if(navigator.canShare && navigator.canShare({files:[file]})) return await navigator.share({files:[file], title:name}); }catch(e){ if(e.name==="AbortError") return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  };
  $("impFile").onchange = async e=>{
    const f = e.target.files[0]; if(!f) return;
    try{
      const data = JSON.parse(await f.text());
      const n = (data.items||[]).length;
      showAS(`<div class="g"><div class="h">이 기기의 기록을 백업 파일(${n}건)로 바꿀까요? 지금 기록은 지워져요.</div>
        <button class="btn red" id="impOk">바꾸기</button></div><div class="g"><button class="btn b" id="impNo">취소</button></div>`);
      $("impNo").onclick = closeAS;
      $("impOk").onclick = async ()=>{
        try{ await api("POST","import",data); closeAS(); await load(); renderSheet(); flash(`${n}건을 가져왔어요.`); }
        catch(err){ closeAS(); flash(err.message); }
      };
    }catch(err){ flash("백업 파일을 읽지 못했어요."); }
    e.target.value = "";
  };
}

/* ---------- action sheets ---------- */
const asOpen = () => $("as").classList.contains("on");
// 가운데 팝업: 각 창의 버튼을 '부가 동작(작은 글자)'과 '취소 | 확인' 줄로 정리한다
function showAS(html){
  const as=$("as"); as.innerHTML=html;
  const groups=[...as.querySelectorAll(":scope > .g")];
  const main=groups[0], last=groups.length>1 ? groups[groups.length-1] : null;
  const cancel=last?.querySelector(".btn");
  const btns=[...main.querySelectorAll(":scope > .btn")];
  // 확인 버튼: 폼 안의 submit만 (폼이 아닌 창의 버튼은 기본 type이 submit이라 따로 구분)
  let primary=(main.tagName==="FORM" && btns.find(b=>b.getAttribute("type")==="submit")) || null;
  let others=btns.filter(b=>b!==primary);
  if(!primary && others.length===1 && main.querySelectorAll("input,textarea,.chips").length===0){ primary=others[0]; others=[]; }
  // 삭제(빨간 동작)는 늘 아래 알약 줄 왼쪽에 연한 알약으로: [삭제] [저장]
  const softDanger = others.find(b=>b.classList.contains("red")) || null;
  others = others.filter(b=>b!==softDanger);
  if(others.length){
    const extra=document.createElement("div"); extra.className="pop-extra";
    others.forEach(b=>{ b.className = b.classList.contains("red") ? "red" : ""; extra.appendChild(b); });
    main.appendChild(extra);
  }
  // 닫기/취소는 오른쪽 위 ✕로 (원래 버튼은 숨겨 두고 그 동작을 그대로 씀)
  const x=document.createElement("button"); x.type="button"; x.className="pop-x"; x.setAttribute("aria-label", cancel?.textContent || "닫기");
  x.innerHTML='<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  x.onclick=()=> cancel ? cancel.click() : closeAS();
  main.style.position="relative"; main.appendChild(x);
  if(cancel){ cancel.type="button"; cancel.hidden=true; main.appendChild(cancel); }
  // 아래에는 주요 버튼 하나만 알약으로
  const foot=document.createElement("div"); foot.className="pop-foot";
  if(softDanger){ softDanger.className="danger-soft"; foot.appendChild(softDanger); }
  if(primary){ primary.className="primary"+(primary.classList.contains("red")?" red":""); foot.appendChild(primary); }
  main.appendChild(foot);
  last?.remove();
  $("scrim2").classList.add("on"); as.classList.add("on");
  return as;
}
function closeAS(){ $("as").classList.remove("on"); $("scrim2").classList.remove("on"); }
$("scrim2").onclick=closeAS;
// 시트 안에서 입력칸을 누르면 그 칸이 보이게
$("as").addEventListener("focusin", e=>{ setTimeout(()=>e.target.scrollIntoView({block:"nearest"}), 300); });

$("scroll").addEventListener("click", e=>{
  const t=e.target.closest("[data-id]"); if(t) return openTx(t.dataset.id);
  const fc=e.target.closest("[data-fc]"), fp=e.target.closest("[data-fp]");
  if(fc||fp){ listScroll = $("scroll").scrollTop; filter = fc ? {kind:"c", value:fc.dataset.fc} : {kind:"p", value:fp.dataset.fp}; return slide(1, ()=>{ view="filter"; renderSheet(); }); }
  const m=e.target.closest("[data-m]"); if(m) return openMethod(m.dataset.m);
  const c=e.target.closest("[data-cat]"); if(c) return openCat(c.dataset.cat);
  const r=e.target.closest("[data-rec]"); if(r) return openRec(r.dataset.rec);
  const gd=e.target.closest("[data-guide]"); if(gd) return openGuide(gd.dataset.guide);
});
function openTx(id){
  const [ym,i]=find(id); if(!ym) return; const it=S.months[ym][i];
  const as = showAS(`<div class="g"><div class="h"></div>
    <div class="sub">카테고리</div><div class="chips">${allCats().map(c=>`<button data-c="${esc(c)}" class="${c===it.c?"sel":""}"><i style="background:${c===it.c?"#fff":color(c)}"></i>${esc(c)}</button>`).join("")}</div>
    <div class="sub">결제수단</div><div class="chips">${S.methods.map(m=>`<button data-p="${m.id}" class="${m.id===it.p?"sel":""}"></button>`).join("")}</div>
    <button class="btn red" id="asDel">삭제</button></div><div class="g"><button class="btn b" id="asCancel">닫기</button></div>`);
  as.querySelector(".h").textContent = `${it.m} · ${won(it.a)}원 · ${dayLabel(it.d)}`;
  as.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{ update(id,{c:b.dataset.c,t:b.dataset.c===INCOME?"in":"out"},true); closeAS(); });
  as.querySelectorAll("[data-p]").forEach(b=>{ const m=methodById(b.dataset.p); b.textContent=m.name; b.onclick=()=>{ update(id,{p:m.id,pn:m.name}); closeAS(); }; });
  $("asDel").onclick=()=>{ remove(id); closeAS(); };
  $("asCancel").onclick=closeAS;
}
function openMethod(mid){
  const isNew = mid==="__new";
  const m = isNew ? {id:uid(),name:"",alias:[]} : methodById(mid);
  const as = showAS(`<form class="g" id="mForm"><div class="h">${isNew?"결제수단 추가":"결제수단 편집"}</div>
    <div class="fields"><input id="mName" placeholder="이름 (예: 현대카드)" aria-label="이름"><input id="mAlias" placeholder="별칭, 쉼표로 구분 (예: 현대, 더블레드)" aria-label="별칭"></div>
    <div class="kinds" role="radiogroup" aria-label="종류">${PAY_KINDS.map(([k,l])=>`<button type="button" role="radio" data-kind="${k}" aria-label="${l}" title="${l}">${payGlyph(k)}</button>`).join("")}</div>
    <label class="sw-row" for="mDefSw"><span>기본 결제수단</span><input type="checkbox" id="mDefSw" role="switch"><span class="tg"></span></label>
    <button class="btn b" type="submit">저장</button>
    ${!isNew && S.methods.length>1?`<button class="btn red" type="button" id="mDel">삭제</button>`:""}
  </form><div class="g"><button class="btn b" id="mCancel" type="button">취소</button></div>`);
  $("mName").value=m.name; $("mAlias").value=m.alias.join(", ");
  const defSw=$("mDefSw"); defSw.checked = !isNew && m.id===S.def;
  if(S.methods.length<=1 && !isNew) defSw.disabled = true; // 하나뿐이면 늘 기본
  // 종류: 직접 고르기 전까지는 이름으로 짐작해서 표시
  let kind = m.kind || (isNew ? "card" : guessKind(m.name)), kindPicked = !!m.kind;
  const paintKind = ()=>as.querySelectorAll("[data-kind]").forEach(b=>{ b.classList.toggle("sel", b.dataset.kind===kind); b.setAttribute("aria-checked", b.dataset.kind===kind); });
  as.querySelectorAll("[data-kind]").forEach(b=>b.onclick=()=>{ kind=b.dataset.kind; kindPicked=true; paintKind(); });
  $("mName").addEventListener("input", ()=>{ if(!kindPicked){ kind=guessKind($("mName").value); paintKind(); } });
  paintKind();
  setTimeout(()=>$("mName").focus(), 50);
  $("mForm").onsubmit=e=>{
    e.preventDefault();
    const name=$("mName").value.trim(); if(!name){ $("mName").focus(); return; }
    m.name=name; m.alias=$("mAlias").value.split(",").map(s=>s.trim()).filter(Boolean); m.kind=kind;
    if(isNew) S.methods.push(m);
    // 스위치: 켜면 기본으로, 기본이던 걸 끄면 다른 첫 수단이 기본
    if(defSw.checked) S.def=m.id;
    else if(S.def===m.id) S.def=(S.methods.find(v=>v.id!==m.id)||m).id;
    saveSettings(); closeAS(); renderSheet();
  };
  const x=$("mDel"); if(x) x.onclick=()=>{ S.methods=S.methods.filter(v=>v.id!==m.id); if(S.def===m.id) S.def=S.methods[0].id; saveSettings(); closeAS(); renderSheet(); };
  $("mCancel").onclick=closeAS;
}

function openCat(cid){
  const isNew = cid==="__new";
  const c = isNew ? {id:uid(),name:"",color:COLORS.find(k=>!S.cats.some(x=>x.color===k))||"royal",keys:[]} : S.cats.find(x=>x.id===cid);
  if(!c) return;
  const used = items().filter(i=>i.c===c.name).length;
  let pick = c.color;
  const as = showAS(`<form class="g" id="cForm"><div class="h">${isNew?"카테고리 추가":"카테고리 편집"}</div>
    <div class="fields"><input id="cName" placeholder="이름 (예: 반려동물)" aria-label="이름" maxlength="10">
    <textarea id="cKeys" placeholder="키워드, 쉼표로 구분 (예: 사료, 동물병원, 간식)" aria-label="키워드"></textarea></div>
    <div class="swatches">${COLORS.map(k=>`<button type="button" data-col="${k}" aria-label="${COLOR_NAMES[k]||k}" class="${k===pick?"sel":""}" style="background:var(--k-${k})"></button>`).join("")}<label id="cSpec" aria-label="직접 고르기"><i></i><input type="color" id="cCustom"></label></div>
    <button class="btn b" type="submit">저장</button>
    ${!isNew && c.name!==FALLBACK?`<button class="btn red" type="button" id="cDel">삭제</button>`:""}
  </form><div class="g"><button class="btn b" id="cCancel" type="button">취소</button></div>`);
  $("cName").value=c.name; $("cKeys").value=c.keys.join(", ");
  if(c.name===FALLBACK) $("cName").disabled=true;
  // 직접 고른 색: 스펙트럼 칸 가운데가 그 색으로 채워진다
  const spec=$("cSpec"), custom=$("cCustom");
  const paintSel=()=>{
    as.querySelectorAll("[data-col]").forEach(x=>x.classList.toggle("sel", x.dataset.col===pick));
    const isCustom=/^#/.test(pick); spec.classList.toggle("sel", isCustom);
    spec.querySelector("i").style.background = isCustom ? pick : "";
  };
  if(/^#/.test(pick)) custom.value=pick;
  as.querySelectorAll("[data-col]").forEach(b=>b.onclick=()=>{ pick=b.dataset.col; paintSel(); });
  custom.addEventListener("input", ()=>{ pick=custom.value.toUpperCase(); paintSel(); });
  paintSel();
  setTimeout(()=>(isNew?$("cName"):$("cKeys")).focus(), 50);
  $("cForm").onsubmit=async e=>{
    e.preventDefault();
    const name=$("cName").value.trim();
    if(!name){ $("cName").focus(); return; }
    if(name===INCOME || S.cats.some(x=>x!==c && x.name===name)){ $("cName").setCustomValidity("이미 있는 이름이에요."); $("cName").reportValidity(); $("cName").oninput=()=>$("cName").setCustomValidity(""); return; }
    const old=c.name;
    c.name=name; c.color=pick; c.keys=$("cKeys").value.split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
    if(isNew) S.cats.splice(Math.max(0,S.cats.findIndex(x=>x.name===FALLBACK)),0,c);
    await saveSettings();
    if(!isNew && old!==name) await renameCat(old,name);
    closeAS(); renderSheet();
  };
  const del=$("cDel"); if(del) del.onclick=async()=>{
    S.cats=S.cats.filter(x=>x!==c);
    await saveSettings(); await renameCat(c.name,FALLBACK);
    closeAS(); renderSheet();
  };
  $("cCancel").onclick=closeAS;
}
function openRec(rid){
  const isNew = rid==="__new";
  const r = isNew ? {id:uid(), name:"", amount:0, day:today.getDate(), cat:null, p:S.def, paused:false} : S.recurring.find(x=>x.id===rid);
  if(!r) return;
  let cat = r.cat, pay = r.p;
  const as = showAS(`<form class="g" id="rForm"><div class="h">${isNew?"정기 결제 추가":"정기 결제 편집"}</div>
    <div class="fields">
      <input id="rName" placeholder="이름 (예: 넷플릭스)" aria-label="이름" maxlength="30">
      <input id="rAmt" class="num" inputmode="numeric" placeholder="금액 (예: 17,000)" aria-label="금액">
      <label class="day-row">매월 <input id="rDay" class="num" type="number" min="1" max="31" inputmode="numeric" aria-label="결제일"> 일</label>
    </div>
    <div class="sub">카테고리</div><div class="chips" id="rCats">${S.cats.map(c=>`<button type="button" data-rc="${esc(c.name)}"><i style="background:${color(c.name)}"></i>${esc(c.name)}</button>`).join("")}</div>
    <div class="sub">결제수단</div><div class="chips" id="rPays">${S.methods.map(m=>`<button type="button" data-rp="${esc(m.id)}"></button>`).join("")}</div>
    <div class="hint-line" id="rHint"></div>
    <label class="sw-row" for="rOnSw"><span>자동 기록</span><input type="checkbox" id="rOnSw" role="switch"><span class="tg"></span></label>
    <button class="btn b" type="submit">저장</button>
    ${!isNew?`<button class="btn red" type="button" id="rDel">삭제</button>`:""}
  </form><div class="g"><button class="btn b" id="rCancel" type="button">취소</button></div>`);
  $("rName").value=r.name; $("rAmt").value=r.amount?won(r.amount):""; $("rDay").value=r.day;
  $("rOnSw").checked = !r.paused;
  as.querySelectorAll("[data-rp]").forEach(b=>b.textContent=methodById(b.dataset.rp).name);
  const paint=()=>{
    as.querySelectorAll("[data-rc]").forEach(b=>{ const on=b.dataset.rc===cat; b.classList.toggle("sel",on); b.querySelector("i").style.background=on?"#fff":color(b.dataset.rc); });
    as.querySelectorAll("[data-rp]").forEach(b=>b.classList.toggle("sel",b.dataset.rp===pay));
    const d=+$("rDay").value;
    $("rHint").textContent = isNew && d ? (d<=today.getDate() ? `이번 달 ${d}일 분은 저장하면 바로 기록돼요.` : `이번 달 ${d}일부터 기록돼요.`) : "";
  };
  // 이름을 적으면 분류를 짐작해 미리 골라 둔다 (직접 고르면 그대로)
  let catPicked = !!r.cat;
  $("rName").oninput=()=>{ if(!catPicked){ cat = localCat($("rName").value,"out") || cat; paint(); } };
  $("rDay").oninput=paint;
  as.querySelectorAll("[data-rc]").forEach(b=>b.onclick=()=>{ cat=b.dataset.rc; catPicked=true; paint(); });
  as.querySelectorAll("[data-rp]").forEach(b=>b.onclick=()=>{ pay=b.dataset.rp; paint(); });
  paint();
  setTimeout(()=>$("rName").focus(), 50);
  $("rForm").onsubmit=async e=>{
    e.preventDefault();
    const name=$("rName").value.trim(), amount=parseAmount($("rAmt").value).amount, day=Math.round(+$("rDay").value);
    if(!name) return $("rName").focus();
    if(!(amount>0)) return $("rAmt").focus();
    if(!(day>=1 && day<=31)) return $("rDay").focus();
    Object.assign(r,{name,amount,day,cat:cat||FALLBACK,p:pay,paused:!$("rOnSw").checked});
    if(isNew) S.recurring.push(r);
    await saveSettings(); await load();
    closeAS(); renderSheet();
  };
  const del=$("rDel"); if(del) del.onclick=async()=>{ S.recurring=S.recurring.filter(x=>x!==r); await saveSettings(); closeAS(); renderSheet(); };
  $("rCancel").onclick=closeAS;
}
// 단축어 자동화 설정 안내
function linkWhen(t){
  const d=new Date(t), p=n=>String(n).padStart(2,"0"), hm=`${p(d.getHours())}:${p(d.getMinutes())}`;
  const ds=ymd(d), td=ymd(new Date());
  return ds===td ? `오늘 ${hm}` : `${d.getMonth()+1}/${d.getDate()} ${hm}`;
}
// 단축어 연결 안내: 한 번에 한 단계, 실제 화면을 닮은 그림 위에 누를 곳 표시
const GS = {
  bar:(t,right="")=>`<div class="gs-bar"><span>${t}</span>${right}</div>`,
  row:(ic,t,hl,extra="")=>`<div class="gs-row${hl?" hl":""}"><span class="gs-ic">${ic}</span><span>${t}</span>${extra}</div>`,
  tabs:()=>`<div class="gs-tabs"><span>단축어</span><span class="on hl">자동화</span><span>갤러리</span></div>`,
};
const tile = c=>`<i class="gs-tile" style="background:${c}"></i>`; // 단축어 앱의 색 아이콘 자리
const GI = { clock:tile("#5E5CE6"), alarm:tile("#FF9F0A"), mail:tile("#0A84FF"), msg:tile("#30D158"), wallet:tile("#1C1C1E"), mono:`<b class="gs-mono">m</b>` };
function guideSteps(kind){
  const pay = kind==="pay";
  return [
    { t:"단축어 앱에서 '자동화' → ＋", d:"아래 가운데 '자동화' 탭을 누르고, 오른쪽 위 ＋를 눌러 새 자동화를 만들어요.",
      s:GS.bar("자동화",`<span class="gs-plus hl">＋</span>`)+`<div class="gs-empty">개인용 자동화</div>`+GS.tabs() },
    { t: pay?"'월렛'을 고르세요":"'메시지'를 고르세요", d: pay?"목록을 조금 내리면 있어요.":"목록 위쪽에 있어요.",
      s:GS.bar("새로운 자동화")+GS.row(GI.clock,"특정 시간",false)+GS.row(GI.alarm,"알람",false)+GS.row(GI.mail,"이메일",false)+GS.row(GI.msg,"메시지",!pay)+GS.row(GI.wallet,"월렛",pay) },
    pay ? { t:"카드 고르고 '즉시 실행'", d:"연결할 카드를 고른 뒤 '즉시 실행'을 선택하고 오른쪽 위 '다음'.",
      s:GS.bar("월렛",`<span class="gs-next hl">다음</span>`)+GS.row(GI.wallet,"카드 또는 패스",false,`<em>모두</em>`)+GS.row("","확인 후 실행",false)+GS.row("","즉시 실행",true,`<em class="ck">✓</em>`) }
        : { t:"'승인'이 들어간 문자 + '즉시 실행'", d:"'메시지에 포함'에 승인을 넣고, '즉시 실행'을 선택한 뒤 오른쪽 위 '다음'.",
      s:GS.bar("메시지",`<span class="gs-next hl">다음</span>`)+GS.row("","메시지에 포함",true,`<em>승인</em>`)+GS.row("","확인 후 실행",false)+GS.row("","즉시 실행",true,`<em class="ck">✓</em>`) },
    { t:"'Mono' 검색해서 추가", d:"'새로운 빈 자동화'를 누르고, 동작 검색에 Mono를 입력해 'Mono에 결제 보내기'를 눌러요.",
      s:GS.bar("새로운 빈 자동화")+`<div class="gs-search">⌕ Mono</div>`+GS.row(GI.mono,"Mono에 결제 보내기",true) },
    { t:"확인하고 '완료'", d: pay ? "'단축어 입력'이 자동으로 들어가 있으면 바로 '완료'. 비어 있으면 눌러서 가맹점·금액·카드를 넣어 주세요." : "'단축어 입력'이 자동으로 들어가 있으면 바로 '완료'. 비어 있으면 눌러서 '단축어 입력'을 골라 주세요.",
      s:GS.bar("",`<span class="gs-next hl">완료</span>`)+GS.row(pay?GI.wallet:GI.msg, pay?"월렛 거래가 있을 때":"'승인' 문자가 올 때",false,`<em>즉시 실행</em>`)+`<div class="gs-act">${GI.mono}<span><i class="gs-tok">단축어 입력</i>을 Mono로 보내기</span></div>` },
  ];
}
function openGuide(kind){
  const steps = guideSteps(kind);
  let i = 0, away = false;
  const as = showAS(`<div class="g gd"><div class="h">${kind==="pay"?"애플페이 연결하기":"카드 문자 연결하기"}</div><div id="gdBody"></div></div><div class="g"><button class="btn b" id="gClose">닫기</button></div>`);
  const draw = (dir=0)=>{
    const st = steps[i], last = i===steps.length-1;
    $("gdBody").innerHTML = `<div class="gd-dots">${steps.map((_,k)=>`<i class="${k<=i?"on":""}"></i>`).join("")}</div>
      <div class="gd-step${dir?` in${dir>0?"R":"L"}`:""}"><div class="gs">${st.s}</div><div class="gd-t">${i+1}. ${st.t}</div><div class="gd-d">${st.d}</div></div>
      <div class="pop-foot">${i?`<button type="button" id="gdPrev">이전</button>`:""}<button type="button" class="primary" id="gdNext">${last?"완료":"다음"}</button></div>
      <button type="button" class="gd-open" id="gdOpen">단축어 앱 열기 ↗</button>`;
    $("gdNext").onclick = ()=>{ if(last) return closeAS(); i++; draw(1); };
    const pv=$("gdPrev"); if(pv) pv.onclick = ()=>{ i--; draw(-1); };
    $("gdOpen").onclick = ()=>{ away = true; location.href = "shortcuts://"; };
  };
  draw();
  // 단축어 앱에 다녀오면 다음 단계로
  const back = ()=>{ if(document.visibilityState!=="visible" || !away) return; away=false; if(!as.classList.contains("on")) return document.removeEventListener("visibilitychange", back); if(i<steps.length-1){ i++; draw(1); } };
  document.addEventListener("visibilitychange", back);
  $("gClose").onclick = ()=>{ document.removeEventListener("visibilitychange", back); closeAS(); };
}
// 분류 이름이 바뀌거나 지워지면 내역과 기억해 둔 상호도 함께 옮긴다
async function renameCat(from,to){
  Object.values(S.months).flat().forEach(i=>{ if(i.c===from) i.c=to; });
  S.recurring.forEach(r=>{ if(r.cat===from) r.cat=to; });
  await api("POST","categories/rename",{from,to}).catch(fail);
  renderHome();
}

// 첫 화면 높이는 키보드가 없을 때 높이로 고정: 키보드가 떠서 화면이 줄어도 로고와 입력창이 움직이지 않게
let homeH = window.innerHeight;
const setHomeH = ()=>document.documentElement.style.setProperty("--homeH", homeH+"px");
setHomeH();
// 아래 안전 영역(홈 인디케이터) 높이도 처음 값으로 고정
{ const probe = document.createElement("div"); probe.style.cssText = "position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe); document.documentElement.style.setProperty("--sab", probe.offsetHeight+"px"); probe.remove(); }
window.addEventListener("resize", ()=>{ if(window.innerHeight > homeH){ homeH = window.innerHeight; setHomeH(); } });
window.addEventListener("orientationchange", ()=>setTimeout(()=>{ homeH = window.innerHeight; setHomeH(); }, 400));
boot().then(()=>{ appReady = true; });
runSplash();

const setKb = kb=>{
  // 키보드 높이: '내역 보기', 아래에서 올라오는 시트, 설정 목록을 그만큼 위로
  document.documentElement.style.setProperty("--kb", kb+"px");
  document.documentElement.classList.toggle("kb-open", kb > 80);
};
// iOS 앱: 키보드가 화면 위에 그냥 겹쳐 뜨게 하고(뒤에 바탕이 깔리지 않게), 높이는 플러그인이 알려 준다
const KB = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Keyboard;
if(KB){
  KB.setScroll?.({isDisabled:true}).catch?.(()=>{});
  KB.addListener("keyboardWillShow", info=>setKb(info.keyboardHeight||0));
  KB.addListener("keyboardWillHide", ()=>setKb(0));
}
// 웹: 키보드 높이는 visualViewport로
const pinLogo = ()=>{
  if(KB) return;
  const vv = window.visualViewport;
  setKb(vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0);
};
window.addEventListener("resize", pinLogo);
window.visualViewport?.addEventListener("resize", pinLogo);
window.visualViewport?.addEventListener("scroll", pinLogo);
// 첫 화면이 통째로 밀려 올라가지 않게
window.addEventListener("scroll", ()=>{ if(window.scrollY) window.scrollTo(0,0); });

// iOS 앱 안에서는 파일이 이미 앱에 들어 있어서 서비스 워커가 필요 없다
if("serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.() && (location.protocol==="https:" || location.hostname==="localhost")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
