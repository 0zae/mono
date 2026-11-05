// Mono 화면 로직
/* ---------- vocabulary ---------- */
// 분류는 설정에서 바꿀 수 있다. 서버에서 받아 오기 전까지 쓰는 기본값.
import { localApi, COLORS, DEFAULT_CATS } from "./local.js";
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
const color = n => n===INCOME ? "var(--k-teal)" : `var(--k-${(catByName(n)||{}).color||"gray"})`;
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
  // 등록 안 된 카드·간편결제 이름: 상호로 착각하지 않게 떼어 두고 이름만 남긴다
  const other = text.match(new RegExp("(^|\\s)([^\\s\\d]{1,10}?(?:카드|페이|pay))"+PAY_TAIL+"(?=\\s|$)","i"));
  if(other) return {method:{id:null,name:other[2]}, rest:cut(text,other), unregistered:true};
  return {method:methodById(S.def)||S.methods[0]||null, rest:text, fallback:true};
}
// 이름이나 별칭으로 등록된 결제수단 찾기
function matchMethod(name){
  const n = String(name||"").toLowerCase().replace(/\s/g,"");
  if(!n) return null;
  return S.methods.find(m=>[m.name,...m.alias].some(k=>{ k=k.toLowerCase().replace(/\s/g,""); return k && k===n; })) || null;
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
const saveSettings = (extra) => api("PUT","settings",{budget:S.budget, methods:S.methods, def:S.def, cats:S.cats, recurring:S.recurring, ...extra}).catch(fail);
function applySettings(v){
  if(typeof v.budget==="number") S.budget=v.budget;
  if(Array.isArray(v.methods)) S.methods=v.methods.map(m=>({id:m.id,name:m.name,alias:Array.isArray(m.alias)?m.alias.slice():[]}));
  if(typeof v.def==="string") S.def=v.def;
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
  if(!draft){ under.innerHTML=""; return; }
  const c = draft.cat || "자동 분류";
  const pm = draft.method ? `<span class="sep">·</span><span class="tag" style="${draft.methodGuessed?"":"color:var(--label)"}">${esc(draft.method.name)}${draft.unregistered?" (미등록)":""}</span>` : "";
  under.innerHTML =
    `<span class="amt num ${draft.type}">${draft.amount ? (draft.type==="in"?"+":"")+won(draft.amount)+"원" : "금액?"}</span><span class="sep">·</span>`+
    `<span class="tag"><span class="dot" style="background:${draft.cat?color(draft.cat):"var(--label3)"}"></span>${esc(c)}</span>${pm}<span class="sep">·</span>`+
    `<span>${dayLabel(draft.date)}</span><span class="sep">·</span><span>${esc(draft.memo)}</span>`;
}
q.addEventListener("input", ()=>{ lastAdded=null; preview(); });
$("form").addEventListener("submit", e=>{
  e.preventDefault();
  if(!draft || !(draft.amount>0)){ if(q.value.trim()) flash("금액을 함께 적어 주세요. 예: 점심 9,000원"); return; }
  const it = {id:uid(), ts:Date.now(), d:draft.date, t:draft.type, a:draft.amount, c:draft.cat||FALLBACK, m:draft.memo};
  if(draft.method){ it.p = draft.method.id; it.pn = draft.method.name; }
  it.r = draft.raw;
  const ym = it.d.slice(0,7);
  (S.months[ym] ||= []).push(it);
  const d = draft;
  q.value=""; go.hidden=true; lastAdded=it;
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
const CHEV = `<svg width="8" height="13" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5 6.5 6.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function renderHome(){
  const list = items(THIS_YM);
  const out = list.filter(i=>i.t==="out").reduce((s,i)=>s+i.a,0);
  $("open").innerHTML = list.length ? `이번 달 <b class="num">${won(out)}원</b> 사용 ${CHEV}` : `내역 보기 ${CHEV}`;
}

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
let sheetOpen=false, editingBudget=false, view="list";
function openSheet(v){ sheetOpen=true; view=v||"list"; S.view=THIS_YM; renderSheet(); $("scrim").classList.add("on"); $("sheet").classList.add("on"); }
function closeSheet(){ sheetOpen=false; editingBudget=false; $("scrim").classList.remove("on"); $("sheet").classList.remove("on"); closeAS(); q.focus(); }
$("open").onclick=()=>openSheet(); $("close").onclick=closeSheet; $("scrim").onclick=closeSheet;
$("gear").onclick=()=>{ view="settings"; renderSheet(); };
$("back").onclick=()=>{ view="list"; renderSheet(); };
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ if(asOpen()) closeAS(); else if(sheetOpen) closeSheet(); } });

function sumBy(list, key){
  const o={}; list.forEach(i=>{ const k=key(i); o[k]=(o[k]||0)+i.a; });
  return Object.entries(o).sort((a,b)=>b[1]-a[1]);
}
function renderSheet(){
  $("gear").hidden = view!=="list"; $("back").hidden = view==="list";
  if(view==="settings") return renderSettings();
  const ym=S.view, list=items(ym), [y,m]=ym.split("-");
  const outs = list.filter(i=>i.t==="out");
  const out = outs.reduce((s,i)=>s+i.a,0);
  const inc = list.filter(i=>i.t==="in").reduce((s,i)=>s+i.a,0);
  const left = S.budget-out, isNow = ym===THIS_YM, dim=daysIn(ym);
  const perDay = isNow ? Math.max(0,left)/(dim-today.getDate()+1) : out/dim;
  const pct = S.budget ? Math.min(100,out/S.budget*100) : 0;

  let h = `<div class="title-row"><h1>${+m}월${y!=String(today.getFullYear())?` <span style="color:var(--label2);font-weight:600;font-size:22px">${y}</span>`:""}</h1><div class="mnav" id="mnav"><button id="prev" aria-label="이전 달"><svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><path d="M7.5 2 1.5 8l6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button id="next" aria-label="다음 달"><svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><path d="M2.5 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>`;
  h += `<div class="sum"><span class="k">${left>=0?"남은 예산":"예산 초과"}</span><span class="v num" style="${left<0?"color:var(--red)":""}">${won(Math.abs(left))}원</span>
    <div class="meter"><i class="${out>S.budget?"over":""}" style="width:${pct}%"></i></div>
    <div class="row"><span>${isNow?"하루 ":"하루 평균 "}<b class="num">${won(perDay)}원</b>${isNow?" 쓸 수 있어요":""}</span>
    <span class="num">예산 ${won(S.budget)}원</span></div></div>`;

  if(!list.length){ h += `<div class="empty">${+m}월에는 기록이 없어요.</div>`; }
  else{
    const cats=sumBy(outs, i=>i.c);
    h += `<div class="cap"><span>분류</span><span class="num">${inc?"수입 +"+won(inc)+"원":""}</span></div><div class="group">`+
      (cats.length?cats.map(([c,v])=>`<div class="cell"><span class="ico" style="background:${color(c)}">${esc(c[0])}</span><span class="t"><span>${esc(c)}</span></span><span class="r num">${won(v)}원 · ${Math.round(v/out*100)}%</span></div>`).join("")
        :`<div class="cell"><span class="t"><small>지출이 없어요</small></span></div>`)+`</div>`;
    const pays=sumBy(outs, i=>methodName(i)||"미지정");
    if(pays.length){
      h += `<div class="cap"><span>결제수단</span></div><div class="group">`+
        pays.map(([n,v])=>`<div class="cell"><span class="ico" style="background:${isCash(n)?"var(--k-green)":"var(--label3)"}">${payIcon(n)}</span><span class="t"><span></span></span><span class="r num">${won(v)}원 · ${Math.round(v/out*100)}%</span></div>`).join("")+`</div>`;
    }
    const days={}; list.forEach(i=>(days[i.d] ||= []).push(i));
    Object.keys(days).sort().reverse().forEach(d=>{
      const net=days[d].reduce((s,i)=>s+(i.t==="in"?i.a:-i.a),0);
      h += `<div class="cap"><span>${dayLabel(d)}</span><span class="num">${net>0?"+":""}${won(net)}원</span></div><div class="group">`+
        days[d].map(i=>{ const mn=methodName(i);
          return `<button class="cell" data-id="${i.id}"><span class="ico" style="background:${color(i.c)}">${esc(i.c[0])}</span><span class="t"><span>${esc(i.m)}</span><small>${esc(i.c)}${mn?" · "+esc(mn):""}${i.rec?" · 정기":""}</small></span><span class="r num ${i.t}">${i.t==="in"?"+":"-"}${won(i.a)}원</span></button>`; }).join("")+`</div>`;
    });
  }
  $("scroll").innerHTML = h;
  $("prev").onclick=()=>{ S.view=shiftYm(S.view,-1); renderSheet(); };
  $("next").disabled = ym>=THIS_YM;
  $("next").onclick=()=>{ if(S.view<THIS_YM){ S.view=shiftYm(S.view,1); renderSheet(); } };
  // payment-method names go in as text
  const payCells = $("scroll").querySelectorAll(".group")[1];
  if(list.length && outs.length) sumBy(outs, i=>methodName(i)||"미지정").forEach(([n],k)=>{ payCells.children[k].querySelector(".t span").textContent=n; });
}
const CASH_ICON = `<svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect x="1" y="1" width="16" height="10" rx="1.6" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="9" cy="6" r="2.2" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M4 4v4M14 4v4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const isCash = name => /현금|cash/i.test(name||"");
const payIcon = name => isCash(name) ? CASH_ICON : PAY_ICON;
const PAY_ICON = `<svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><rect x="1" y="1" width="14" height="10" rx="2" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M1 4.5h14" stroke="#fff" stroke-width="1.6"/></svg>`;

/* ---------- settings ---------- */
let catsOpen = (()=>{ try{ return localStorage.getItem("moa-cats-open")==="1"; }catch(e){ return false; } })();
function renderSettings(){
  let h = `<h1>설정</h1>`;
  h += `<div class="cap"><span>월 예산</span></div><div class="group"><form class="cell" id="bForm"><span class="t"><input class="inline num" id="bIn" inputmode="numeric" value="${won(S.budget)}" aria-label="월 예산"></span><span class="r">원</span></form></div>`;
  h += `<div class="cap"><span>결제수단</span></div><div class="group">`+
    S.methods.map(m=>`<button class="cell" data-m="${m.id}"><span class="ico" style="background:${m.id===S.def?"var(--blue)":isCash(m.name)?"var(--k-green)":"var(--label3)"}">${payIcon(m.name)}</span><span class="t"><span></span><small></small></span><span class="r">${m.id===S.def?"기본 ":""}${CHEV}</span></button>`).join("")+
    `<button class="cell" data-m="__new"><span class="t"><span style="color:var(--blue)">결제수단 추가</span></span></button></div>`;
  h += `<p class="foot-note">입력에 결제수단 이름이나 별칭이 들어 있으면 그 수단으로 기록해요. 예: "점심 9천 현대카드", "택시 1.2만 토스로". 없으면 기본 수단으로 기록해요.</p>`;
  const recTotal = S.recurring.filter(r=>!r.paused).reduce((a,r)=>a+r.amount,0);
  h += `<div class="cap"><span>정기 결제</span><span class="num">${S.recurring.length?"매월 "+won(recTotal)+"원":""}</span></div><div class="group">`+
    S.recurring.slice().sort((a,b)=>a.day-b.day).map(r=>`<button class="cell" data-rec="${esc(r.id)}"><span class="ico" style="background:${r.paused?"var(--label3)":color(r.cat)}">${esc((r.cat||"기")[0])}</span><span class="t"><span></span><small></small></span><span class="r num">${won(r.amount)}원 ${CHEV}</span></button>`).join("")+
    `<button class="cell" data-rec="__new"><span class="t"><span style="color:var(--blue)">정기 결제 추가</span></span></button></div>`;
  h += `<p class="foot-note">매월 결제일이 되면 내역에 자동으로 기록돼요. 앱을 며칠 안 열어도 다음에 열 때 빠짐없이 채워져요.</p>`;
  h += `<div class="cap"><span>분류</span></div><div class="group">
    <button class="cell toggle" id="catToggle" aria-expanded="${catsOpen}"><span class="t"><span>분류 ${S.cats.length}개</span><small>${esc(S.cats.map(c=>c.name).join(", "))}</small></span><span class="r chev${catsOpen?" open":""}">${CHEV}</span></button>`+
    (catsOpen ? S.cats.map(c=>`<button class="cell" data-cat="${c.id}"><span class="ico" style="background:${color(c.name)}">${esc(c.name[0])}</span><span class="t"><span>${esc(c.name)}</span><small>${c.keys.length?esc(c.keys.slice(0,4).join(", "))+(c.keys.length>4?` 외 ${c.keys.length-4}개`:""):"키워드 없음"}</small></span><span class="r">${CHEV}</span></button>`).join("")+
    `<button class="cell" data-cat="__new"><span class="t"><span style="color:var(--blue)">분류 추가</span></span></button>` : "")+`</div>`;
  h += `<p class="foot-note">키워드가 들어 있는 입력은 바로 그 분류로 들어가요. 키워드에 없는 상호는 Gemini가 이 분류 중에서 골라요.</p>`;
  h += `<div class="cap"><span>Gemini</span></div><div class="group"><form class="cell" id="gForm"><span class="t"><input class="inline" id="gKey" type="password" autocomplete="off" spellcheck="false" placeholder="API 키 붙여넣기" aria-label="Gemini API 키"></span><button class="edit" type="submit">저장</button></form></div>
    <p class="foot-note" id="gNote">키는 이 기기 안에만 저장되고 백업 파일에도 들어가지 않아요. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">키 발급받기</a></p>`;
  h += `<div class="cap"><span>백업</span></div><div class="group">
    <button class="cell" id="exp"><span class="t"><span style="color:var(--blue)">백업 파일 내보내기</span></span></button>
    <label class="cell" for="impFile"><span class="t"><span style="color:var(--blue)">백업 파일에서 가져오기</span></span></label></div>
    <input type="file" id="impFile" accept="application/json,.json" hidden>
    <p class="foot-note">기록은 이 기기 안에만 있어요. 홈 화면 아이콘을 지우면 기록도 지워지니 가끔 내보내기로 백업해 두세요.</p>`;
  $("scroll").innerHTML = h;
  setupGemini(); setupBackup();
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
    const file = new File([JSON.stringify(data)], name, {type:"application/json"});
    // 아이폰: 공유 시트로 파일 앱·AirDrop에 저장 / 그 밖: 바로 다운로드
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
function showAS(html){ const as=$("as"); as.innerHTML=html; $("scrim2").classList.add("on"); as.classList.add("on"); return as; }
function closeAS(){ $("as").classList.remove("on"); $("scrim2").classList.remove("on"); }
$("scrim2").onclick=closeAS;

$("scroll").addEventListener("click", e=>{
  const t=e.target.closest("[data-id]"); if(t) return openTx(t.dataset.id);
  const m=e.target.closest("[data-m]"); if(m) return openMethod(m.dataset.m);
  const c=e.target.closest("[data-cat]"); if(c) return openCat(c.dataset.cat);
  const r=e.target.closest("[data-rec]"); if(r) return openRec(r.dataset.rec);
});
function openTx(id){
  const [ym,i]=find(id); if(!ym) return; const it=S.months[ym][i];
  const as = showAS(`<div class="g"><div class="h"></div>
    <div class="sub">분류</div><div class="chips">${allCats().map(c=>`<button data-c="${esc(c)}" class="${c===it.c?"sel":""}"><i style="background:${c===it.c?"#fff":color(c)}"></i>${esc(c)}</button>`).join("")}</div>
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
    <button class="btn b" type="submit">저장</button>
    ${!isNew && m.id!==S.def?`<button class="btn" type="button" id="mDef">기본 수단으로 지정</button>`:""}
    ${!isNew && S.methods.length>1?`<button class="btn red" type="button" id="mDel">삭제</button>`:""}
  </form><div class="g"><button class="btn b" id="mCancel" type="button">취소</button></div>`);
  $("mName").value=m.name; $("mAlias").value=m.alias.join(", ");
  setTimeout(()=>$("mName").focus(), 50);
  $("mForm").onsubmit=e=>{
    e.preventDefault();
    const name=$("mName").value.trim(); if(!name){ $("mName").focus(); return; }
    m.name=name; m.alias=$("mAlias").value.split(",").map(s=>s.trim()).filter(Boolean);
    if(isNew) S.methods.push(m);
    saveSettings(); closeAS(); renderSheet();
  };
  const d=$("mDef"); if(d) d.onclick=()=>{ S.def=m.id; saveSettings(); closeAS(); renderSheet(); };
  const x=$("mDel"); if(x) x.onclick=()=>{ S.methods=S.methods.filter(v=>v.id!==m.id); if(S.def===m.id) S.def=S.methods[0].id; saveSettings(); closeAS(); renderSheet(); };
  $("mCancel").onclick=closeAS;
}

function openCat(cid){
  const isNew = cid==="__new";
  const c = isNew ? {id:uid(),name:"",color:COLORS.find(k=>!S.cats.some(x=>x.color===k))||"blue",keys:[]} : S.cats.find(x=>x.id===cid);
  if(!c) return;
  const used = items().filter(i=>i.c===c.name).length;
  let pick = c.color;
  const as = showAS(`<form class="g" id="cForm"><div class="h">${isNew?"분류 추가":"분류 편집"}</div>
    <div class="fields"><input id="cName" placeholder="이름 (예: 반려동물)" aria-label="이름" maxlength="10">
    <textarea id="cKeys" placeholder="키워드, 쉼표로 구분 (예: 사료, 동물병원, 간식)" aria-label="키워드"></textarea></div>
    <div class="swatches">${COLORS.map(k=>`<button type="button" data-col="${k}" aria-label="${k}" class="${k===pick?"sel":""}" style="background:var(--k-${k})"></button>`).join("")}</div>
    <button class="btn b" type="submit">저장</button>
    ${!isNew && c.name!==FALLBACK?`<button class="btn red" type="button" id="cDel">삭제${used?` (내역 ${used}건은 ${FALLBACK}로)`:""}</button>`:""}
  </form><div class="g"><button class="btn b" id="cCancel" type="button">취소</button></div>`);
  $("cName").value=c.name; $("cKeys").value=c.keys.join(", ");
  if(c.name===FALLBACK) $("cName").disabled=true;
  as.querySelectorAll("[data-col]").forEach(b=>b.onclick=()=>{ pick=b.dataset.col; as.querySelectorAll("[data-col]").forEach(x=>x.classList.toggle("sel",x===b)); });
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
    <div class="sub">분류</div><div class="chips" id="rCats">${S.cats.map(c=>`<button type="button" data-rc="${esc(c.name)}"><i style="background:${color(c.name)}"></i>${esc(c.name)}</button>`).join("")}</div>
    <div class="sub">결제수단</div><div class="chips" id="rPays">${S.methods.map(m=>`<button type="button" data-rp="${esc(m.id)}"></button>`).join("")}</div>
    <div class="hint-line" id="rHint"></div>
    <button class="btn b" type="submit">저장</button>
    ${!isNew?`<button class="btn" type="button" id="rPause">${r.paused?"다시 시작":"일시정지"}</button><button class="btn red" type="button" id="rDel">삭제</button>`:""}
  </form><div class="g"><button class="btn b" id="rCancel" type="button">취소</button></div>`);
  $("rName").value=r.name; $("rAmt").value=r.amount?won(r.amount):""; $("rDay").value=r.day;
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
    Object.assign(r,{name,amount,day,cat:cat||FALLBACK,p:pay});
    if(isNew) S.recurring.push(r);
    await saveSettings(); await load();
    closeAS(); renderSheet();
  };
  const pz=$("rPause"); if(pz) pz.onclick=async()=>{ r.paused=!r.paused; await saveSettings(); closeAS(); renderSheet(); };
  const del=$("rDel"); if(del) del.onclick=async()=>{ S.recurring=S.recurring.filter(x=>x!==r); await saveSettings(); closeAS(); renderSheet(); };
  $("rCancel").onclick=closeAS;
}
// 분류 이름이 바뀌거나 지워지면 내역과 기억해 둔 상호도 함께 옮긴다
async function renameCat(from,to){
  Object.values(S.months).flat().forEach(i=>{ if(i.c===from) i.c=to; });
  S.recurring.forEach(r=>{ if(r.cat===from) r.cat=to; });
  await api("POST","categories/rename",{from,to}).catch(fail);
  renderHome();
}

boot();
q.focus();

if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
