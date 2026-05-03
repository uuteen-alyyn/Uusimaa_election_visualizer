// wf-suggest.jsx — WYSIWYG formula composer (progressive chip assembly)
//
// A chip is a data-operand built up in three fields:
//   1. electionType  — "ek" | "kunta" | "alue" | "eu" | "pres"  OR selector
//   2. yearOrRound   — e.g. 2023  OR {round:1,year:2024}        OR selector
//   3. who           — {party:"kok"} | {candidate:{id,name,party}} OR selector
//
// Operators: + - * / ( ) stand between chips.
//
// A "selector" is a named variable like $A that the Ledger binds at render
// time. We represent it as {sel:true, name:"A"} in any of the three slots.
//
// Token shapes in the tokens[] array:
//   {kind:"chip",  fields:{type?, year?, round?, who?, sel?:{...}}}
//   {kind:"op",    value:"+|-|*|/"}
//   {kind:"paren", value:"(|)"}
//   {kind:"num",   value:Number}

(function(){

// ─── Helpers ─────────────────────────────────────────────────────────
function scoreOne(term, text){
  if(!term) return 0;
  const t = (text||"").toLowerCase();
  if(t===term) return 100;
  if(t.startsWith(term)) return 80 - t.length*0.1;
  const words = t.split(/[\s·.\-_()]+/);
  for(const w of words){
    if(w===term) return 70;
    if(w.startsWith(term)) return 60 - t.length*0.05;
  }
  if(/^\d+$/.test(term)){ for(const w of words) if(w===term) return 75; }
  const idx = t.indexOf(term);
  if(idx>=0) return 40 - idx*0.5;
  const acro = words.map(w=>w[0]||"").join("");
  if(acro.startsWith(term)) return 50;
  return 0;
}
function score(query, text){
  if(!query) return 1;
  const q = query.toLowerCase().trim();
  if(!q) return 1;
  const terms = q.split(/\s+/);
  if(terms.length===1) return scoreOne(terms[0], text);
  let total = 0;
  for(const t of terms){ const s=scoreOne(t, text); if(s<=0) return 0; total += s; }
  return total/terms.length;
}

// Resolve a specific election id from {type, year, round?}
function findElectionId(fields){
  if(!fields || !fields.type || !fields.year) return null;
  const ELS = window.ELECTIONS || [];
  return ELS.find(e=>
    e.typeId===fields.type &&
    e.year===fields.year &&
    (fields.type!=="pres" || e.round===(fields.round||1))
  )?.id || null;
}

// Short chip label — progressive
function chipText(fields){
  const TYPES = window.ELECTION_TYPE_BY_ID || {};
  const parts = [];
  if(fields.selType) parts.push(`$${fields.selType}`);
  else if(fields.type) parts.push(TYPES[fields.type]?.short || fields.type);

  if(fields.selYear) parts.push(`$${fields.selYear}`);
  else if(fields.year){
    if(fields.type==="pres" && fields.round) parts.push(`${fields.year}·${fields.round==2?"II":"I"}`);
    else parts.push(String(fields.year));
  }

  if(fields.selWho) parts.push(`$${fields.selWho}`);
  else if(fields.who){
    if(fields.who.party) parts.push((window.PARTY_ABBR||{})[fields.who.party]||fields.who.party);
    else if(fields.who.candidate) parts.push(fields.who.candidate.name.split(" ").slice(-1)[0]); // last name
  }
  return parts.join(" · ") || "?";
}
function chipFullText(fields){
  const TYPES = window.ELECTION_TYPE_BY_ID || {};
  const parts = [];
  if(fields.selType) parts.push(`[selector ${fields.selType}]`);
  else if(fields.type) parts.push(TYPES[fields.type]?.label || fields.type);
  if(fields.selYear) parts.push(`[selector ${fields.selYear}]`);
  else if(fields.year){
    if(fields.type==="pres" && fields.round) parts.push(`${fields.year}, ${fields.round==2?"2.":"1."} kierros`);
    else parts.push(String(fields.year));
  }
  if(fields.selWho) parts.push(`[selector ${fields.selWho}]`);
  else if(fields.who){
    if(fields.who.party) parts.push((window.PARTY_NAME||{})[fields.who.party]||fields.who.party);
    else if(fields.who.candidate) parts.push(fields.who.candidate.name);
  }
  return parts.join(", ");
}

function chipIsComplete(c){
  if(c.kind!=="chip") return true;
  const f = c.fields || {};
  const hasType = f.type || f.selType;
  const hasYear = f.year || f.selYear;
  const hasWho  = f.who  || f.selWho;
  return hasType && hasYear && hasWho;
}

// What field does this chip still need?
function nextFieldFor(chip){
  if(!chip || chip.kind!=="chip") return "type";
  const f = chip.fields || {};
  if(!(f.type || f.selType)) return "type";
  if(!(f.year || f.selYear)) return "year";
  if(!(f.who  || f.selWho))  return "who";
  return null;
}

// Strip the last filled field off a chip (used by Backspace)
function stripLastField(chip){
  const f = {...(chip.fields||{})};
  if(f.who || f.selWho){ delete f.who; delete f.selWho; }
  else if(f.year || f.selYear){ delete f.year; delete f.selYear; delete f.round; }
  else if(f.type || f.selType){ return null; } // chip becomes empty → remove
  return {...chip, fields:f};
}

// ─── Suggestions ─────────────────────────────────────────────────────
function buildSuggestions(query, activeField, activeChip, selectors){
  const q = (query||"").trim();
  const out = [];
  const push = (s, sc)=>{ if(sc>0) out.push({...s, score:sc}); };

  // Operators / parens — only valid between chips (when activeChip is complete or null)
  const canOp = !activeChip || chipIsComplete(activeChip);
  if(canOp){
    const opMap = {"+":"plus","-":"minus","*":"times","/":"divide"};
    for(const [op,name] of Object.entries(opMap)){
      if(q===op) push({id:`op-${op}`,kind:"op",label:op,sub:"operator",action:"op",op}, 95);
      else push({id:`op-${op}`,kind:"op",label:op,sub:`operator (${name})`,action:"op",op}, score(q,name));
    }
    for(const p of ["(",")"]){
      if(q===p) push({id:`paren-${p}`,kind:"paren",label:p,sub:"parenthesis",action:"paren",paren:p}, 95);
    }
    if(q && !isNaN(Number(q))){
      const n = Number(q);
      push({id:`num-${n}`,kind:"num",label:String(n),sub:"number",action:"num",num:n}, 90);
    }
  }

  if(activeField==="type"){
    const TYPES = window.ELECTION_TYPES || [];
    for(const t of TYPES){
      const s = Math.max(score(q,t.label), score(q,t.short), score(q,t.id));
      if(s>0) push({id:`type-${t.id}`,kind:"type",label:t.label,sub:"election type",
        action:"setField", field:"type", value:t.id}, s);
    }
    // Selector alternative
    if(q==="" || score(q,"selector")>0 || q.startsWith("$")){
      const name = pickNextSelectorName(selectors);
      push({id:`sel-type`,kind:"selector",label:`$${name} — Election type selector`,
        sub:"adds a Ledger control for picking the type",
        action:"setField", field:"selType", value:name}, 30);
    }
  }
  else if(activeField==="year"){
    const curType = activeChip?.fields?.type;
    const ELS = (window.ELECTIONS||[]).filter(e=>!curType || e.typeId===curType);
    for(const e of ELS){
      const pool = [String(e.year), e.label, e.shortLabel];
      if(e.typeId==="pres") pool.push(`${e.year} ${e.round}`, `kierros ${e.round}`);
      let s = 0;
      for(const str of pool) s = Math.max(s, score(q,str));
      if(s>0){
        const lbl = e.typeId==="pres" ? `${e.year} · ${e.round===2?"2. kierros":"1. kierros"}` : String(e.year);
        push({id:`yr-${e.id}`,kind:"year",label:lbl, sub:e.label,
          action:"setField", field:"year", value:{year:e.year, round:e.round}}, s);
      }
    }
    if(q==="" || q.startsWith("$")){
      const name = pickNextSelectorName(selectors);
      push({id:`sel-year`,kind:"selector",label:`$${name} — Year selector`,
        sub:"adds a Ledger control for picking the year",
        action:"setField", field:"selYear", value:name}, 28);
    }
  }
  else if(activeField==="who"){
    // PARTIES first (primary — only ~10)
    const parties = window.partyList || [];
    for(const p of parties){
      const s = Math.max(score(q,p.name), score(q,p.abbr), score(q,p.id));
      if(s>0) push({id:`party-${p.id}`,kind:"party",label:p.name,sub:`party · ${p.abbr}`,
        action:"setField", field:"who", value:{party:p.id}}, s);
    }
    // CANDIDATES — only when user typed ≥2 chars (hundreds of names)
    if(q.length>=2 && window.candidatesFor){
      const elId = findElectionId(activeChip?.fields||{}) || "uus";
      const cands = window.candidatesFor(`uus__${elId}`, 200) || [];
      const CANDS_MAX = 6;
      const hits = [];
      for(const c of cands){
        const s = score(q, c.name);
        if(s>0) hits.push({c, s});
      }
      hits.sort((a,b)=>b.s-a.s);
      for(const {c,s} of hits.slice(0, CANDS_MAX)){
        out.push({id:`cand-${c.id}`,kind:"candidate",label:c.name,
          sub:`candidate · ${(window.PARTY_ABBR||{})[c.party]||c.party}`,
          action:"setField", field:"who", value:{candidate:{id:c.id,name:c.name,party:c.party}},
          score: s*0.9});
      }
    }
    if(q==="" || q.startsWith("$")){
      const name = pickNextSelectorName(selectors);
      push({id:`sel-who`,kind:"selector",label:`$${name} — Party/candidate selector`,
        sub:"adds a Ledger control",
        action:"setField", field:"selWho", value:name}, 25);
    }
  }

  out.sort((a,b)=>b.score-a.score);
  return out.slice(0, 8);
}

function pickNextSelectorName(selectors){
  const used = new Set((selectors||[]).map(s=>s.name));
  for(let i=0;i<26;i++){
    const n = String.fromCharCode(65+i);
    if(!used.has(n)) return n;
  }
  return "X";
}

// ─── UI bits ─────────────────────────────────────────────────────────
function ChipPill({chip, active, onRemove}){
  if(chip.kind==="op"){
    return <span style={{
      display:"inline-flex",alignItems:"center",padding:"3px 9px",
      border:"1.5px solid var(--ink)",background:"var(--ink)",color:"var(--paper)",
      borderRadius:4,fontFamily:"JetBrains Mono, monospace",fontSize:13,fontWeight:700,
      boxShadow: active?"0 0 0 2px rgba(26,26,26,0.35)":"none",
    }}>{chip.value}</span>;
  }
  if(chip.kind==="paren"){
    return <span style={{
      display:"inline-flex",padding:"3px 9px",border:"1.5px solid var(--line)",
      borderRadius:4,fontFamily:"JetBrains Mono, monospace",fontSize:13,
      boxShadow: active?"0 0 0 2px rgba(26,26,26,0.35)":"none",
    }}>{chip.value}</span>;
  }
  if(chip.kind==="num"){
    return <span style={{
      display:"inline-flex",padding:"3px 8px",border:"1.5px solid var(--line)",
      background:"var(--paper-2)",borderRadius:4,fontFamily:"JetBrains Mono, monospace",
      fontSize:13,
      boxShadow: active?"0 0 0 2px rgba(26,26,26,0.35)":"none",
    }}>{chip.value}</span>;
  }
  // chip
  const f = chip.fields || {};
  const hasSel = f.selType || f.selYear || f.selWho;
  const bg = f.who?.party ? `var(--p-${f.who.party})` : (hasSel ? "#f4e6c3" : "#e9e2cf");
  const color = f.who?.party ? "#fff" : "var(--ink)";
  const border = hasSel ? "var(--ink)" : "var(--line)";
  const borderStyle = hasSel ? "dashed" : "solid";
  return (
    <span title={chipFullText(f)} style={{
      display:"inline-flex",alignItems:"center",gap:5,padding:"3px 8px",
      border:`1.5px ${borderStyle} ${border}`,borderRadius:999,
      background:bg,color,fontSize:13,whiteSpace:"nowrap",
      boxShadow: active?"0 0 0 2px rgba(26,26,26,0.35)":"none",
    }}>
      {chipText(f)}
      {onRemove && <span onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();onRemove();}}
        style={{opacity:.7,fontSize:11,cursor:"pointer"}}>✕</span>}
    </span>
  );
}

function glyphFor(s){
  const box = {width:22,height:22,flex:"0 0 22px",border:"1.2px solid var(--line)",
    borderRadius:4,display:"inline-flex",alignItems:"center",justifyContent:"center",
    fontSize:12,fontFamily:"JetBrains Mono, monospace",background:"var(--paper)"};
  if(s.kind==="op"||s.kind==="paren") return <span style={{...box,background:"var(--ink)",color:"var(--paper)",fontWeight:700}}>{s.label}</span>;
  if(s.kind==="num") return <span style={box}>#</span>;
  if(s.kind==="type") return <span style={{...box,background:"var(--paper-2)"}}>T</span>;
  if(s.kind==="year") return <span style={{...box,background:"var(--paper-2)"}}>Y</span>;
  if(s.kind==="party"){
    const pid = s.id.replace(/^party-/,"");
    return <span style={{...box,background:`var(--p-${pid})`,borderColor:`var(--p-${pid})`}}/>;
  }
  if(s.kind==="candidate") return <span style={box}>◉</span>;
  if(s.kind==="selector") return <span style={{...box,background:"#f4e6c3",borderStyle:"dashed"}}>$</span>;
  return <span style={box}>•</span>;
}

// ─── Main composer ───────────────────────────────────────────────────
function FormulaComposer({tokens, setTokens, selectors, setSelectors}){
  const [value, setValue] = React.useState("");
  const [caret, setCaret] = React.useState(tokens.length);  // always at end for now
  const [open,  setOpen]  = React.useState(false);
  const [idx,   setIdx]   = React.useState(0);
  const inputRef = React.useRef(null);

  // The "active chip" = the trailing chip if incomplete, else null
  const lastChip = tokens[tokens.length-1];
  const activeChip = (lastChip && lastChip.kind==="chip" && !chipIsComplete(lastChip)) ? lastChip : null;
  const activeField = activeChip ? nextFieldFor(activeChip) : "type";

  React.useEffect(()=>{ setCaret(tokens.length); }, [tokens.length]);
  React.useEffect(()=>{ setIdx(0); }, [value, activeField]);

  const suggestions = React.useMemo(
    ()=>buildSuggestions(value, activeField, activeChip, selectors),
    [value, activeField, activeChip, selectors]
  );

  const focusInput = ()=>{ inputRef.current && inputRef.current.focus(); };

  const applyToActiveChip = (field, val)=>{
    setTokens(arr=>{
      const next = arr.slice();
      // If no active chip, create new
      if(!activeChip){
        const chip = {kind:"chip", fields:{}};
        if(field==="type") chip.fields.type = val;
        else if(field==="selType") chip.fields.selType = val;
        else if(field==="year"){ chip.fields.year = val.year; if(val.round) chip.fields.round = val.round; }
        else if(field==="selYear") chip.fields.selYear = val;
        else if(field==="who") chip.fields.who = val;
        else if(field==="selWho") chip.fields.selWho = val;
        next.push(chip);
      } else {
        const chip = {...activeChip, fields:{...activeChip.fields}};
        if(field==="type") chip.fields.type = val;
        else if(field==="selType") chip.fields.selType = val;
        else if(field==="year"){ chip.fields.year = val.year; if(val.round) chip.fields.round = val.round; }
        else if(field==="selYear") chip.fields.selYear = val;
        else if(field==="who") chip.fields.who = val;
        else if(field==="selWho") chip.fields.selWho = val;
        next[next.length-1] = chip;
      }
      return next;
    });
  };

  const registerSelector = (name, slot)=>{
    setSelectors(arr=>{
      if(arr.some(s=>s.name===name)) return arr;
      return [...arr, {name, slot, typeHint: activeChip?.fields?.type || null}];
    });
  };

  const accept = (s)=>{
    if(!s) return;
    if(s.action==="op"){
      setTokens(arr=>[...arr, {kind:"op", value:s.op}]);
    } else if(s.action==="paren"){
      setTokens(arr=>[...arr, {kind:"paren", value:s.paren}]);
    } else if(s.action==="num"){
      setTokens(arr=>[...arr, {kind:"num", value:s.num}]);
    } else if(s.action==="setField"){
      applyToActiveChip(s.field, s.value);
      if(s.field.startsWith("sel")){
        registerSelector(s.value, s.field);
      }
    }
    setValue("");
    setOpen(true);
    focusInput();
  };

  const onKeyDown = (e)=>{
    if(e.key==="ArrowDown"){ if(open && suggestions.length){ e.preventDefault(); setIdx(i=>Math.min(i+1,suggestions.length-1)); }}
    else if(e.key==="ArrowUp"){ if(open && suggestions.length){ e.preventDefault(); setIdx(i=>Math.max(i-1,0)); }}
    else if(e.key==="Enter"){ if(open && suggestions.length){ e.preventDefault(); accept(suggestions[idx]); }}
    else if(e.key==="Escape"){ setOpen(false); }
    else if(e.key==="Backspace" && value===""){
      // Strip last field off active chip; if empty chip/last op, remove it
      e.preventDefault();
      setTokens(arr=>{
        if(arr.length===0) return arr;
        const last = arr[arr.length-1];
        if(last.kind==="chip"){
          const stripped = stripLastField(last);
          if(stripped===null) return arr.slice(0,-1); // chip was just a type → remove
          return [...arr.slice(0,-1), stripped];
        }
        // op / paren / num → remove whole
        return arr.slice(0,-1);
      });
    }
    else if(e.key==="Delete" && value===""){
      // For now, Delete acts the same as backspace when caret is at end
      e.preventDefault();
      setTokens(arr=>{
        if(arr.length===0) return arr;
        const last = arr[arr.length-1];
        if(last.kind==="chip"){
          const stripped = stripLastField(last);
          if(stripped===null) return arr.slice(0,-1);
          return [...arr.slice(0,-1), stripped];
        }
        return arr.slice(0,-1);
      });
    }
  };

  const removeTokenAt = (i)=>{
    setTokens(arr=>arr.filter((_,j)=>j!==i));
  };

  // Placeholder — field-aware
  const fieldPrompt = activeField==="type" ? "election type… (e.g. Eduskuntavaalit)"
                    : activeField==="year" ? "year… (e.g. 2023)"
                    : activeField==="who"  ? "party or candidate…"
                    : "";

  const isEmpty = tokens.length===0 && value==="";

  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6,
        display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
        <span>Formula</span>
        <span style={{opacity:.7,textTransform:"none",letterSpacing:0,fontSize:11,fontStyle:"italic"}}>
          {activeChip
            ? <>Completing chip — next: <b style={{fontStyle:"normal"}}>{activeField}</b></>
            : <>Next: start a new operand or operator</>}
        </span>
      </div>

      <div
        onMouseDown={(e)=>{ if(e.target===e.currentTarget){ focusInput(); }}}
        style={{
          minHeight:60, border:"1.5px solid var(--line)", borderRadius:8,
          background:"var(--paper-2)", padding:10,
          display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",
          cursor:"text", position:"relative",
        }}>
        {tokens.map((t,i)=>(
          <ChipPill key={i} chip={t} onRemove={()=>removeTokenAt(i)}/>
        ))}
        <span style={{display:"inline-flex",alignItems:"center",position:"relative",flex:"1 1 180px",minWidth:180}}>
          <input
            ref={inputRef}
            value={value}
            placeholder={isEmpty ? 'Start typing — e.g. "eduskuntavaalit"' : fieldPrompt}
            onChange={e=>{ setValue(e.target.value); setOpen(true); }}
            onFocus={()=>setOpen(true)}
            onBlur={()=>setTimeout(()=>setOpen(false),150)}
            onKeyDown={onKeyDown}
            style={{
              flex:1,minWidth:120, border:"none", outline:"none", background:"transparent",
              fontFamily:"inherit", fontSize:14, padding:"3px 2px", color:"var(--ink)",
            }}
          />
        </span>

        {open && suggestions.length>0 && (
          <div style={{
            position:"absolute", zIndex:10, left:-1, right:-1, top:"calc(100% + 4px)",
            background:"var(--paper)", border:"1.5px solid var(--line)", borderRadius:6,
            boxShadow:"4px 4px 0 rgba(0,0,0,0.15)", maxHeight:280, overflowY:"auto",
          }}>
            {suggestions.map((s,i)=>(
              <div key={s.id}
                onMouseDown={(e)=>{ e.preventDefault(); accept(s); }}
                onMouseEnter={()=>setIdx(i)}
                style={{
                  display:"flex",alignItems:"center",gap:10,padding:"6px 10px",cursor:"pointer",
                  background: i===idx?"rgba(0,0,0,0.07)":"transparent",
                  borderTop: i===0?"none":"1px dotted var(--hair)",
                }}>
                {glyphFor(s)}
                <span style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:1}}>
                  <span style={{fontSize:13,lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.label}</span>
                  <span style={{fontSize:10,opacity:.55,lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.sub}</span>
                </span>
                {i===idx && <span style={{fontSize:10,opacity:.5,fontFamily:"JetBrains Mono, monospace"}}>↵</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selector ledger */}
      {selectors && selectors.length>0 && (
        <div style={{marginTop:10,padding:10,border:"1.5px dashed var(--line)",borderRadius:8,background:"var(--paper)"}}>
          <div style={{fontSize:10,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
            Selectors — bound by the viewer
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {selectors.map(s=>(
              <div key={s.name} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                <span style={{
                  display:"inline-flex",alignItems:"center",padding:"2px 7px",
                  border:"1.5px dashed var(--ink)",borderRadius:999,background:"#f4e6c3",
                  fontFamily:"JetBrains Mono, monospace",fontWeight:600,
                }}>${s.name}</span>
                <span style={{opacity:.65}}>
                  {s.slot==="selType" && "election type"}
                  {s.slot==="selYear" && "year"}
                  {s.slot==="selWho"  && "party / candidate"}
                </span>
                <span style={{marginLeft:"auto",fontSize:10,opacity:.5,fontStyle:"italic"}}>
                  Ledger control (viewer picks at runtime)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
        <span style={{fontSize:11,opacity:.55}}>
          {tokens.length} item{tokens.length===1?"":"s"}
        </span>
        <span style={{fontSize:11,opacity:.5,marginLeft:"auto"}}>
          ↵ accept · ↑↓ navigate · ⌫ delete last field · ✕ remove chip
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { FormulaComposer });

})();
