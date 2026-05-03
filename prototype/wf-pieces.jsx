// wf-pieces.jsx — reusable UI bits for the wireframe
const partyList = [
  {id:"kok",  name:"Kokoomus",         abbr:"Kok",  pct:21.3},
  {id:"sdp",  name:"SDP",              abbr:"SDP",  pct:19.7},
  {id:"ps",   name:"Perussuomalaiset", abbr:"PS",   pct:17.2},
  {id:"kesk", name:"Keskusta",         abbr:"Kesk", pct:11.1},
  {id:"vihr", name:"Vihreät",          abbr:"Vihr", pct:7.3},
  {id:"vas",  name:"Vasemmistoliitto", abbr:"Vas",  pct:7.1},
  {id:"rkp",  name:"RKP",              abbr:"RKP",  pct:4.3},
  {id:"kd",   name:"KD",               abbr:"KD",   pct:3.4},
];
const PARTY_NAME = Object.fromEntries(partyList.map(p=>[p.id, p.name]));
const PARTY_ABBR = Object.fromEntries(partyList.map(p=>[p.id, p.abbr]));

function Crumb({path, onJump}){
  return (
    <div className="crumb">
      {path.map((p,i)=>{
        const isLast = i===path.length-1;
        const isRoot = i===0;
        const label = (isRoot && p==="Suomi") ? "Koko Suomi" : p;
        // Root is always rendered as a pill button so it looks clickable, even when it's also the current node.
        if(isRoot){
          return (
            <React.Fragment key={i}>
              <span
                onClick={()=>onJump&&onJump(i)}
                style={{
                  display:"inline-flex",alignItems:"center",gap:4,
                  whiteSpace:"nowrap",
                  fontSize:13,padding:"4px 10px",borderRadius:999,
                  border:"1.2px solid var(--line)",
                  background: isLast ? "var(--ink)" : "var(--paper)",
                  color: isLast ? "var(--paper)" : "var(--ink)",
                  cursor:onJump?"pointer":"default",
                  boxShadow:"1.5px 1.5px 0 rgba(0,0,0,0.08)",
                  fontWeight: isLast?600:400,
                }}>
                <span style={{fontSize:12,opacity:.8}}>⌂</span>
                {label}
              </span>
              {!isLast && <span className="sep">›</span>}
            </React.Fragment>
          );
        }
        if(isLast){
          return (
            <React.Fragment key={i}>
              <span className="sep">›</span>
              <span className="h"
                onClick={()=>onJump&&onJump(i)}
                style={{fontSize:18,fontWeight:700,whiteSpace:"nowrap",cursor:onJump?"pointer":"default"}}>
                {label}
              </span>
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={i}>
            <span className="sep">›</span>
            <span
              onClick={()=>onJump&&onJump(i)}
              style={{
                display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap",
                fontSize:13,padding:"4px 10px",borderRadius:999,
                border:"1.2px solid var(--line)",background:"var(--paper)",
                cursor:onJump?"pointer":"default",
                boxShadow:"1.5px 1.5px 0 rgba(0,0,0,0.08)"
              }}>
              {label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ColorModeTabs({value, onChange, compact=false}){
  const opts = [
    {id:"winner", label:"Biggest party"},
    {id:"support",label:"Party support"},
    {id:"change", label:"Change in support"},
    {id:"votes",  label:"Total votes"},
  ];
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
      {opts.map(o=>(
        <span key={o.id}
          className={"pill "+(value===o.id?"on":"")}
          onClick={()=>onChange&&onChange(o.id)}
          style={{cursor:"pointer",fontSize:compact?12:13}}>
          {o.label}
        </span>
      ))}
    </div>
  );
}

function ElectionPicker({value="ek2027", onChange, compact=false}){
  // Two-part selector:
  //   1) Election TYPE (kuntavaalit / aluevaalit / eduskuntavaalit / eurovaalit / presidentinvaalit)
  //   2) Specific election — year, or year+round for presidentinvaalit
  const ELS    = window.ELECTIONS || [];
  const TYPES  = window.ELECTION_TYPES || [];
  const BY_ID  = window.ELECTION_BY_ID || {};
  const ofType = window.electionsOfType || (()=>[]);
  const defaultForType = window.defaultElectionForType || (()=>null);

  const current = BY_ID[value] || ELS[0];
  const typeId  = current ? current.typeId : "ek";

  const selectStyle = {
    border:"1.5px solid var(--line)",background:"var(--paper)",
    padding:"5px 8px",borderRadius:6,fontFamily:"inherit",
    fontSize:compact?12:13,
  };

  const handleTypeChange = (newType)=>{
    // If current election doesn't belong to the new type, snap to newest in that type.
    const keep = current && current.typeId===newType ? current.id : defaultForType(newType);
    if(keep && onChange) onChange(keep);
  };

  const typeElections = ofType(typeId);

  // Per-election label: presidential rounds get a "2024 · 1. kierros" form;
  // everything else is just the year.
  const electionOptionLabel = (e)=>{
    if(e.typeId==="pres") return `${e.year} · ${e.round===2?"2. kierros":"1. kierros"}`;
    return String(e.year);
  };

  return (
    <span style={{display:"inline-flex",gap:6,alignItems:"center"}}>
      <select value={typeId} onChange={e=>handleTypeChange(e.target.value)} style={selectStyle}>
        {TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <select value={value} onChange={e=>onChange&&onChange(e.target.value)} style={selectStyle}>
        {typeElections.map(e=>(
          <option key={e.id} value={e.id}>{electionOptionLabel(e)}</option>
        ))}
      </select>
    </span>
  );
}

function HeaderBar({title="Vaalikartta", subtitle, right}){
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"10px 16px",borderBottom:"1.5px solid var(--line)",background:"var(--paper-2)"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:28,height:28,border:"1.5px solid var(--line)",borderRadius:6,
          display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Caveat",fontWeight:700}}>V</div>
        <div>
          <div className="h" style={{fontSize:22,lineHeight:1}}>{title}</div>
          {subtitle && <div style={{fontSize:12,opacity:.7}}>{subtitle}</div>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>{right}</div>
    </div>
  );
}

// MapControls: zoom + nav buttons. Zoom actually works via onZoomIn/Out handlers.
function MapControls({canGoUp, canGoDown, onUp, onDown, onZoomIn, onZoomOut, zoom=1}){
  const btn = {width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",
    border:"1.2px solid var(--line)",borderRadius:6,background:"var(--paper)",cursor:"pointer",fontSize:16,
    userSelect:"none"};
  const disabled = {opacity:.35,cursor:"not-allowed"};
  const zoomInDisabled = zoom >= 3;
  const zoomOutDisabled = zoom <= 1;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <div style={{...btn, ...(zoomInDisabled?disabled:{})}} onClick={zoomInDisabled?undefined:onZoomIn} title="Zoom in">＋</div>
      <div style={{...btn, ...(zoomOutDisabled?disabled:{})}} onClick={zoomOutDisabled?undefined:onZoomOut} title="Zoom out">−</div>
      <div style={{fontSize:10,textAlign:"center",opacity:.6,fontFamily:"JetBrains Mono, monospace"}}>{zoom.toFixed(1)}×</div>
      <div style={{height:2}}/>
      <div style={{...btn, ...(canGoUp?{}:disabled)}} onClick={canGoUp?onUp:undefined} title="Go up one hierarchy">↑</div>
      <div style={{...btn, ...(canGoDown?{}:disabled)}} onClick={canGoDown?onDown:undefined} title="Drill into selection">↓</div>
    </div>
  );
}

// Dynamic legend — shows only parties/colors actually present in current view
function DynamicLegend({mode, level, parentId, focusParty, winners, election, refElection, compareMode, formulaTokens, formulaRange}){
  if(mode==="winner"){
    const parties = (winners||[]).sort((a,b)=>partyList.findIndex(p=>p.id===a)-partyList.findIndex(p=>p.id===b));
    return (
      <div>
        <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
          Winning party · {parties.length} in view
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:12}}>
          {parties.map(pid=>(
            <span key={pid} style={{display:"inline-flex",alignItems:"center",gap:5}}>
              <span className="swatch" style={{background:`var(--p-${pid})`}}/>
              {PARTY_NAME[pid]}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if(mode==="change"){
    const EL = (window.ELECTION_LABELS||{});
    const measureLabel = compareMode==="votes" ? "Total vote change" : "Percentage-point change";
    const scaleLabels = compareMode==="votes"
      ? ["−5k","0","+5k"]
      : ["−6 pp","0","+6 pp"];
    return (
      <div style={{fontSize:12}}>
        <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
          {measureLabel} {focusParty?`· ${PARTY_NAME[focusParty]}`:"· Winner"}
          {refElection && election && (
            <div style={{fontSize:10,opacity:.7,textTransform:"none",letterSpacing:0,fontWeight:400,marginTop:2}}>
              {EL[refElection]||refElection} → {EL[election]||election}
            </div>
          )}
        </div>
        <div style={{height:10,border:"1px solid var(--line)",borderRadius:2,
          background:"linear-gradient(90deg,#7d3c98,#f4f0e6,#d97706)"}}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:3}} className="mono">
          <span>{scaleLabels[0]}</span><span>{scaleLabels[1]}</span><span>{scaleLabels[2]}</span>
        </div>
      </div>
    );
  }
  if(mode==="support"){
    return (
      <div style={{fontSize:12}}>
        <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
          Party support {focusParty?`· ${PARTY_NAME[focusParty]}`:""}
        </div>
        <div style={{height:10,border:"1px solid var(--line)",borderRadius:2,
          background:"linear-gradient(90deg,#f4f0e6,#1f5a9c)"}}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:3}} className="mono">
          <span>0%</span><span>25%</span><span>50%+</span>
        </div>
      </div>
    );
  }
  if(mode==="votes"){
    return (
      <div style={{fontSize:12}}>
        <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
          Total votes cast
        </div>
        <div style={{height:10,border:"1px solid var(--line)",borderRadius:2,
          background:"linear-gradient(90deg,#f4f0e6,#6f5f1f)"}}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:3}} className="mono">
          <span>0</span><span>100k</span><span>250k+</span>
        </div>
      </div>
    );
  }
  if(mode==="formula"){
    const framing = (formulaRange && formulaRange.framing) || "absolute";
    const suffix = (framing==="share" || framing==="vsSelected") ? "%" : "";
    const fmt = (v)=>{
      if(v==null||!isFinite(v)) return "—";
      const a = Math.abs(v);
      if(a>=10000) return (v/1000).toFixed(1)+"k"+suffix;
      const sign = (framing==="vsSelected" && v>0) ? "+" : "";
      if(a>=100) return sign+v.toFixed(0)+suffix;
      return sign+v.toFixed(1)+suffix;
    };
    const hasRange = formulaRange && isFinite(formulaRange.min) && isFinite(formulaRange.max);
    const diverging = hasRange && formulaRange.min < 0 && formulaRange.max > 0;
    const summary = (window.formulaSummary && formulaTokens)
      ? window.formulaSummary(formulaTokens)
      : "";
    const framingLabel = framing==="share" ? "shown as % of total"
      : framing==="vsSelected" ? "shown vs. selected"
      : null;
    return (
      <div style={{fontSize:12}}>
        <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
          Custom formula
        </div>
        {summary && (
          <div style={{
            fontSize:11,opacity:.8,marginBottom:8,
            fontFamily:"JetBrains Mono, monospace",
            wordBreak:"break-word",lineHeight:1.4
          }}>
            ƒ {summary}
          </div>
        )}
        {framingLabel && (
          <div style={{fontSize:11,opacity:.6,marginBottom:8,fontStyle:"italic"}}>
            {framingLabel}
          </div>
        )}
        <div style={{
          height:10,border:"1px solid var(--line)",borderRadius:2,
          background: diverging
            ? "linear-gradient(90deg,#6a2c91,#b98ecb,#f0ead8,#f0a860,#c86a10)"
            : "linear-gradient(90deg,#f4f0e6,#1f5a9c)"
        }}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:3}} className="mono">
          <span>{hasRange ? fmt(formulaRange.min) : "min"}</span>
          {diverging && <span>0</span>}
          <span>{hasRange ? fmt(formulaRange.max) : "max"}</span>
        </div>
      </div>
    );
  }
  return null;
}

Object.assign(window, { partyList, PARTY_NAME, PARTY_ABBR, Crumb, ColorModeTabs, ElectionPicker, HeaderBar, MapControls, DynamicLegend });
