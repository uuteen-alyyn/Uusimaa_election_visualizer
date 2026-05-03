// wf-variants.jsx — V2 focused build with hierarchical drill-down
//
// Feedback addressed (round 2):
// - Coloring mode tabs moved next to breadcrumb/header context (logical grouping)
// - +/− zoom buttons actually work via CSS transform on the SVG
// - Replaced misleading 3-stat header with a prominent TOTAL VOTES big number
// - Candidates list shows a visible scrollbar track
// - After ↓ (or double-click), the visualizer auto-selects the first child of
//   the drilled-into region so the user can keep going down
// - Tab / Shift-Tab toggles selection between sibling regions at the same level

// Candidate generator (deterministic per-region)
const FIRST = ["Anna","Mikko","Sanna","Jussi","Laura","Petteri","Kaisa","Aleksi","Minna","Antti","Elina","Ville","Riikka","Tuomas","Henna","Olli","Saana","Matti","Jenni","Timo","Iida","Pekka","Heidi","Lauri","Noora","Janne","Suvi","Juha","Maria","Kari","Mari","Eero","Tiina","Mika","Siiri","Aino","Joonas","Essi","Risto","Emma"];
const LAST  = ["Virtanen","Korhonen","Mäkinen","Nieminen","Mäkelä","Hämäläinen","Laine","Heikkinen","Koskinen","Järvinen","Lehtonen","Lehtinen","Saarinen","Salminen","Heinonen","Niemi","Heikkilä","Kinnunen","Turunen","Salonen","Salo","Laitinen","Tuominen","Rantanen","Karjalainen","Jokinen","Mattila","Aalto","Leppänen","Väisänen"];

function candidatesFor(id, count=40){
  const r = rng(hashStr(id+"cands"));
  const shares = regionData(id).shares;
  const totalVotes = regionData(id).votes;
  const arr = [];
  for(let i=0;i<count;i++){
    const partyIdx = (()=>{
      let pick=r(),acc=0;
      for(let j=0;j<PARTY_IDS.length;j++){acc+=shares[j]/100;if(pick<acc) return j;}
      return 0;
    })();
    const fn = FIRST[Math.floor(r()*FIRST.length)];
    const ln = LAST[Math.floor(r()*LAST.length)];
    const votes = Math.max(40, Math.round(r()*totalVotes*0.02 * (1 - i/(count*1.4))));
    arr.push({id:`${id}_c${i}`, name:`${fn} ${ln}`, party:PARTY_IDS[partyIdx], votes});
  }
  return arr.sort((a,b)=>b.votes-a.votes);
}

// Small label used alongside select/pill controls in the context bar.
function ParamLabel({children}){
  return (
    <span style={{fontSize:10,opacity:.55,textTransform:"uppercase",letterSpacing:.6,fontWeight:500}}>
      {children}
    </span>
  );
}

// Compact download dropdown — shown next to "Share link" on row 1.
function DownloadMenu({onMapPng, onMapSvg, onDashboardPng}){
  const [open, setOpen] = React.useState(false);
  React.useEffect(()=>{
    if(!open) return;
    const close = ()=>setOpen(false);
    window.addEventListener("click", close);
    return ()=>window.removeEventListener("click", close);
  }, [open]);
  const itemSt = {
    display:"flex", alignItems:"center", gap:8, padding:"6px 10px",
    fontSize:12, cursor:"pointer", borderRadius:4, whiteSpace:"nowrap",
  };
  const onItem = (fn)=>(e)=>{
    e.stopPropagation();
    setOpen(false);
    setTimeout(fn, 0);
  };
  return (
    <span style={{position:"relative", flexShrink:0}}
      onClick={(e)=>e.stopPropagation()}>
      <span
        onClick={()=>setOpen(o=>!o)}
        title="Download the map or dashboard"
        className="pill"
        style={{
          cursor:"pointer",fontSize:11,opacity:.8,
          borderStyle:"dotted",background:"transparent",
          display:"inline-flex",alignItems:"center",gap:4,
        }}>
        <span style={{fontSize:11,lineHeight:1}}>↓</span>
        Download
      </span>
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:25,
          minWidth:200, padding:6, background:"var(--paper)",
          border:"1.5px solid var(--line)", borderRadius:8,
          boxShadow:"4px 4px 0 rgba(0,0,0,0.15)",
        }}>
          <div style={{fontSize:10, opacity:.6, padding:"4px 10px 2px",
            textTransform:"uppercase", letterSpacing:.5}}>Map only</div>
          <div style={itemSt} onClick={onItem(onMapPng)}
            onMouseEnter={(e)=>e.currentTarget.style.background="rgba(0,0,0,0.06)"}
            onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
            <span style={{fontFamily:"JetBrains Mono, monospace",fontSize:10,opacity:.6,width:32}}>PNG</span>
            <span>Map as PNG</span>
          </div>
          <div style={itemSt} onClick={onItem(onMapSvg)}
            onMouseEnter={(e)=>e.currentTarget.style.background="rgba(0,0,0,0.06)"}
            onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
            <span style={{fontFamily:"JetBrains Mono, monospace",fontSize:10,opacity:.6,width:32}}>SVG</span>
            <span>Map as SVG</span>
          </div>
          <div style={{height:1, background:"var(--hair)", margin:"4px 6px"}}/>
          <div style={{fontSize:10, opacity:.6, padding:"2px 10px 2px",
            textTransform:"uppercase", letterSpacing:.5}}>Whole view</div>
          <div style={itemSt} onClick={onItem(onDashboardPng)}
            onMouseEnter={(e)=>e.currentTarget.style.background="rgba(0,0,0,0.06)"}
            onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
            <span style={{fontFamily:"JetBrains Mono, monospace",fontSize:10,opacity:.6,width:32}}>PNG</span>
            <span>Dashboard as PNG</span>
          </div>
        </div>
      )}
    </span>
  );
}

function V2_Focused({
  election, setElection, mode, setMode, focusParty, setFocusParty,
  refElection, setRefElection,
  formulaTokens, rawFormulaTokens, formulaBindings, setFormulaBindings,
  workflows, activeWorkflow, onApplyWorkflow, onSaveWorkflow, onUpdateWorkflow, onDeleteWorkflow,
  onCopyShareLink,
}){
  const [path, setPath] = React.useState([{level:"maa", id:null, label:"Suomi"}]);
  const [selected, setSelected] = React.useState(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({x:0,y:0});
  const panState = React.useRef({dragging:false, sx:0, sy:0, ox:0, oy:0, moved:false});

  // Workflow builder popover. `editingWorkflow` is the custom workflow being
  // edited, or null for a new-from-scratch flow.
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [editingWorkflow, setEditingWorkflow] = React.useState(null);
  const builderAnchorRef = React.useRef(null);
  // Collapse the workflow + parameter rows to give the map more room when the
  // user has a lot of modes / selectors. The active mode is unaffected.
  const [chromeCollapsed, setChromeCollapsed] = React.useState(false);
  // For the "Change in support" workflow: compare by percentage-point swing
  // or by absolute vote delta. Only visible when mode==="change".
  const [compareMode, setCompareMode] = React.useState("pp"); // "pp" | "votes"
  // Formula framing — how raw per-region values are normalised for display.
  //   "absolute"   raw values
  //   "share"      each region's value as % of sum across visible regions
  //   "vsSelected" each region as % difference from currently-selected region
  const [formulaFraming, setFormulaFraming] = React.useState("absolute");

  const currentLevel  = path[path.length-1].level;
  const currentParent = path[path.length-1].id;

  let showLevel, showParent;
  if(currentLevel==="maa"){ showLevel="vp"; showParent=null; }
  else if(currentLevel==="vp"){ showLevel="kunta"; showParent=currentParent; }
  else if(currentLevel==="kunta"){ showLevel="aa"; showParent=currentParent; }
  else { showLevel="aa"; showParent=currentParent; }

  // Siblings at current level (for Tab cycling)
  const siblings = React.useMemo(()=>{
    if(showLevel==="vp") return VAALIPIIRIT.map(v=>v.id);
    if(showLevel==="kunta") return (KUNNAT[showParent]||[]).map(m=>m.id);
    return makeAanestysalueet(showParent||"",16).map(a=>a.id);
  }, [showLevel, showParent]);

  const labelFor = (level, id)=>{
    if(level==="vp") return VP_BY_ID[id]?.label || id;
    if(level==="kunta"){
      for(const k of Object.keys(KUNNAT)) for(const m of KUNNAT[k]) if(m.id===id) return m.label;
      return id;
    }
    if(level==="aa"){
      const n = id?.split("_aa")[1];
      return n!=null ? `Äänestysalue ${String(+n+1).padStart(3,"0")}` : id;
    }
    return id;
  };

  // drill-down: push selected into path, AUTO-SELECT first child
  const drillDownInto = (id)=>{
    if(showLevel==="aa") return; // deepest
    const nextLevel = showLevel;
    const newPath = [...path, {level:nextLevel, id, label:labelFor(nextLevel,id)}];
    setPath(newPath);
    // Compute children of new node and auto-select first
    let children=[];
    if(nextLevel==="vp") children = (KUNNAT[id]||[]).map(m=>m.id);
    else if(nextLevel==="kunta") children = makeAanestysalueet(id,16).map(a=>a.id);
    setSelected(children[0] || null);
    setZoom(1);
  };
  const goUp = ()=>{
    if(path.length<=1) return;
    const popped = path[path.length-1];
    setPath(p=>p.slice(0,-1));
    setSelected(popped.id); // restore parent-as-selection in the now-current level
    setZoom(1);
  };
  const goDown = ()=>{ if(selected) drillDownInto(selected); };

  // Open a sub-region from the Näytä ala-alueet dropdown. The dropdown lists
  // children of the currently-selected region (e.g. kunnat of Uusimaa, or
  // äänestysalueet of Espoo). Clicking one means: drill into the selected
  // parent so we're looking at that level, then highlight the chosen child.
  const drillIntoChild = (childId)=>{
    if(!selected) return;
    if(showLevel==="aa") return; // already deepest
    const parentLevel = showLevel;                     // vp or kunta
    const newPath = [...path, {level:parentLevel, id:selected, label:labelFor(parentLevel,selected)}];
    setPath(newPath);
    setSelected(childId);
    setZoom(1);
  };
  const jumpTo = (idx)=>{ setPath(p=>p.slice(0,idx+1)); setSelected(null); setZoom(1); };

  const canGoUp = path.length>1;
  const canGoDown = !!selected && showLevel!=="aa";

  // Tab cycling between siblings
  const mapAreaRef = React.useRef(null);
  React.useEffect(()=>{
    const el = mapAreaRef.current;
    if(!el) return;
    const onKey = (e)=>{
      if(e.key!=="Tab") return;
      e.preventDefault();
      if(!siblings.length) return;
      const i = siblings.indexOf(selected);
      const next = e.shiftKey
        ? (i<=0 ? siblings.length-1 : i-1)
        : ((i+1) % siblings.length);
      setSelected(siblings[next]);
    };
    el.addEventListener("keydown", onKey);
    return ()=>el.removeEventListener("keydown", onKey);
  }, [siblings, selected]);

  // Non-passive wheel listener so preventDefault actually works for zooming,
  // and so wheel events originating inside a scrollable overlay (dropdown,
  // candidate list) are NOT captured for zoom.
  React.useEffect(()=>{
    const el = mapAreaRef.current;
    if(!el) return;
    const onWheel = (e)=>{
      // If the wheel event started inside a scrollable panel, let it scroll
      // that panel instead of zooming the map.
      let n = e.target;
      while(n && n !== el){
        if(n.dataset && n.dataset.scrollable==="1") return;
        n = n.parentNode;
      }
      e.preventDefault();
      const dir = e.deltaY<0 ? 1 : -1;
      setZoom(z=>{
        const next = +(z + dir*0.15).toFixed(2);
        return Math.max(1, Math.min(3, next));
      });
    };
    el.addEventListener("wheel", onWheel, { passive:false });
    return ()=>el.removeEventListener("wheel", onWheel);
  }, []);

  const ledgerId = selected || currentParent;
  const ledgerLabel = selected ? labelFor(showLevel, selected) : path[path.length-1].label;

  // Sub-regions popover state + which regions are children of the selected one.
  const [subOpen, setSubOpen] = React.useState(false);
  const subRef = React.useRef(null);
  React.useEffect(()=>{
    if(!subOpen) return;
    const onDown = (e)=>{
      if(subRef.current && !subRef.current.contains(e.target)) setSubOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return ()=>document.removeEventListener("mousedown", onDown);
  }, [subOpen]);
  const subRegions = React.useMemo(()=>{
    if(!selected || showLevel==="aa") return [];
    if(showLevel==="vp") return (KUNNAT[selected]||[]).map(m=>({id:m.id,label:m.label}));
    if(showLevel==="kunta") return makeAanestysalueet(selected,16).map(a=>({id:a.id,label:a.label}));
    return [];
  }, [selected, showLevel]);
  const subRegionType = showLevel==="vp" ? "kunnat" : showLevel==="kunta" ? "äänestysalueet" : "";
  React.useEffect(()=>{ setSubOpen(false); }, [selected, showLevel]);
  const ledgerType = selected
    ? (showLevel==="vp"?"Vaalipiiri":showLevel==="kunta"?"Kunta":"Äänestysalue")
    : (currentLevel==="maa"?"Koko maa":currentLevel==="vp"?"Vaalipiiri":currentLevel==="kunta"?"Kunta":"Äänestysalue");

  const data = ledgerId ? regionData(ledgerId) : regionData("suomi");
  const cands = ledgerId ? candidatesFor(ledgerId,40) : candidatesFor("suomi",40);
  const winners = React.useMemo(()=>winnersInView(showLevel, showParent), [showLevel, showParent]);

  // Formula support: compute range across visible regions, plus an `extra`
  // bundle threaded into the map/legend so colors auto-scale.
  const formulaRangeVal = React.useMemo(()=>{
    if(mode!=="formula" || !formulaTokens || !formulaTokens.length) return null;
    return window.formulaRange
      ? window.formulaRange(formulaTokens, showLevel, showParent, formulaFraming, selected)
      : null;
  }, [mode, formulaTokens, showLevel, showParent, formulaFraming, selected]);
  const mapExtra = mode==="formula"
    ? {formulaTokens, formulaRange: formulaRangeVal,
       formulaFraming, formulaFramingRef: selected,
       level: showLevel, parent: showParent}
    : null;
  // vsSelected only makes sense when there's a selection; auto-fall-back.
  React.useEffect(()=>{
    if(formulaFraming==="vsSelected" && !selected){
      setFormulaFraming("absolute");
    }
  }, [formulaFraming, selected]);

  const artboardRef = React.useRef(null);

  // Find the live <svg> map element under the map area, clone it as a
  // standalone document with its computed defs intact, and trigger a
  // download. Format: "svg" or "png".
  const downloadMap = (format)=>{
    const svg = mapAreaRef.current && mapAreaRef.current.querySelector("svg");
    if(!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    // Inline a couple of CSS variables the map references for stroke colors.
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue("--ink").trim() || "#1a1a1a";
    const paper = cs.getPropertyValue("--paper").trim() || "#f7f1e1";
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg","style");
    styleEl.textContent = `:root{--ink:${ink};--paper:${paper};} text{font-family:Architects Daughter, system-ui;}`;
    clone.insertBefore(styleEl, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
    if(format==="svg"){
      const blob = new Blob([xml], {type:"image/svg+xml;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `map-${stamp}.svg`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
    } else {
      const w = svg.viewBox.baseVal.width || svg.clientWidth || 800;
      const h = svg.viewBox.baseVal.height || svg.clientHeight || 800;
      const scale = 2;
      const blob = new Blob([xml], {type:"image/svg+xml;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w*scale); canvas.height = Math.round(h*scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = paper; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b)=>{
          const u = URL.createObjectURL(b);
          const a = document.createElement("a");
          a.href = u; a.download = `map-${stamp}.png`;
          a.click();
          setTimeout(()=>{URL.revokeObjectURL(u); URL.revokeObjectURL(url);}, 1000);
        }, "image/png");
      };
      img.src = url;
    }
  };

  // Rasterize the entire artboard (map + legend + ledger).
  const downloadDashboard = ()=>{
    const node = artboardRef.current;
    if(!node) return;
    const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
    const lib = window.htmlToImage;
    if(!lib){
      alert("Dashboard PNG export needs the html-to-image library, which didn't load. Use the Map PNG / SVG options instead.");
      return;
    }
    lib.toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#f7f1e1",
    }).then((dataUrl)=>{
      const a = document.createElement("a");
      a.href = dataUrl; a.download = `dashboard-${stamp}.png`;
      a.click();
    }).catch((err)=>{
      console.error(err);
      alert("Sorry — couldn't capture the dashboard. The map PNG/SVG options should still work.");
    });
  };

  return (
    <div className="wf" ref={artboardRef} style={{width:1280,height:820}}>
      <HeaderBar title="Vaalit — tulosvisualisointi"
        subtitle="Click+drag to pan · Mousewheel to zoom · Double-click or ↓ to drill down · Tab to cycle siblings"
        right={null}/>

      <div style={{display:"grid",gridTemplateColumns:"1fr 420px",height:"calc(100% - 62px)"}}>

        {/* LEFT: MAP */}
        <div style={{position:"relative",borderRight:"1.5px solid var(--line)",display:"flex",flexDirection:"column"}}>

          {/* Context bar — row 1: breadcrumb + collapse toggle. row 2: workflow bar. row 3: per-mode parameter controls. */}
          <div style={{padding:"10px 16px",borderBottom:"1.5px dashed var(--hair)",display:"flex",flexDirection:"column",gap:8}}>
            <div style={{minHeight:30,display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <Crumb path={path.map(p=>p.label)} onJump={jumpTo}/>
              </div>
              <span
                onClick={()=>setChromeCollapsed(c=>!c)}
                title={chromeCollapsed ? "Show workflows and parameters" : "Hide workflows and parameters"}
                className="pill"
                style={{
                  cursor:"pointer",fontSize:11,opacity:.8,
                  borderStyle:"dotted",background:"transparent",
                  display:"inline-flex",alignItems:"center",gap:4,flexShrink:0,
                }}>
                <span style={{fontSize:11,lineHeight:1,transform:chromeCollapsed?"rotate(-90deg)":"none",transition:"transform 120ms"}}>▾</span>
                {chromeCollapsed ? "Show controls" : "Hide controls"}
              </span>
              {onCopyShareLink && (
                <span
                  onClick={onCopyShareLink}
                  title="Copy a link that reproduces this view"
                  className="pill"
                  style={{
                    cursor:"pointer",fontSize:11,opacity:.8,
                    borderStyle:"dotted",background:"transparent",
                    display:"inline-flex",alignItems:"center",gap:4,flexShrink:0,
                  }}>
                  <span style={{fontSize:11,lineHeight:1}}>↗</span>
                  Share link
                </span>
              )}
              <DownloadMenu
                onMapPng={()=>downloadMap("png")}
                onMapSvg={()=>downloadMap("svg")}
                onDashboardPng={downloadDashboard}/>
            </div>

            {!chromeCollapsed && (<>
            {/* Row 2 — Workflow bar */}
            <div style={{display:"flex",alignItems:"center",gap:8,minHeight:30,position:"relative",flexWrap:"wrap"}}>
              <WorkflowBar
                workflows={workflows}
                activeWorkflow={activeWorkflow}
                onApply={onApplyWorkflow}
                onOpenBuilder={()=>{ setEditingWorkflow(null); setBuilderOpen(o=>!o); }}
                onEdit={(w)=>{ setEditingWorkflow(w); setBuilderOpen(true); }}
                onDelete={onDeleteWorkflow}
              />
              {builderOpen && (
                <WorkflowBuilder
                  initial={editingWorkflow ||
                    {kind:mode, election, refElection, party:focusParty||"kok", formula:[]}}
                  onApply={onApplyWorkflow}
                  onSave={onSaveWorkflow}
                  onUpdate={onUpdateWorkflow}
                  onClose={()=>{ setBuilderOpen(false); setEditingWorkflow(null); }}
                />
              )}
            </div>

            {/* Row 3 — Parameters for the active workflow kind */}
            <div style={{display:"flex",alignItems:"center",gap:8,minHeight:30,flexWrap:"wrap"}}>
              {mode==="formula" && (()=>{
                // Pull selectors out of the raw formula (with sel* fields intact).
                const sels = [];
                const seen = new Set();
                (rawFormulaTokens||[]).forEach(t=>{
                  if(t.kind!=="chip") return;
                  const f = t.fields||{};
                  if(f.selType && !seen.has(f.selType)){ seen.add(f.selType); sels.push({name:f.selType, slot:"type"}); }
                  if(f.selYear && !seen.has(f.selYear)){ seen.add(f.selYear); sels.push({name:f.selYear, slot:"year"}); }
                  if(f.selWho  && !seen.has(f.selWho )){ seen.add(f.selWho ); sels.push({name:f.selWho,  slot:"who"}); }
                });
                if(sels.length===0) return null;
                const bind = (name, patch)=>{
                  setFormulaBindings(prev=>({...prev, [name]:{...(prev[name]||{}), ...patch}}));
                };
                const TYPES = window.ELECTION_TYPES || [];
                const ELS   = window.ELECTIONS || [];
                const parties = window.partyList || [];
                const selectSt = {
                  border:"none", borderBottom:"1.5px dotted var(--ink)",
                  background:"transparent",
                  padding:"2px 4px", borderRadius:0,
                  fontFamily:"inherit", fontSize:12,
                  cursor:"pointer", color:"var(--ink)",
                  appearance:"none", WebkitAppearance:"none", MozAppearance:"none",
                };
                const selectorLabels = (activeWorkflow && activeWorkflow.selectorLabels) || {};
                return (
                  <>
                    <ParamLabel>Selectors</ParamLabel>
                    {sels.map(s=>{
                      const b = formulaBindings[s.name] || {};
                      const friendly = (selectorLabels[s.name] || "").trim();
                      return (
                        <span key={s.name} style={{
                          display:"inline-flex",alignItems:"center",gap:6,
                          padding:"2px 8px 2px 4px",border:"1.5px dashed var(--ink)",
                          borderRadius:999,background:"#f4e6c3",
                        }}>
                          <span style={{fontFamily:"JetBrains Mono, monospace",fontWeight:700,fontSize:11}}>${s.name}</span>
                          {friendly && (
                            <span style={{fontSize:11,opacity:.75,fontStyle:"italic"}}>{friendly}</span>
                          )}
                          {s.slot==="type" && (
                            <select value={b.type||""} onChange={e=>bind(s.name,{type:e.target.value})}
                              style={selectSt}>
                              <option value="">— pick type —</option>
                              {TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                          )}
                          {s.slot==="year" && (
                            <select value={b.year? `${b.year}_${b.round||1}` : ""}
                              onChange={e=>{
                                const v = e.target.value;
                                if(!v){ bind(s.name,{year:undefined,round:undefined}); return; }
                                const [yr,rd] = v.split("_").map(Number);
                                bind(s.name,{year:yr, round:rd});
                              }}
                              style={selectSt}>
                              <option value="">— pick year —</option>
                              {ELS.map(e=>(
                                <option key={e.id} value={`${e.year}_${e.round||1}`}>
                                  {e.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {s.slot==="who" && (
                            <select value={b.who?.party || ""}
                              onChange={e=>bind(s.name,{who:e.target.value?{party:e.target.value}:undefined})}
                              style={selectSt}>
                              <option value="">— pick party —</option>
                              {parties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </span>
                      );
                    })}
                  </>
                );
              })()}

              {mode==="formula" && (
                <>
                  <div style={{width:1,height:22,background:"var(--hair)",marginLeft:4}}/>
                  <ParamLabel>Show as</ParamLabel>
                  <div style={{display:"flex",gap:4}}>
                    {[
                      {id:"absolute",   label:"Absolute"},
                      {id:"share",      label:"% of total"},
                      {id:"vsSelected", label:"vs selected", needsSel:true},
                    ].map(opt=>{
                      const disabled = opt.needsSel && !selected;
                      return (
                        <span key={opt.id}
                          className={"pill "+(formulaFraming===opt.id?"on":"")}
                          onClick={()=>!disabled && setFormulaFraming(opt.id)}
                          style={{cursor:disabled?"not-allowed":"pointer",fontSize:12,
                            opacity:disabled?.4:1}}
                          title={disabled?"Select a region first":""}>
                          {opt.label}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}

              {mode!=="formula" && mode!=="change" && (<>
                <ParamLabel>Election</ParamLabel>
                <ElectionPicker value={election} onChange={setElection} compact/>
              </>)}

              {mode==="change" && (<>
                <ParamLabel>Compare from</ParamLabel>
                <ElectionPicker value={refElection} onChange={setRefElection} compact/>
                <span style={{fontSize:16,opacity:.5,margin:"0 -2px"}}>→</span>
                <ParamLabel>to</ParamLabel>
                <ElectionPicker value={election} onChange={setElection} compact/>
                <span style={{fontSize:10,opacity:.5,marginLeft:4,fontStyle:"italic"}}>
                  positive = gain, negative = loss
                </span>

                <div style={{width:1,height:22,background:"var(--hair)",marginLeft:4}}/>
                <ParamLabel>Measure</ParamLabel>
                <div style={{display:"flex",gap:4}}>
                  <span className={"pill "+(compareMode==="pp"?"on":"")}
                    onClick={()=>setCompareMode("pp")}
                    style={{cursor:"pointer",fontSize:12}}>
                    Percentage-point change
                  </span>
                  <span className={"pill "+(compareMode==="votes"?"on":"")}
                    onClick={()=>setCompareMode("votes")}
                    style={{cursor:"pointer",fontSize:12}}>
                    Total vote change
                  </span>
                </div>
              </>)}
            </div>
            </>)}
          </div>

          {/* Map area — click-drag to pan, wheel to zoom */}
          <div ref={mapAreaRef} tabIndex={0}
            onMouseDown={(e)=>{
              panState.current={dragging:true, sx:e.clientX, sy:e.clientY, ox:pan.x, oy:pan.y, moved:false};
            }}
            onMouseMove={(e)=>{
              const s=panState.current; if(!s.dragging) return;
              const dx=e.clientX-s.sx, dy=e.clientY-s.sy;
              if(Math.abs(dx)+Math.abs(dy)>3) s.moved=true;
              setPan({x:s.ox+dx, y:s.oy+dy});
            }}
            onMouseUp={()=>{panState.current.dragging=false;}}
            onMouseLeave={()=>{panState.current.dragging=false;}}
            style={{flex:1,display:"flex",justifyContent:"center",alignItems:"center",position:"relative",padding:"10px 0",outline:"none",overflow:"hidden",cursor:panState.current.dragging?"grabbing":"grab"}}>
            <div style={{
              transform:`translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin:"center center",
              transition: panState.current.dragging ? "none" : "transform .2s ease"
            }}>
              <HierarchyMap
                level={showLevel}
                parentId={showParent}
                selected={selected}
                mode={mode}
                focusParty={focusParty}
                extra={mapExtra}
                onPick={(id)=>{ if(!panState.current.moved) setSelected(id); }}
                onZoomIn={(id)=>{ if(!panState.current.moved) drillDownInto(id); }}
                width={showLevel==="vp"?460:480}
                height={showLevel==="vp"?600:520}
              />
            </div>

            <div style={{position:"absolute",left:14,top:14}}
              onMouseDown={(e)=>e.stopPropagation()}
              onWheel={(e)=>e.stopPropagation()}>
              <MapControls
                canGoUp={canGoUp} canGoDown={canGoDown}
                onUp={goUp} onDown={goDown}
                zoom={zoom}
                onZoomIn={()=>setZoom(z=>Math.min(3, +(z+0.25).toFixed(2)))}
                onZoomOut={()=>setZoom(z=>{const n=Math.max(1, +(z-0.25).toFixed(2)); if(n===1) setPan({x:0,y:0}); return n;})}
              />
            </div>

            {/* Top-right: sub-regions button + (when applicable) focus-party picker stacked below */}
            <div style={{position:"absolute",right:14,top:14,width:230,display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end"}}
              onMouseDown={(e)=>e.stopPropagation()}
              onWheel={(e)=>e.stopPropagation()}>

              {/* Näytä ala-alueet button */}
              <div ref={subRef} style={{position:"relative",width:"100%"}}>
                <span className="btn"
                  onClick={()=>{ if(selected && showLevel!=="aa") setSubOpen(o=>!o); }}
                  style={{
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    width:"100%",gap:8,
                    cursor:(selected && showLevel!=="aa")?"pointer":"not-allowed",
                    opacity:(selected && showLevel!=="aa")?1:0.5,
                    background: subOpen?"var(--ink)":"var(--paper)",
                    color: subOpen?"var(--paper)":"var(--ink)",
                  }}>
                  <span>Näytä ala-alueet</span>
                  <span style={{fontSize:11,opacity:.8}}>{subOpen?"▲":"▼"}</span>
                </span>
                {subOpen && subRegions.length>0 && (
                  <div data-scrollable="1" className="box" style={{
                    position:"absolute",top:"calc(100% + 6px)",right:0,width:240,
                    maxHeight:320,overflowY:"auto",
                    boxShadow:"3px 3px 0 rgba(0,0,0,0.12)",zIndex:5,
                    padding:6,
                    scrollbarWidth:"thin",
                    scrollbarColor:"rgba(0,0,0,0.35) rgba(0,0,0,0.05)",
                  }}>
                    <div style={{fontSize:10,opacity:.55,textTransform:"uppercase",letterSpacing:.5,padding:"4px 8px 6px"}}>
                      {subRegions.length} {subRegionType} · {labelFor(showLevel, selected)}
                    </div>
                    {subRegions.map(r=>(
                      <div key={r.id}
                        onClick={()=>{ setSubOpen(false); drillIntoChild(r.id); }}
                        style={{
                          padding:"6px 10px",fontSize:13,cursor:"pointer",borderRadius:4,
                          display:"flex",justifyContent:"space-between",alignItems:"center",gap:8
                        }}
                        onMouseEnter={(e)=>e.currentTarget.style.background="rgba(0,0,0,0.06)"}
                        onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
                        <span>{r.label}</span>
                        <span style={{opacity:.5,fontSize:14}}>›</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Coloring-by picker — shown for any mode that needs a specific party */}
              {(mode==="support"||mode==="change"||mode==="votes") && (
                <div className="box soft" style={{width:"100%"}}>
                  <div style={{padding:8}}>
                    <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                      {mode==="change" ? "Party to track" : "Party to color"}
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {partyList.slice(0,8).map(p=>(
                        <span key={p.id} className="chip" onClick={()=>setFocusParty(p.id)}
                          style={{cursor:"pointer",
                            background:focusParty===p.id?`var(--p-${p.id})`:"var(--paper)",
                            color:focusParty===p.id?"#fff":"var(--ink)",
                            borderColor:focusParty===p.id?`var(--p-${p.id})`:"var(--line)"}}>
                          <span className="swatch" style={{background:`var(--p-${p.id})`}}/>{p.abbr}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {false && (
              <div style={{position:"absolute",right:14,top:14,width:210}} className="box soft">
                <div style={{padding:8}}/>
              </div>
            )}

            <div style={{position:"absolute",left:14,bottom:14,width:260}} className="box soft"
              onMouseDown={(e)=>e.stopPropagation()}
              onWheel={(e)=>e.stopPropagation()}>
              <div style={{padding:10}}>
                <DynamicLegend mode={mode} level={showLevel} parentId={showParent}
                  focusParty={focusParty} winners={winners}
                  election={election} refElection={refElection}
                  compareMode={compareMode}
                  formulaTokens={formulaTokens} formulaRange={formulaRangeVal}/>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: LEDGER */}
        <div style={{display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
          {/* Header — big TOTAL VOTES number, no misleading bars */}
          <div style={{padding:"14px 18px",borderBottom:"1.5px dashed var(--hair)"}}>
            <div style={{fontSize:11,letterSpacing:.5,opacity:.6,textTransform:"uppercase"}}>{ledgerType}</div>
            <div className="h" style={{fontSize:30,lineHeight:1.1,margin:"4px 0 14px"}}>{ledgerLabel}</div>

            <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:6}}>
              <div className="h" style={{fontSize:52,lineHeight:1}}>
                {data.votes.toLocaleString("fi-FI")}
              </div>
              <div style={{fontSize:13,opacity:.7}}>total votes</div>
            </div>
            <div style={{fontSize:12,opacity:.7,display:"flex",gap:14}}>
              <span>Turnout · <span className="mono">{data.turnout}%</span></span>
              <span style={{opacity:.4}}>·</span>
              <span>Voters · <span className="mono">{data.voters.toLocaleString("fi-FI")}</span></span>
            </div>
          </div>

          {/* Formula value (only when a formula is active) */}
          {mode==="formula" && formulaTokens && formulaTokens.length>0 && (()=>{
            const r = window.evalFormula ? window.evalFormula(formulaTokens, ledgerId||"suomi") : null;
            const ok = r && r.ok;
            const rawV = ok ? r.value : null;
            // Apply current framing relative to the visible regions.
            let displayV = rawV;
            if(ok && formulaFraming!=="absolute" && window.formulaValueFramed){
              displayV = window.formulaValueFramed(formulaTokens, ledgerId||"suomi",
                showLevel, showParent, formulaFraming, selected);
            }
            const framingLabel = formulaFraming==="share" ? "% of visible total"
              : formulaFraming==="vsSelected" ? `vs ${selected ? labelFor(showLevel, selected) : "selected"}`
              : "raw value";
            const suffix = (formulaFraming==="share" || formulaFraming==="vsSelected") ? "%" : "";
            const sign = (formulaFraming==="vsSelected" && displayV>0) ? "+" : "";
            const fmt = (v)=>{
              if(v==null||!isFinite(v)) return "—";
              const a = Math.abs(v);
              if(a>=10000) return (v/1000).toFixed(1)+"k"+suffix;
              if(a>=100)  return sign+v.toFixed(0)+suffix;
              return sign+v.toFixed(1)+suffix;
            };
            const summary = window.formulaSummary ? window.formulaSummary(formulaTokens) : "";
            return (
              <div style={{padding:"12px 18px",borderBottom:"1.5px dashed var(--hair)",
                background:"#faf3df"}}>
                <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>
                  Formula value
                </div>
                {summary && (
                  <div style={{fontSize:11,opacity:.75,fontFamily:"JetBrains Mono, monospace",
                    marginBottom:6,wordBreak:"break-word",lineHeight:1.4}}>
                    ƒ {summary}
                  </div>
                )}
                {ok ? (
                  <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                    <div className="h" style={{fontSize:38,lineHeight:1}}>{fmt(displayV)}</div>
                    <div style={{fontSize:11,opacity:.6,fontStyle:"italic"}}>{framingLabel}</div>
                  </div>
                ) : (
                  <div style={{fontSize:12,opacity:.6,fontStyle:"italic"}}>
                    {r && r.error ? r.error : "no value"}
                  </div>
                )}
                {ok && formulaFraming!=="absolute" && (
                  <div className="mono" style={{fontSize:11,opacity:.5,marginTop:4}}>
                    raw · {rawV!=null && isFinite(rawV) ? rawV.toFixed(2) : "—"}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Party share — compact list */}
          <div style={{padding:"12px 18px",borderBottom:"1.5px dashed var(--hair)"}}>
            <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
              Vote share
            </div>
            {(()=>{
              const rows = partyList.slice(0,8).map((p,i)=>({
                p, pct: data.shares[i],
                votes: Math.round(data.votes * data.shares[i] / 100),
              })).sort((a,b)=>b.pct-a.pct);
              const maxPct = Math.max(...rows.map(r=>r.pct));
              return rows.map(({p,pct,votes})=>(
                <div key={p.id} className="bar-row"
                  style={{gridTemplateColumns:"64px 1fr 42px 70px", gap:8}}>
                  <span style={{display:"flex",alignItems:"center",gap:5,fontSize:12}}>
                    <span className="swatch" style={{background:`var(--p-${p.id})`}}/>{p.abbr}
                  </span>
                  <span className="bar" style={{maxWidth:110}}>
                    <span style={{width:`${(pct/maxPct)*100}%`,background:`var(--p-${p.id})`}}/>
                  </span>
                  <span className="mono" style={{fontSize:11,textAlign:"right"}}>{pct.toFixed(1)}%</span>
                  <span className="mono" style={{fontSize:11,textAlign:"right",opacity:.7}}>
                    {votes.toLocaleString("fi-FI")}
                  </span>
                </div>
              ));
            })()}
          </div>

          {/* Candidates — scrollable with visible scrollbar */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            <div style={{padding:"10px 18px 6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,opacity:.6,textTransform:"uppercase",letterSpacing:.5}}>Top candidates</div>
              <span style={{fontSize:11,opacity:.6}}>{cands.length} total</span>
            </div>
            <div data-scrollable="1" className="cand-scroll" style={{
              overflowY:"scroll", flex:1,
              borderTop:"1px dotted var(--hair)",
              margin:"0 12px 16px 18px",
              paddingRight:8,
              scrollbarWidth:"thin",
              scrollbarColor:"rgba(0,0,0,0.35) rgba(0,0,0,0.05)",
            }}>
              {cands.map((c,i)=>(
                <div key={c.id} style={{
                  display:"grid",gridTemplateColumns:"24px 1fr 60px 70px",
                  gap:10,alignItems:"center",padding:"7px 0",
                  borderBottom:"1px dotted var(--hair)",fontSize:13
                }}>
                  <span className="mono" style={{fontSize:11,opacity:.5,textAlign:"right"}}>{i+1}.</span>
                  <span>{c.name}</span>
                  <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11}}>
                    <span className="swatch" style={{background:`var(--p-${c.party})`}}/>
                    {PARTY_ABBR[c.party]}
                  </span>
                  <span className="mono" style={{textAlign:"right"}}>{c.votes.toLocaleString("fi-FI")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .cand-scroll::-webkit-scrollbar{width:10px;display:block}
        .cand-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.05);border-radius:6px}
        .cand-scroll::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.35);border-radius:6px;border:2px solid var(--paper)}
        .cand-scroll::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,0.55)}
      `}</style>
    </div>
  );
}

Object.assign(window, { V2_Focused, candidatesFor });
