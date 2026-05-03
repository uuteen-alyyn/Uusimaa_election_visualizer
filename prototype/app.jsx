// app.jsx — V2 focused build

function App(){
  // ----- URL hash <-> state sync ---------------------------------------------
  // Encode the active view to the URL so users can copy/paste a link to
  // reproduce it. Uses #v=<base64-json>. Hydration runs once on mount.
  const encodeState = (s)=>{
    try{
      const json = JSON.stringify(s);
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return b64.replace(/=+$/,"");
    }catch{ return ""; }
  };
  const decodeState = (b64)=>{
    try{
      const pad = b64 + "=".repeat((4 - b64.length%4)%4);
      const json = decodeURIComponent(escape(atob(pad)));
      return JSON.parse(json);
    }catch{ return null; }
  };
  const initial = (()=>{
    const m = (window.location.hash||"").match(/[#&]v=([^&]+)/);
    return m ? decodeState(m[1]) : null;
  })();

  // State that together defines the currently-applied "workflow" — one of the
  // built-in presets or a user-created custom one.
  const [mode,        setMode]        = React.useState(initial?.mode        || "winner");
  const [election,    setElection]    = React.useState(initial?.election    || "ek2027");
  const [refElection, setRefElection] = React.useState(initial?.refElection || "ek2023");
  const [focusParty,  setFocusParty]  = React.useState(initial?.focusParty  ?? null);
  const [formulaTokens, setFormulaTokens] = React.useState(initial?.formulaTokens || []);
  // Bindings for formula selectors (e.g. {A:{type:"ek"}, B:{year:2023}, C:{who:{party:"kok"}}}).
  // Reset / restored whenever a new formula is applied.
  const [formulaBindings, setFormulaBindings] = React.useState(initial?.formulaBindings || {});
  // The id of the most recently-applied custom workflow (so changes to bindings
  // can be persisted back to it). null when a built-in is active.
  const [appliedWorkflowId, setAppliedWorkflowId] = React.useState(null);

  // Resolve selectors in the formula using current bindings, producing a tokens
  // array where chips have their sel* fields replaced with concrete values.
  const resolvedFormulaTokens = React.useMemo(()=>{
    return (formulaTokens||[]).map(t=>{
      if(t.kind!=="chip") return t;
      const f = {...(t.fields||{})};
      if(f.selType){
        const b = formulaBindings[f.selType];
        if(b && b.type){ f.type = b.type; delete f.selType; }
      }
      if(f.selYear){
        const b = formulaBindings[f.selYear];
        if(b && b.year){ f.year = b.year; if(b.round) f.round = b.round; delete f.selYear; }
      }
      if(f.selWho){
        const b = formulaBindings[f.selWho];
        if(b && b.who){ f.who = b.who; delete f.selWho; }
      }
      return {...t, fields:f};
    });
  }, [formulaTokens, formulaBindings]);

  // Custom workflows saved by the user (persisted).
  const [customWorkflows, setCustomWorkflows] = React.useState(()=>loadCustomWorkflows());
  const allWorkflows = React.useMemo(
    ()=>[...BUILTIN_WORKFLOWS, ...customWorkflows],
    [customWorkflows]
  );

  // When bindings change for a custom (saved) workflow, persist them back so
  // re-clicking the pill restores them. Built-ins are not mutated.
  React.useEffect(()=>{
    if(!appliedWorkflowId) return;
    setCustomWorkflows(prev=>{
      const i = prev.findIndex(w=>w.id===appliedWorkflowId);
      if(i<0) return prev;
      const cur = prev[i];
      const same = JSON.stringify(cur.defaultBindings||{})===JSON.stringify(formulaBindings);
      if(same) return prev;
      const next = prev.slice();
      next[i] = {...cur, defaultBindings: formulaBindings};
      saveCustomWorkflows(next);
      return next;
    });
  }, [formulaBindings, appliedWorkflowId]);

  // Metadata from the most-recently-applied workflow that isn't already
  // covered by state above (e.g. selectorLabels, user-chosen display name).
  const [appliedMeta, setAppliedMeta] = React.useState({});

  // The "active workflow" is derived from the live state so the pill highlights
  // automatically reflect changes (e.g. switching the focus-party chip).
  const activeWorkflow = React.useMemo(
    ()=>({ kind:mode, election, refElection, party:focusParty || "kok", formula: formulaTokens,
           selectorLabels: appliedMeta.selectorLabels, name: appliedMeta.name }),
    [mode, election, refElection, focusParty, formulaTokens, appliedMeta]
  );

  // Build sensible default bindings for any selectors in `tokens` that aren't
  // already covered by `bindings`. Type slots default to "ek", year slots to
  // newest of the (resolved) type, who slots to "kok".
  const autoDefaultBindings = (tokens, existing)=>{
    const out = {...existing};
    const seenSlots = new Map();
    (tokens||[]).forEach(t=>{
      if(t.kind!=="chip") return;
      const f = t.fields || {};
      if(f.selType && !seenSlots.has(f.selType)) seenSlots.set(f.selType, "type");
      if(f.selYear && !seenSlots.has(f.selYear)) seenSlots.set(f.selYear, "year");
      if(f.selWho  && !seenSlots.has(f.selWho )) seenSlots.set(f.selWho , "who");
    });
    seenSlots.forEach((slot, name)=>{
      const cur = out[name] || {};
      if(slot==="type" && !cur.type) out[name] = {...cur, type:"ek"};
      else if(slot==="year" && !cur.year){
        // Pick newest election of the type bound for this name (if any sibling
        // selector defines it), else default to ek2027.
        const e = window.ELECTION_BY_ID && window.ELECTION_BY_ID["ek2027"];
        out[name] = {...cur, year:e?e.year:2027, round:e?.round};
      }
      else if(slot==="who" && !cur.who) out[name] = {...cur, who:{party:"kok"}};
    });
    return out;
  };

  const applyWorkflow = (wf)=>{
    setMode(wf.kind);
    setElection(wf.election || "ek2027");
    if(wf.refElection) setRefElection(wf.refElection);
    if(WF_KIND_BY_ID[wf.kind]?.needsParty){
      setFocusParty(wf.party || "kok");
    }else{
      setFocusParty(null);
    }
    setAppliedMeta({
      selectorLabels: wf.selectorLabels || {},
      name: wf.name || null,
    });
    setAppliedWorkflowId(wf.builtin ? null : (wf.id || null));
    if(wf.kind==="formula"){
      const tokens = wf.formula || [];
      setFormulaTokens(tokens);
      // Restore stored bindings, then auto-fill any missing ones with sensible defaults.
      setFormulaBindings(autoDefaultBindings(tokens, wf.defaultBindings || {}));
    }
  };
  const saveWorkflow = (wf)=>{
    const next = [...customWorkflows, wf];
    setCustomWorkflows(next);
    saveCustomWorkflows(next);
    applyWorkflow(wf);
  };
  const updateWorkflow = (wf)=>{
    // Replace the existing workflow with the same id, then re-apply it so the
    // map reflects the edited formula immediately.
    setCustomWorkflows(prev=>{
      const next = prev.map(w=>w.id===wf.id ? wf : w);
      saveCustomWorkflows(next);
      return next;
    });
    applyWorkflow(wf);
  };
  const deleteWorkflow = (id)=>{
    // Use functional setState so deleting multiple workflows in the same
    // frame (from the "Remove custom mode…" popover) doesn't overwrite each
    // other through stale closure reads.
    setCustomWorkflows(prev=>{
      const next = prev.filter(w=>w.id!==id);
      saveCustomWorkflows(next);
      return next;
    });
  };

  const [tweakOpen, setTweakOpen] = React.useState(false);
  React.useEffect(()=>{
    function onMsg(e){
      const d=e.data||{};
      if(d.type==="__activate_edit_mode") setTweakOpen(true);
      if(d.type==="__deactivate_edit_mode") setTweakOpen(false);
    }
    window.addEventListener("message", onMsg);
    window.parent && window.parent.postMessage({type:"__edit_mode_available"}, "*");
    return ()=>window.removeEventListener("message", onMsg);
  },[]);

  // Persist the active view to the URL hash so users can copy-paste a link
  // to reproduce it. Built-in workflows omit redundant fields to keep the
  // hash short.
  React.useEffect(()=>{
    const s = {
      mode, election, refElection, focusParty,
      formulaTokens: mode==="formula" ? formulaTokens : undefined,
      formulaBindings: mode==="formula" ? formulaBindings : undefined,
    };
    // Strip undefined keys.
    Object.keys(s).forEach(k=>s[k]===undefined && delete s[k]);
    const enc = encodeState(s);
    if(!enc) return;
    const newHash = "#v="+enc;
    if(window.location.hash !== newHash){
      window.history.replaceState(null, "", window.location.pathname + window.location.search + newHash);
    }
  }, [mode, election, refElection, focusParty, formulaTokens, formulaBindings]);

  // Copy the current share link to clipboard. Shows a brief toast.
  const [shareToast, setShareToast] = React.useState(null);
  const copyShareLink = React.useCallback(()=>{
    const url = window.location.href;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(
        ()=>{ setShareToast("Link copied"); setTimeout(()=>setShareToast(null), 1800); },
        ()=>{ setShareToast("Copy failed — select the URL"); setTimeout(()=>setShareToast(null), 2500); }
      );
    } else {
      setShareToast("Copy from address bar");
      setTimeout(()=>setShareToast(null), 2500);
    }
  }, []);

  return (
    <>
      <DesignCanvas>
        <DCSection id="v2" title="V2 · Dashboard with hierarchical drill-down"
          subtitle="Click to select · double-click to zoom · ↑/↓ buttons navigate hierarchy">
          <DCArtboard id="v2-main" label="V2 · Finnish election visualizer" width={1280} height={820}>
            <V2_Focused
              mode={mode} setMode={setMode}
              election={election} setElection={setElection}
              refElection={refElection} setRefElection={setRefElection}
              focusParty={focusParty} setFocusParty={setFocusParty}
              formulaTokens={resolvedFormulaTokens}
              rawFormulaTokens={formulaTokens}
              formulaBindings={formulaBindings}
              setFormulaBindings={setFormulaBindings}
              workflows={allWorkflows}
              activeWorkflow={activeWorkflow}
              onApplyWorkflow={applyWorkflow}
              onSaveWorkflow={saveWorkflow}
              onUpdateWorkflow={updateWorkflow}
              onDeleteWorkflow={deleteWorkflow}
              onCopyShareLink={copyShareLink}
            />
          </DCArtboard>
        </DCSection>

        <DCSection id="notes" title="Interaction notes">
          <DCPostIt>
            Siblings at the same hierarchy are always visible. When you double-click
            Uusimaa, you see ALL kunnat of Uusimaa at once. Selecting one of them
            just updates the ledger — the rest stay on screen for visual comparison.
          </DCPostIt>
          <DCPostIt>
            ↑ goes up one hierarchy (e.g. kunnat view → back to vaalipiirit).
            ↓ drills into the currently-selected region, same as double-click.
            Breadcrumb items are also clickable.
          </DCPostIt>
          <DCPostIt>
            The workflow bar replaces the old mode tabs. Built-ins cover the four
            common cases (winner / support / votes / change). The "＋ Custom"
            button opens a builder — users can apply it temporarily or save it
            as a new named button in the bar.
          </DCPostIt>
        </DCSection>
      </DesignCanvas>

      {shareToast && (
        <div style={{
          position:"fixed",left:"50%",bottom:30,transform:"translateX(-50%)",
          background:"var(--ink)",color:"var(--paper)",padding:"10px 16px",
          borderRadius:6,fontFamily:"Architects Daughter, system-ui",fontSize:13,
          zIndex:10000,boxShadow:"3px 3px 0 rgba(0,0,0,0.2)"
        }}>
          {shareToast}
        </div>
      )}

      {tweakOpen && (
        <div style={{
          position:"fixed",right:20,bottom:20,width:300,zIndex:9999,
          background:"var(--paper)",border:"1.5px solid var(--line)",borderRadius:8,
          padding:14,fontFamily:"Architects Daughter, system-ui",boxShadow:"4px 4px 0 rgba(0,0,0,0.15)"
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:20,fontFamily:"Caveat",fontWeight:700}}>Tweaks</div>
            <span style={{cursor:"pointer",opacity:.6}} onClick={()=>setTweakOpen(false)}>✕</span>
          </div>

          <div style={{fontSize:11,opacity:.6,marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>Focus party (for support / change / votes modes)</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
            <span className={"chip"} onClick={()=>setFocusParty(null)}
              style={{cursor:"pointer",background:!focusParty?"var(--ink)":"var(--paper)",color:!focusParty?"var(--paper)":"var(--ink)"}}>
              Winner
            </span>
            {partyList.slice(0,8).map(p=>(
              <span key={p.id} className="chip" onClick={()=>setFocusParty(p.id)}
                style={{cursor:"pointer",
                  background:focusParty===p.id?`var(--p-${p.id})`:"var(--paper)",
                  color:focusParty===p.id?"#fff":"var(--ink)"}}>
                {p.abbr}
              </span>
            ))}
          </div>

          <div style={{fontSize:11,opacity:.6,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Saved workflows</div>
          <div style={{fontSize:12,opacity:.7}}>
            {customWorkflows.length
              ? `${customWorkflows.length} custom workflow${customWorkflows.length===1?"":"s"} saved`
              : "None yet — use the ＋ Custom button above the map."}
          </div>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
