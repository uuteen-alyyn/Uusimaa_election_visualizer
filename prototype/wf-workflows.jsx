// wf-workflows.jsx — Workflow selector bar + custom-workflow builder popover.
//
// A "workflow" is a small preset that configures the map's coloring:
//   { id, label, kind, election, party?, refElection?, builtin?, editable? }
//
// Built-in workflows come first and are not deletable. Users can build custom
// workflows via the "+ Custom" popover and either apply them temporarily or
// save them as new buttons in the bar (persisted to localStorage).

const WF_LS_KEY = "vk_workflows_v1";

const WF_KINDS = [
  {id:"winner",  label:"Biggest party",     needsParty:false, needsRef:false},
  {id:"support", label:"Party support %",   needsParty:true,  needsRef:false},
  {id:"votes",   label:"Total votes",       needsParty:true,  needsRef:false},
  {id:"change",  label:"Change in support", needsParty:true,  needsRef:true},
  {id:"formula", label:"Custom formula",    needsParty:false, needsRef:false, needsFormula:true},
];
const WF_KIND_BY_ID = Object.fromEntries(WF_KINDS.map(k=>[k.id,k]));

// Full catalog of elections, grouped by type. Presidential elections have
// separate entries per round. Order within each type is newest-first.
//
//   typeId  — matches an entry in ELECTION_TYPES
//   year    — election year (for rounds, the year the election was held)
//   round   — 1 or 2, for presidentinvaalit only
//   label   — what the user sees in the year/round dropdown
//   shortLabel — short form used in legends / workflow chips
const ELECTION_TYPES = [
  {id:"kunta",  label:"Kuntavaalit",      short:"Kunta"},
  {id:"alue",   label:"Aluevaalit",       short:"Alue"},
  {id:"ek",     label:"Eduskuntavaalit",  short:"EK"},
  {id:"eu",     label:"Eurovaalit",       short:"EU"},
  {id:"pres",   label:"Presidentinvaalit",short:"Pres"},
];
const ELECTION_TYPE_BY_ID = Object.fromEntries(ELECTION_TYPES.map(t=>[t.id,t]));

const ELECTIONS = [
  // Parliamentary
  {id:"ek2027",     typeId:"ek",    year:2027, label:"Eduskuntavaalit 2027", shortLabel:"EK 2027"},
  {id:"ek2023",     typeId:"ek",    year:2023, label:"Eduskuntavaalit 2023", shortLabel:"EK 2023"},
  {id:"ek2019",     typeId:"ek",    year:2019, label:"Eduskuntavaalit 2019", shortLabel:"EK 2019"},
  // Municipal
  {id:"kunta2025",  typeId:"kunta", year:2025, label:"Kuntavaalit 2025",     shortLabel:"Kunta 2025"},
  {id:"kunta2021",  typeId:"kunta", year:2021, label:"Kuntavaalit 2021",     shortLabel:"Kunta 2021"},
  // Regional (wellbeing services counties)
  {id:"alue2025",   typeId:"alue",  year:2025, label:"Aluevaalit 2025",      shortLabel:"Alue 2025"},
  {id:"alue2022",   typeId:"alue",  year:2022, label:"Aluevaalit 2022",      shortLabel:"Alue 2022"},
  // European
  {id:"eu2024",     typeId:"eu",    year:2024, label:"Eurovaalit 2024",      shortLabel:"EU 2024"},
  {id:"eu2019",     typeId:"eu",    year:2019, label:"Eurovaalit 2019",      shortLabel:"EU 2019"},
  // Presidential — rounds as separate selections
  {id:"pres2024r1", typeId:"pres",  year:2024, round:1, label:"Presidentinvaalit 2024 · 1. kierros", shortLabel:"Pres 2024 · I"},
  {id:"pres2024r2", typeId:"pres",  year:2024, round:2, label:"Presidentinvaalit 2024 · 2. kierros", shortLabel:"Pres 2024 · II"},
  {id:"pres2018r1", typeId:"pres",  year:2018, round:1, label:"Presidentinvaalit 2018 · 1. kierros", shortLabel:"Pres 2018 · I"},
  // 2018 was decided in round 1; no round 2 for that year
  {id:"pres2012r1", typeId:"pres",  year:2012, round:1, label:"Presidentinvaalit 2012 · 1. kierros", shortLabel:"Pres 2012 · I"},
  {id:"pres2012r2", typeId:"pres",  year:2012, round:2, label:"Presidentinvaalit 2012 · 2. kierros", shortLabel:"Pres 2012 · II"},
];
const ELECTION_BY_ID = Object.fromEntries(ELECTIONS.map(e=>[e.id,e]));

// Short labels (for legends / compact chips) — built from the catalog
const ELECTION_LABELS = Object.fromEntries(ELECTIONS.map(e=>[e.id, e.shortLabel]));
// Full labels (for dropdowns / verbose contexts)
const ELECTION_FULL_LABELS = Object.fromEntries(ELECTIONS.map(e=>[e.id, e.label]));

// Elections of a given type, in catalog order (newest first)
function electionsOfType(typeId){
  return ELECTIONS.filter(e=>e.typeId===typeId);
}
// Default election within a type (first = newest)
function defaultElectionForType(typeId){
  const arr = electionsOfType(typeId);
  return arr.length ? arr[0].id : null;
}

const BUILTIN_WORKFLOWS = [
  {id:"bi-winner",  builtin:true, label:"Biggest party",      kind:"winner",  election:"ek2027"},
  {id:"bi-support", builtin:true, label:"Party support %",    kind:"support", election:"ek2027", party:"kok"},
  {id:"bi-votes",   builtin:true, label:"Total votes",        kind:"votes",   election:"ek2027", party:"kok"},
  {id:"bi-change",  builtin:true, label:"Change in support",  kind:"change",  election:"ek2027", refElection:"ek2023", party:"kok"},
];

function loadCustomWorkflows(){
  try{
    const raw = localStorage.getItem(WF_LS_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return [];
    // One-time cleanup: collapse any accidental double-"ƒ " prefix left in
    // historical labels before the autoLabel fix.
    return arr.filter(w=>w&&w.id&&w.kind).map(w=>{
      if(typeof w.label==="string"){
        // Strip any leading "ƒ " prefix — the WorkflowBar renders its own ƒ
        // glyph span, so labels stored with a textual "ƒ " were doubling up.
        const clean = w.label.replace(/^(ƒ\s*)+/, "");
        if(clean!==w.label) return {...w, label:clean};
      }
      return w;
    });
  }catch(e){ return []; }
}
function saveCustomWorkflows(arr){
  try{ localStorage.setItem(WF_LS_KEY, JSON.stringify(arr)); }catch(e){}
}

// Is workflow A equivalent to workflow B in what it configures (ignoring id/label/builtin)?
function workflowsEquivalent(a, b){
  if(!a||!b) return false;
  if(a.kind!==b.kind) return false;
  if(a.kind==="formula"){
    return JSON.stringify(a.formula||[])===JSON.stringify(b.formula||[]);
  }
  if(a.election!==b.election) return false;
  const k = WF_KIND_BY_ID[a.kind];
  if(k && k.needsParty && a.party!==b.party) return false;
  if(k && k.needsRef   && a.refElection!==b.refElection) return false;
  return true;
}

// Short summary line for a workflow (e.g. shown as tooltip / subtitle).
function workflowSubtitle(w){
  if(w.kind==="formula"){
    return "ƒ " + (window.formulaSummary ? window.formulaSummary(w.formula||[]) : "custom formula");
  }
  const bits = [ELECTION_LABELS[w.election]||w.election];
  const k = WF_KIND_BY_ID[w.kind];
  if(k&&k.needsRef) bits.push(`vs ${ELECTION_LABELS[w.refElection]||w.refElection}`);
  if(k&&k.needsParty && w.party) bits.push((window.PARTY_ABBR||{})[w.party]||w.party);
  return bits.join(" · ");
}

// The bar of workflow pills + a "+ Custom" trigger.
// Built-in workflows render on the top row; custom (user-saved) workflows on
// the second row, visually distinct, with a "Remove custom" popover at the end.
function WorkflowBar({workflows, activeWorkflow, onApply, onOpenBuilder, onDelete, onEdit}){
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removeSel, setRemoveSel] = React.useState(()=>new Set());
  const [editOpen, setEditOpen] = React.useState(false);

  const builtins = workflows.filter(w=>w.builtin);
  const customs  = workflows.filter(w=>!w.builtin);

  const renderPill = (w, {custom}) => {
    const isActive  = workflowsEquivalent(w, activeWorkflow);
    const isKindActive = !isActive && w.kind === activeWorkflow?.kind && w.builtin;
    const showAsOn = isActive || isKindActive;
    return (
      <span key={w.id}
        className={"pill "+(showAsOn?"on":"")}
        title={workflowSubtitle(w)}
        onClick={()=>onApply(w)}
        style={{
          cursor:"pointer",fontSize:12,position:"relative",
          display:"inline-flex",alignItems:"center",gap:6,
          ...(custom ? {
            borderStyle: showAsOn ? "solid" : "dashed",
            background: showAsOn ? undefined : "#f6efdc",
          } : null),
        }}>
        {custom && (
          <span style={{
            fontFamily:"Caveat, cursive",
            fontSize:14,fontWeight:700,fontStyle:"italic",
            opacity: showAsOn ? 0.8 : 0.55,
            lineHeight:1, marginRight:-2,
          }}>ƒ</span>
        )}
        {w.label}
      </span>
    );
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {/* Row 1: built-ins + "+ Custom" trigger */}
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        {builtins.map(w=>renderPill(w, {custom:false}))}
        <span
          onMouseDown={(e)=>{ e.stopPropagation(); onOpenBuilder(); }}
          className="pill"
          style={{
            cursor:"pointer",fontSize:12,
            borderStyle:"dashed",background:"transparent",
            display:"inline-flex",alignItems:"center",gap:4,
          }}>
          <span style={{fontSize:13,lineHeight:1}}>＋</span>
          Custom
        </span>
      </div>

      {/* Row 2: custom workflows + "Edit custom" + "Remove custom" popovers */}
      {customs.length>0 && (
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          {customs.map(w=>renderPill(w, {custom:true}))}

          {onEdit && (
            <span style={{position:"relative"}}>
              <span
                onClick={()=>{ setEditOpen(o=>!o); setRemoveOpen(false); }}
                className="pill"
                style={{
                  cursor:"pointer",fontSize:12,opacity:.85,
                  borderStyle:"dotted",background:"transparent",
                  display:"inline-flex",alignItems:"center",gap:4,
                  whiteSpace:"nowrap",
                }}>
                <span style={{fontSize:12,lineHeight:1}}>✎</span>
                Edit custom mode…
              </span>
              {editOpen && (
                <div onMouseDown={e=>e.stopPropagation()}
                  style={{
                    position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:20,
                    minWidth:240,padding:10,background:"var(--paper)",
                    border:"1.5px solid var(--line)",borderRadius:8,
                    boxShadow:"4px 4px 0 rgba(0,0,0,0.15)",
                  }}>
                  <div style={{fontSize:11,opacity:.65,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
                    Pick one to edit
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:220,overflowY:"auto"}}>
                    {customs.map(w=>(
                      <span key={w.id}
                        onClick={()=>{ onEdit(w); setEditOpen(false); }}
                        style={{
                          display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                          fontSize:12,cursor:"pointer",borderRadius:4,
                        }}
                        onMouseEnter={(e)=>e.currentTarget.style.background="rgba(0,0,0,0.06)"}
                        onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
                        <span style={{fontFamily:"JetBrains Mono, monospace",fontSize:10,opacity:.5}}>ƒ</span>
                        <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.label}</span>
                        <span style={{fontSize:11,opacity:.5}}>✎</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </span>
          )}

          <span style={{position:"relative"}}>
            <span
              onClick={()=>{ setRemoveOpen(o=>!o); setRemoveSel(new Set()); setEditOpen(false); }}
              className="pill"
              style={{
                cursor:"pointer",fontSize:12,opacity:.75,
                borderStyle:"dotted",background:"transparent",
                whiteSpace:"nowrap",
              }}>
              Remove custom mode…
            </span>
            {removeOpen && (
              <div onMouseDown={e=>e.stopPropagation()}
                style={{
                  position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:20,
                  minWidth:240,padding:10,background:"var(--paper)",
                  border:"1.5px solid var(--line)",borderRadius:8,
                  boxShadow:"4px 4px 0 rgba(0,0,0,0.15)",
                }}>
                <div style={{fontSize:11,opacity:.65,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
                  Select to remove
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}}>
                  {customs.map(w=>(
                    <label key={w.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,cursor:"pointer"}}>
                      <input type="checkbox"
                        checked={removeSel.has(w.id)}
                        onChange={(e)=>{
                          const s = new Set(removeSel);
                          if(e.target.checked) s.add(w.id); else s.delete(w.id);
                          setRemoveSel(s);
                        }}/>
                      <span>{w.label}</span>
                    </label>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,marginTop:10,justifyContent:"flex-end"}}>
                  <span className="btn" onClick={()=>setRemoveOpen(false)}
                    style={{cursor:"pointer",fontSize:11,padding:"4px 9px"}}>Cancel</span>
                  <span className="btn" onClick={()=>{
                      removeSel.forEach(id=>onDelete(id));
                      setRemoveOpen(false); setRemoveSel(new Set());
                    }}
                    style={{
                      cursor:removeSel.size?"pointer":"not-allowed",
                      opacity:removeSel.size?1:.4,
                      fontSize:11,padding:"4px 9px",
                      background:"var(--ink)",color:"var(--paper)"
                    }}>Delete {removeSel.size||""}</span>
                </div>
              </div>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// Token chip — used both in the formula strip and in the palette.
function FormulaChip({token, onClick, onRemove, dim}){
  const k = token.kind;
  let bg = "var(--paper)", color = "var(--ink)", border = "var(--line)";
  if(k==="data"){
    if(token.value.party){
      bg = `var(--p-${token.value.party})`; color = "#fff"; border = `var(--p-${token.value.party})`;
    } else {
      bg = "#e9e2cf"; border = "var(--line)";
    }
  } else if(k==="op"){
    bg = "var(--ink)"; color = "var(--paper)"; border = "var(--ink)";
  } else if(k==="paren"){
    bg = "transparent"; border = "var(--line)";
  } else if(k==="num"){
    bg = "var(--paper-2)";
  }
  return (
    <span onClick={onClick}
      style={{
        display:"inline-flex",alignItems:"center",gap:6,
        padding:k==="op"||k==="paren"?"4px 10px":"4px 8px",
        borderRadius: k==="op" ? 4 : k==="paren" ? 4 : 999,
        border:`1.5px solid ${border}`,
        background:bg, color, fontSize:13,
        fontFamily: k==="op"||k==="paren"||k==="num"?"JetBrains Mono, monospace":"inherit",
        fontWeight: k==="op"?700:500,
        cursor: onClick?"pointer":"default",
        opacity:dim?0.45:1,
        whiteSpace:"nowrap",
      }}>
      {formulaTokenLabel(token)}
      {onRemove && (
        <span onClick={(e)=>{e.stopPropagation(); onRemove();}}
          style={{opacity:.7,fontSize:11,marginLeft:2,cursor:"pointer"}}>✕</span>
      )}
    </span>
  );
}

// Sub-component: the formula-building surface.
function FormulaSurface({tokens, setTokens, selectors, setSelectors}){
  return (
    <div>
      {window.FormulaComposer ? (
        <window.FormulaComposer
          tokens={tokens} setTokens={setTokens}
          selectors={selectors} setSelectors={setSelectors}
        />
      ) : (
        <div style={{padding:10,fontStyle:"italic",opacity:.6}}>Composer loading…</div>
      )}
    </div>
  );
}
// The modal-style popover for building a custom formula workflow.
// If `initial` is provided with an `.id`, this edits that workflow in place;
// otherwise it creates a new one.
function WorkflowBuilder({initial, onApply, onSave, onUpdate, onClose}){
  const [formula, setFormula] = React.useState(initial?.formula || []);
  const [selectors, setSelectors] = React.useState(initial?.selectors || []);
  const [name,    setName]    = React.useState(initial?.name || "");
  const isEdit = !!(initial && initial.id);

  // Selector labels (optional friendly names keyed by slot name "A","B",…).
  // Stored on the workflow so the Ledger bar can use them.
  const [selectorLabels, setSelectorLabels] = React.useState(initial?.selectorLabels || {});

  // Derive the set of selectors actually used in the current formula — we
  // only want to show naming inputs for those, not for stale entries.
  const activeSelectors = React.useMemo(()=>{
    const seen = new Map();
    formula.forEach(t=>{
      if(t.kind!=="chip") return;
      const f = t.fields || {};
      [["selType","type"],["selYear","year"],["selWho","who"]].forEach(([k,slot])=>{
        if(f[k] && !seen.has(f[k])) seen.set(f[k], {name:f[k], slot});
      });
    });
    return [...seen.values()];
  }, [formula]);

  const preview = React.useMemo(()=>{
    if(!window.evalFormula) return null;
    return window.evalFormula(formula, "uus");
  }, [formula]);

  const autoLabel = ()=>{
    const s = window.formulaSummary ? window.formulaSummary(formula) : "formula";
    // No "ƒ " prefix — the WorkflowBar pill already renders a ƒ glyph element.
    return s.replace(/^ƒ\s*/, "").slice(0, 44);
  };

  // Are there any unbound selectors in the formula? Those can't be previewed,
  // but the workflow is still valid — the viewer binds them at runtime.
  const hasUnboundSelectors = React.useMemo(()=>{
    return formula.some(t=>{
      if(t.kind!=="chip") return false;
      const f = t.fields||{};
      return f.selType || f.selYear || f.selWho;
    });
  }, [formula]);

  // A formula is saveable if it has content AND either (a) preview evaluates
  // cleanly, or (b) it contains selectors (deferred binding).
  const canSave = formula.length>0 && (
    (preview && preview.ok) || hasUnboundSelectors
  );

  const buildWorkflow = (id, label)=>({
    id, label, name: name.trim() || null,
    kind:"formula", formula, selectors,
    selectorLabels,
  });

  // Single action — Apply saves (or updates) the workflow.
  const applyAndSave = ()=>{
    if(!canSave) return;
    const labelText = (name.trim() || autoLabel()).slice(0, 48);
    if(isEdit){
      const wf = buildWorkflow(initial.id, labelText);
      onUpdate && onUpdate(wf);
    } else {
      const wf = buildWorkflow("wf-"+Math.random().toString(36).slice(2,9), labelText);
      onSave && onSave(wf);
    }
    onClose && onClose();
  };

  const fieldLabel = {fontSize:10,opacity:.6,textTransform:"uppercase",letterSpacing:.5,marginBottom:6};

  return (
    <div onMouseDown={(e)=>e.stopPropagation()} onWheel={(e)=>e.stopPropagation()}
      style={{
        position:"fixed",inset:0,zIndex:9998,
        background:"rgba(26,26,26,0.28)",
        display:"flex",alignItems:"center",justifyContent:"center",
        padding:24,
      }}
      onClick={onClose}>
      <div className="box" onClick={(e)=>e.stopPropagation()}
        style={{
          width: 680,
          maxHeight:"calc(100vh - 48px)", overflowY:"auto",
          padding:20,
          boxShadow:"6px 6px 0 rgba(0,0,0,0.2)",
          background:"var(--paper)"
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}>
          <div>
            <div style={{fontFamily:"Caveat, cursive",fontSize:28,fontWeight:700,lineHeight:1}}>
              {isEdit ? "Edit custom mode" : "Custom formula"}
            </div>
            <div style={{fontSize:12,opacity:.6,marginTop:2}}>
              Compose a per-region value from party shares, swings, candidate votes, and turnout.
            </div>
          </div>
          <span onClick={onClose} style={{cursor:"pointer",opacity:.55,fontSize:16}}>✕</span>
        </div>

        {/* Name this mode */}
        <div style={{marginBottom:14}}>
          <div style={fieldLabel}>Name this mode</div>
          <input
            value={name}
            onChange={e=>setName(e.target.value)}
            placeholder={autoLabel() || "e.g. Kok swing 2019→2023"}
            style={{
              width:"100%",border:"1.5px solid var(--line)",background:"var(--paper-2)",
              padding:"7px 10px",borderRadius:6,fontFamily:"inherit",fontSize:14,
              boxSizing:"border-box",
            }}/>
          <div style={{fontSize:10,opacity:.55,marginTop:4,fontStyle:"italic"}}>
            Leave blank to auto-name from the formula.
          </div>
        </div>

        <FormulaSurface tokens={formula} setTokens={setFormula}
          selectors={selectors} setSelectors={setSelectors}/>

        {/* Rename selectors — only when the formula has any */}
        {activeSelectors.length>0 && (
          <div style={{
            marginTop:10,padding:10,border:"1.5px dashed var(--line)",borderRadius:8,
            background:"var(--paper)",
          }}>
            <div style={{...fieldLabel,marginBottom:8}}>Name the selectors</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {activeSelectors.map(s=>(
                <div key={s.name} style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{
                    display:"inline-flex",alignItems:"center",padding:"2px 8px",
                    border:"1.5px dashed var(--ink)",borderRadius:999,background:"#f4e6c3",
                    fontFamily:"JetBrains Mono, monospace",fontWeight:700,fontSize:11,
                    minWidth:26,justifyContent:"center",
                  }}>${s.name}</span>
                  <span style={{fontSize:11,opacity:.6,width:120}}>
                    {s.slot==="type" ? "election type" : s.slot==="year" ? "year" : "party / candidate"}
                  </span>
                  <input
                    value={selectorLabels[s.name] || ""}
                    onChange={e=>setSelectorLabels(prev=>({...prev, [s.name]: e.target.value}))}
                    placeholder={`e.g. "Comparison ${s.slot}"`}
                    style={{
                      flex:1,border:"1.5px solid var(--line)",background:"var(--paper-2)",
                      padding:"5px 8px",borderRadius:6,fontFamily:"inherit",fontSize:12,
                    }}/>
                </div>
              ))}
            </div>
            <div style={{fontSize:10,opacity:.55,marginTop:6,fontStyle:"italic"}}>
              These names appear next to each dropdown in the main view.
            </div>
          </div>
        )}

        <div style={{
          marginTop:14,marginBottom:10,padding:"8px 10px",
          border:"1px dotted var(--hair)",borderRadius:6,
          fontSize:12, display:"flex",justifyContent:"space-between",alignItems:"center",gap:12
        }}>
          <span style={{opacity:.65,flex:1,minWidth:0}}>
            {hasUnboundSelectors
              ? <span style={{fontStyle:"italic"}}>Preview unavailable — formula has selectors the viewer will bind.</span>
              : (preview && preview.ok)
                ? <>Preview (Uusimaa): <span className="mono" style={{fontWeight:600,opacity:1}}>{preview.value.toFixed(2)}</span></>
                : formula.length===0
                  ? "Add tokens above to build your formula."
                  : <span style={{color:"#b94a2a"}}>⚠ {preview?.error || "invalid formula"}</span>
            }
          </span>
          <span style={{fontSize:10,opacity:.5,fontStyle:"italic",whiteSpace:"nowrap"}}>
            Map auto-scales colors across regions.
          </span>
        </div>

        <div style={{borderTop:"1px dashed var(--hair)",margin:"12px 0"}}/>

        <div style={{display:"flex",gap:8,marginTop:4}}>
          <span className="btn" onClick={applyAndSave}
            style={{flex:1,textAlign:"center",cursor:canSave?"pointer":"not-allowed",
              fontSize:13,padding:"9px 12px",opacity:canSave?1:.4,
              background:"var(--ink)",color:"var(--paper)"}}>
            {isEdit ? "Save changes" : "Apply"}
          </span>
        </div>
        <div style={{fontSize:10,opacity:.55,marginTop:6,fontStyle:"italic",textAlign:"center"}}>
          {isEdit ? "Changes update the existing custom mode." : "Saved to your custom workflows automatically."}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  WorkflowBar, WorkflowBuilder, FormulaSurface, FormulaChip,
  BUILTIN_WORKFLOWS, loadCustomWorkflows, saveCustomWorkflows,
  workflowsEquivalent, workflowSubtitle,
  WF_KIND_BY_ID, WF_KINDS,
  ELECTION_TYPES, ELECTION_TYPE_BY_ID, ELECTIONS, ELECTION_BY_ID,
  ELECTION_LABELS, ELECTION_FULL_LABELS,
  electionsOfType, defaultElectionForType,
});
