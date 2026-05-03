// wf-map.jsx — hierarchical maps.
// Levels: country(maa) → vaalipiiri(vp) → kunta → äänestysalue(aa).
//
// Vaalipiiri + kunta geometry is REAL — projected from Statistics Finland's
// 2026 vaalipiiri / kunta layers (CC BY 4.0) by wf-geo.jsx, which exposes
// VAALIPIIRIT, VP_BY_ID, KUNNAT, KUNTA_BY_ID, COUNTRY_VIEWBOX on window.
//
// Äänestysalueet (level 3) remain a generated grid placeholder — real AA
// geometries are not openly redistributable here, and AA boundaries change
// between elections, so a placeholder is the honest representation.

const VAALIPIIRIT  = window.VAALIPIIRIT;
const VP_BY_ID     = window.VP_BY_ID;
const KUNNAT       = window.KUNNAT;
const KUNTA_BY_ID  = window.KUNTA_BY_ID;
const COUNTRY_VIEWBOX = window.COUNTRY_VIEWBOX || "60 30 300 610";

// ─────────────────────────────────────────────────────────────
// Äänestysalueet (level 3). Generated for selected kuntas.
// ─────────────────────────────────────────────────────────────
function makeAanestysalueet(kuntaId, count=16){
  const cols=4, rows=Math.ceil(count/cols);
  const W=380,H=380,pad=10;
  const cw=(W-pad*2)/cols, ch=(H-pad*2)/rows;
  const arr=[];
  for(let idx=0;idx<count;idx++){
    const i=idx%cols,j=Math.floor(idx/cols);
    const rx=pad+i*cw, ry=pad+j*ch;
    const r=(s)=>{const v=Math.sin(s*12.9898+idx*31.17+kuntaId.length*11)*43758.5;return (v-Math.floor(v)-0.5)*5;};
    const pts=[
      [rx+r(1), ry+r(2)],
      [rx+cw+r(3), ry+r(4)],
      [rx+cw+r(5), ry+ch+r(6)],
      [rx+r(7), ry+ch+r(8)],
    ];
    arr.push({ id:`${kuntaId}_aa${idx}`,
      label:`${String(idx+1).padStart(3,"0")}`,
      d:"M "+pts.map(p=>p.join(",")).join(" L ")+" Z",
      cx:rx+cw/2, cy:ry+ch/2 });
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────
// Demo data — deterministic pseudo-random per-region values so
// coloring modes produce something plausible.
// ─────────────────────────────────────────────────────────────
const PARTY_IDS = ["kok","sdp","ps","kesk","vihr","vas","rkp","kd"];

function hashStr(s){let h=0;for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}return Math.abs(h);}
function rng(seed){let s=seed>>>0; return ()=>{s=(s*1664525+1013904223)>>>0; return s/4294967296;};}

// Per-region full party share vector
function regionData(id){
  const r=rng(hashStr(id));
  const raw = PARTY_IDS.map(()=>r()*30+5);
  const total = raw.reduce((a,b)=>a+b,0);
  const shares = raw.map(v=>+(v/total*100).toFixed(1));
  const winner = PARTY_IDS[shares.indexOf(Math.max(...shares))];
  const turnout = +(60+r()*20).toFixed(1);
  const voters = Math.round(r()*200000+5000);
  const votes = Math.round(voters*turnout/100);
  const deltaAll = Object.fromEntries(PARTY_IDS.map(p=>[p, +(r()*12-6).toFixed(1)]));
  return { id, shares, winner, turnout, voters, votes, deltaAll };
}

// ─────────────────────────────────────────────────────────────
// Formula evaluator.
// A formula is an array of tokens: {kind, value}.
//   kind "data":  value = { metric: "share"|"delta"|"votes"|"turnout", party?: id }
//   kind "op":    value = "+"|"-"|"*"|"/"
//   kind "num":   value = number
//   kind "paren": value = "("|")"
// We compile tokens into an infix expression and use a tiny shunting-yard
// evaluator. Returns {ok:true,value} or {ok:false,error}.
// ─────────────────────────────────────────────────────────────
const FORMULA_METRICS = [
  {id:"share",     label:"% share",         needsParty:true,  needsCandidate:false, short:"%"},
  {id:"delta",     label:"Δ support",       needsParty:true,  needsCandidate:false, short:"Δ"},
  {id:"votes",     label:"party votes",     needsParty:true,  needsCandidate:false, short:"v"},
  {id:"turnout",   label:"turnout %",       needsParty:false, needsCandidate:false, short:"t"},
  {id:"candidate", label:"candidate votes", needsParty:false, needsCandidate:true,  short:"c"},
];
const FORMULA_METRIC_BY_ID = Object.fromEntries(FORMULA_METRICS.map(m=>[m.id,m]));

// Resolve a {type, year, round?} fields object into a legacy election id
// like "ek2023" / "pres2024_r1" so the rest of the pipeline keeps working.
function _electionIdFromFields(f){
  if(!f) return null;
  if(f.selType || f.selYear) return null; // selector — unresolved
  if(!f.type || !f.year) return null;
  if(f.type==="pres") return `pres${f.year}_r${f.round||1}`;
  return `${f.type}${f.year}`;
}

// Convert a new-style chip token to the legacy data-token shape expected by
// the rest of wf-map. Selectors are NOT resolvable here — caller decides.
function _chipToDataValue(chip){
  const f = chip.fields || {};
  const election = _electionIdFromFields(f);
  const v = { election };
  if(f.selWho) { v.metric = "share"; v._selector = f.selWho; return v; }
  if(f.who?.candidate){ v.metric = "candidate"; v.candidate = f.who.candidate; return v; }
  if(f.who?.party){ v.metric = "share"; v.party = f.who.party; return v; }
  // Just type/year with no "who" — treat as turnout for that election
  v.metric = "turnout";
  return v;
}

function formulaTokenLabel(t){
  if(t.kind==="num")   return String(t.value);
  if(t.kind==="op")    return t.value;
  if(t.kind==="paren") return t.value;
  if(t.kind==="chip"){
    // Synthesize a legacy data-token label from the new chip shape
    return formulaTokenLabel({kind:"data", value:_chipToDataValue(t)});
  }
  if(t.kind==="data"){
    const m = FORMULA_METRIC_BY_ID[t.value.metric];
    if(!m) return "?";
    const EL = (window.ELECTION_LABELS||{});
    const elSuffix = t.value.election ? ` (${EL[t.value.election] || t.value.election})` : "";
    if(m.needsCandidate){
      const name = t.value.candidate?.name || "candidate";
      // Show "LastName c (EK 2027)" — keep it compact
      const short = name.split(" ").slice(-1)[0];
      return `${short} ${m.short}${elSuffix}`;
    }
    const partyAbbr = t.value.party ? ((window.PARTY_ABBR||{})[t.value.party]||t.value.party) : "";
    return m.needsParty
      ? `${partyAbbr} ${m.short}${elSuffix}`
      : `${m.short}${elSuffix}`;
  }
  return "?";
}

function formulaSummary(tokens){
  if(!tokens || !tokens.length) return "empty formula";
  return tokens.map(formulaTokenLabel).join(" ");
}

// Extract numeric datum from regionData for a given data token. Elections are
// baked into the seed so different elections yield stable but different values.
function formulaDatumValue(regionId, dataTok){
  const { metric, party, election, candidate } = dataTok.value;
  // Use an election-suffixed id so regionData returns an election-specific
  // snapshot. Falls back to plain regionId when no election is specified.
  const effId = election ? `${regionId}__${election}` : regionId;
  const d = regionData(effId);
  if(metric==="share"){
    const idx = PARTY_IDS.indexOf(party);
    return idx>=0 ? d.shares[idx] : 0;
  }
  if(metric==="delta"){
    return d.deltaAll[party] ?? 0;
  }
  if(metric==="votes"){
    const idx = PARTY_IDS.indexOf(party);
    return idx>=0 ? Math.round(d.votes * d.shares[idx] / 100) : 0;
  }
  if(metric==="turnout"){
    return d.turnout;
  }
  if(metric==="candidate"){
    if(!candidate || !candidate.id) return 0;
    // Reuse the deterministic candidate generator if available. Vote counts
    // depend on the candidate's rank and the region's total votes.
    const getCands = window.candidatesFor;
    if(!getCands) return 0;
    const cands = getCands(effId, 80);
    const hit = cands.find(c=>c.name===candidate.name);
    return hit ? hit.votes : 0;
  }
  return 0;
}

// Tiny shunting-yard. Returns {ok, value, error}.
function evalFormula(tokens, regionId){
  if(!tokens || !tokens.length) return {ok:false, error:"empty"};
  const prec = {"+":1,"-":1,"*":2,"/":2};
  const out = [], stack = [];
  // Validate simple adjacency rules while converting.
  let prev = null; // "val" | "op" | "lp" | "rp" | null
  for(const t of tokens){
    if(t.kind==="num" || t.kind==="data" || t.kind==="chip"){
      if(prev==="val" || prev==="rp") return {ok:false, error:"two values in a row"};
      let v;
      if(t.kind==="num") v = t.value;
      else if(t.kind==="chip"){
        const f = t.fields || {};
        if(f.selType || f.selYear || f.selWho) return {ok:false, error:"unbound selector"};
        v = formulaDatumValue(regionId, {kind:"data", value:_chipToDataValue(t)});
      } else {
        v = formulaDatumValue(regionId, t);
      }
      out.push(v);
      prev = "val";
    } else if(t.kind==="op"){
      if(prev!=="val" && prev!=="rp") return {ok:false, error:"operator needs a value before it"};
      while(stack.length && stack[stack.length-1]!=="(" && prec[stack[stack.length-1]]>=prec[t.value]){
        out.push(stack.pop());
      }
      stack.push(t.value);
      prev = "op";
    } else if(t.kind==="paren"){
      if(t.value==="("){
        if(prev==="val" || prev==="rp") return {ok:false, error:"missing operator before ("};
        stack.push("(");
        prev = "lp";
      } else {
        if(prev!=="val" && prev!=="rp") return {ok:false, error:"empty parentheses"};
        while(stack.length && stack[stack.length-1]!=="("){ out.push(stack.pop()); }
        if(!stack.length) return {ok:false, error:"mismatched )"};
        stack.pop();
        prev = "rp";
      }
    }
  }
  if(prev==="op") return {ok:false, error:"formula ends on an operator"};
  while(stack.length){
    const top = stack.pop();
    if(top==="(" || top===")") return {ok:false, error:"mismatched ("};
    out.push(top);
  }
  // RPN eval
  const s = [];
  for(const x of out){
    if(typeof x==="number") s.push(x);
    else {
      const b=s.pop(), a=s.pop();
      if(a===undefined||b===undefined) return {ok:false, error:"not enough operands"};
      if(x==="+") s.push(a+b);
      else if(x==="-") s.push(a-b);
      else if(x==="*") s.push(a*b);
      else if(x==="/") s.push(b===0 ? 0 : a/b);
    }
  }
  if(s.length!==1) return {ok:false, error:"invalid formula"};
  return {ok:true, value:s[0]};
}

// Compute min/max of a formula across all regions in current view
// (used for legend range + color ramp bucketing).
//
// `framing` rescales raw formula values:
//   "absolute"   — raw values (default)
//   "share"      — each region's value as a % of the sum across visible regions
//   "vsSelected" — each region's value expressed as % difference from
//                  the value at `framingRef` (a region id). 0 = same as ref.
function formulaRange(tokens, level, parentId, framing, framingRef){
  const regions = level==="maa"||level==="vp" ? VAALIPIIRIT.map(r=>r.id)
                : level==="kunta" ? (KUNNAT[parentId]||[]).map(r=>r.id)
                : makeAanestysalueet(parentId||"",16).map(r=>r.id);
  const raw = [];
  for(const id of regions){
    const r = evalFormula(tokens, id);
    if(!r.ok) return null;
    raw.push({id, v:r.value});
  }
  const transformed = applyFraming(raw, framing, framingRef);
  let min=Infinity, max=-Infinity;
  for(const e of transformed){
    if(e.v<min) min=e.v;
    if(e.v>max) max=e.v;
  }
  if(!isFinite(min)||!isFinite(max)) return null;
  return {min, max, framing: framing||"absolute"};
}

// Apply a framing mode to a list of {id, v} entries. Returns the same shape
// with v rescaled. Pure — no side effects on the raw input.
function applyFraming(entries, framing, framingRef){
  if(!framing || framing==="absolute") return entries;
  if(framing==="share"){
    const sum = entries.reduce((a,e)=>a+e.v,0);
    if(!sum) return entries.map(e=>({...e, v:0}));
    return entries.map(e=>({...e, v: e.v/sum*100}));
  }
  if(framing==="vsSelected"){
    const ref = entries.find(e=>e.id===framingRef);
    const base = ref ? ref.v : 0;
    if(!base) return entries.map(e=>({...e, v:0}));
    return entries.map(e=>({...e, v: (e.v-base)/Math.abs(base)*100}));
  }
  return entries;
}

// Single-region framing helper for the map's per-cell color step. Re-runs the
// same range calc since framing depends on sibling regions.
function formulaValueFramed(tokens, regionId, level, parentId, framing, framingRef){
  const r = evalFormula(tokens, regionId);
  if(!r.ok) return null;
  if(!framing || framing==="absolute") return r.value;
  const regions = level==="maa"||level==="vp" ? VAALIPIIRIT.map(x=>x.id)
                : level==="kunta" ? (KUNNAT[parentId]||[]).map(x=>x.id)
                : makeAanestysalueet(parentId||"",16).map(x=>x.id);
  const raw = [];
  for(const id of regions){
    const rr = evalFormula(tokens, id);
    if(!rr.ok) return null;
    raw.push({id, v:rr.value});
  }
  const t = applyFraming(raw, framing, framingRef);
  const hit = t.find(e=>e.id===regionId);
  return hit ? hit.v : null;
}

// Compute fill for a region given coloring mode and (optionally) focus party
function fillForRegion(id, mode, focusParty, extra){
  const d = regionData(id);
  if(mode==="winner"){
    return `var(--p-${d.winner})`;
  }
  if(mode==="support"){
    const v = focusParty ? d.shares[PARTY_IDS.indexOf(focusParty)] : Math.max(...d.shares);
    // single-hue ramp
    if(v<10) return "#f4f0e6";
    if(v<17) return "#dbe5ef";
    if(v<23) return "#a8c3dd";
    if(v<30) return "#6e9cc6";
    if(v<38) return "#3f76ad";
    return "#1f5a9c";
  }
  if(mode==="change"){
    const v = focusParty ? d.deltaAll[focusParty]
                         : d.deltaAll[d.winner];
    // Purple (loss) ← neutral cream → orange (gain). Colorblind-safe
    // diverging palette (purple & orange are distinguishable across all
    // common forms of color-vision deficiency).
    if(v<=-4)   return "#6a2c91";
    if(v<=-1.5) return "#b98ecb";
    if(v<=1.5)  return "#f0ead8";
    if(v<=4)    return "#f0a860";
    return "#c86a10";
  }
  if(mode==="votes"){
    const v = d.votes;
    if(v<20000) return "#f4f0e6";
    if(v<50000) return "#e6d9b8";
    if(v<100000) return "#d1bc78";
    if(v<200000) return "#a8913f";
    return "#6f5f1f";
  }
  if(mode==="formula"){
    const tokens = extra?.formulaTokens;
    const range  = extra?.formulaRange;
    const framing = extra?.formulaFraming || "absolute";
    const framingRef = extra?.formulaFramingRef;
    const level = extra?.level, parent = extra?.parent;
    if(!tokens || !range) return "#eae3cf";
    const v = (framing==="absolute")
      ? (evalFormula(tokens, id).ok ? evalFormula(tokens, id).value : null)
      : formulaValueFramed(tokens, id, level, parent, framing, framingRef);
    if(v==null) return "#eae3cf";
    const {min,max} = range;
    // diverging if straddles zero, else single-hue
    if(min < 0 && max > 0){
      const bound = Math.max(Math.abs(min), Math.abs(max));
      const t = v/bound; // -1..1
      if(t<=-0.66) return "#6a2c91";
      if(t<=-0.25) return "#b98ecb";
      if(t< 0.25)  return "#f0ead8";
      if(t< 0.66)  return "#f0a860";
      return "#c86a10";
    } else {
      const span = max-min || 1;
      const t = (v-min)/span; // 0..1
      if(t<0.15) return "#f4f0e6";
      if(t<0.35) return "#dbe5ef";
      if(t<0.55) return "#a8c3dd";
      if(t<0.75) return "#6e9cc6";
      if(t<0.90) return "#3f76ad";
      return "#1f5a9c";
    }
  }
  return "#eae3cf";
}

// ─────────────────────────────────────────────────────────────
// HierarchyMap — renders all peer regions at a given level.
// props:
//   level: "maa" | "vp" | "kunta"
//   parentId: id of parent (vp id when level=kunta, kunta id when level=aa)
//   selected: id of currently highlighted peer
//   mode: color mode
//   focusParty: when set, mode "support"/"change" uses that party
//   onPick(id): click handler
//   onZoomIn(id): double-click handler
// ─────────────────────────────────────────────────────────────
function HierarchyMap({level, parentId, selected, mode, focusParty, extra, onPick, onZoomIn, width=440, height=560}){
  const [hoverId, setHoverId] = React.useState(null);
  let regions, viewBox, isCountry=false;
  if(level==="maa" || level==="vp"){
    regions = VAALIPIIRIT;
    viewBox = COUNTRY_VIEWBOX;
    isCountry = true;
  } else if(level==="kunta"){
    regions = KUNNAT[parentId] || [];
    viewBox = "0 0 400 400";
  } else { // aa
    regions = makeAanestysalueet(parentId, 16);
    viewBox = "0 0 400 400";
  }

  // Smart label rule: at country level, label every vaalipiiri. At kunta
  // level real geometry is dense — show labels only for the largest ~25%
  // of regions by projected area, plus the selected/hovered one. AA still
  // labels all (it's a small generated grid).
  const labelable = React.useMemo(()=>{
    if(level!=="kunta") return new Set(regions.map(r=>r.id));
    const sorted = [...regions].sort((a,b)=>(b.area||0)-(a.area||0));
    const keepN = Math.max(4, Math.ceil(sorted.length*0.28));
    return new Set(sorted.slice(0, keepN).map(r=>r.id));
  }, [regions, level]);

  return (
    <svg viewBox={viewBox} width={width} height={height} style={{display:"block"}}>
      <g>
        {regions.map(r=>{
          const isSel = selected===r.id;
          const isHover = hoverId===r.id;
          return (
            <path key={r.id} d={r.d}
              fill={fillForRegion(r.id, mode, focusParty, extra)}
              stroke="#1a1a1a"
              strokeWidth={isSel?1.8: isHover?1.2 : 0.5}
              opacity={isSel?1: isHover?0.98 : 0.94}
              style={{cursor:"pointer", transition:"stroke-width .12s"}}
              onClick={()=>onPick&&onPick(r.id)}
              onDoubleClick={()=>onZoomIn&&onZoomIn(r.id)}
              onMouseEnter={()=>setHoverId(r.id)}
              onMouseLeave={()=>setHoverId(p=>p===r.id?null:p)}
            >
              <title>{r.label}</title>
            </path>
          );
        })}
      </g>

      {regions.map(r=>{
        const show = labelable.has(r.id) || selected===r.id || hoverId===r.id;
        if(!show) return null;
        const isSel = selected===r.id;
        const isHover = hoverId===r.id;
        return (
          <g key={r.id+"-t"} style={{pointerEvents:"none"}}>
            {(isHover && !labelable.has(r.id)) && (
              <rect
                x={r.cx-r.label.length*3} y={r.cy-7}
                width={r.label.length*6} height={13}
                rx="2"
                fill="rgba(251,249,244,0.9)"
                stroke="#1a1a1a" strokeWidth="0.4"
              />
            )}
            <text x={r.cx} y={r.cy}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={level==="aa"?9 : level==="kunta"?8.5 : 11}
              fontFamily="Architects Daughter, system-ui"
              fill="#1a1a1a"
              style={{fontWeight: isSel?700:400}}>
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Legend colors for "winner" mode need to be dynamic — computed from
// which parties actually appear as winners in the current view.
function winnersInView(level, parentId){
  const regions = level==="maa"||level==="vp" ? VAALIPIIRIT
                : level==="kunta" ? (KUNNAT[parentId]||[])
                : makeAanestysalueet(parentId||"",16);
  const set = new Set();
  regions.forEach(r=>set.add(regionData(r.id).winner));
  return [...set];
}

Object.assign(window, {
  VAALIPIIRIT, VP_BY_ID, KUNNAT, PARTY_IDS,
  regionData, fillForRegion, HierarchyMap, makeAanestysalueet, winnersInView,
  FORMULA_METRICS, FORMULA_METRIC_BY_ID,
  evalFormula, formulaRange, formulaTokenLabel, formulaSummary, formulaValueFramed, applyFraming,
});
