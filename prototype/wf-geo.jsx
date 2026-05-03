// wf-geo.jsx — Real Finnish geometry for vaalipiirit and kunnat.
// Source: Tilastokeskus / Statistics Finland (CC BY 4.0),
// vaalipiiri4500k_2026 and kunta4500k_2026 simplified GeoJSON,
// pre-fetched into data/fi-vaalipiirit.json and data/fi-kunnat.json.
//
// We project lon/lat → SVG coords with an equirectangular projection
// scaled for Finland's mid-latitude. The output is a flat list of
// regions { id, label, d, cx, cy, bbox, area } so the rest of wf-map
// (HierarchyMap etc.) just consumes static path strings.

(function(){
  // Display labels keyed by short id (must match legacy ids used in old data
  // pipeline so regionData/winners/etc. keep working).
  const VP_LABELS = {
    hel:"Helsinki", uus:"Uusimaa", vars:"Varsinais-Suomi", sat:"Satakunta",
    ahve:"Ahvenanmaa", ham:"Häme", pir:"Pirkanmaa", kaa:"Kaakkois-Suomi",
    sav:"Savo-Karjala", vaa:"Vaasa", kes:"Keski-Suomi", oul:"Oulu", lap:"Lappi"
  };

  // Country viewBox the rest of the app expects: pre-existing code uses
  // "60 30 300 610" with width 440. We'll project into a 300x610 box so
  // the ratio is preserved and labels at country level look right.
  const COUNTRY_VB = { x: 60, y: 30, w: 300, h: 610 };
  // Finland real bbox (mainland-friendly). Using 19.3..31.6 lon, 59.7..70.1 lat.
  const LON_MIN = 19.3, LON_MAX = 31.7;
  const LAT_MIN = 59.7, LAT_MAX = 70.1;
  // Equirectangular: x ∝ (lon-LON_MIN)*cos(meanLat). y ∝ -(lat-LAT_MAX).
  const MEAN_LAT = (LAT_MIN + LAT_MAX)/2 * Math.PI/180;
  const COS_LAT = Math.cos(MEAN_LAT);
  const dataW = (LON_MAX - LON_MIN) * COS_LAT;
  const dataH = (LAT_MAX - LAT_MIN);
  // Fit data into COUNTRY_VB using uniform scale, centered.
  const sx = COUNTRY_VB.w / dataW;
  const sy = COUNTRY_VB.h / dataH;
  const SCALE = Math.min(sx, sy);
  const offX = COUNTRY_VB.x + (COUNTRY_VB.w - dataW*SCALE)/2;
  const offY = COUNTRY_VB.y + (COUNTRY_VB.h - dataH*SCALE)/2;

  function projCountry(lon, lat){
    const x = offX + (lon - LON_MIN) * COS_LAT * SCALE;
    const y = offY + (LAT_MAX - lat) * SCALE;
    return [x, y];
  }

  // Local viewBox for kunta drill-down (per vaalipiiri). Fits the vp's bbox
  // into a 0..400 box uniformly.
  function makeLocalProjector(bbox){
    const [w,s,e,n] = bbox; // west south east north (lon/lat)
    const cosLat = Math.cos((s+n)/2 * Math.PI/180);
    const dW = (e-w)*cosLat;
    const dH = (n-s);
    const SIZE = 400;
    const PAD = 12;
    const inner = SIZE - PAD*2;
    const sc = Math.min(inner/dW, inner/dH);
    const ox = PAD + (inner - dW*sc)/2;
    const oy = PAD + (inner - dH*sc)/2;
    return (lon,lat)=>[ ox + (lon-w)*cosLat*sc, oy + (n-lat)*sc ];
  }

  // Walk lon/lat coords array, project each point, return same nested shape.
  function projectCoords(coords, project){
    if (typeof coords[0] === "number") return project(coords[0], coords[1]);
    return coords.map(c => projectCoords(c, project));
  }

  // Convert projected polygon/multipolygon to SVG path "d".
  function geomToPath(geom, project){
    const out = [];
    function ring(r){
      r.forEach((p,i)=>{
        const [x,y] = project(p[0], p[1]);
        out.push((i===0?"M":"L") + x.toFixed(1) + "," + y.toFixed(1));
      });
      out.push("Z");
    }
    if (geom.type === "Polygon"){
      for (const r of geom.coordinates) ring(r);
    } else if (geom.type === "MultiPolygon"){
      for (const poly of geom.coordinates) for (const r of poly) ring(r);
    }
    return out.join(" ");
  }

  // Largest-ring centroid + total area (in projected units) of a geometry.
  function ringArea(ring){
    let a = 0;
    for (let i=0,j=ring.length-1; i<ring.length; j=i++){
      a += (ring[j][0]+ring[i][0]) * (ring[j][1]-ring[i][1]);
    }
    return Math.abs(a/2);
  }
  function bestCentroid(geom, project){
    let bestRing = null, bestA = 0;
    function tryRing(r){
      const projected = r.map(p=>project(p[0],p[1]));
      const a = ringArea(projected);
      if (a>bestA){ bestA = a; bestRing = projected; }
    }
    if (geom.type==="Polygon") for (const r of geom.coordinates) tryRing(r);
    else for (const poly of geom.coordinates) for (const r of poly) tryRing(r);
    if (!bestRing) return { cx:0, cy:0, area:0 };
    let sx=0, sy=0;
    for (const p of bestRing){ sx+=p[0]; sy+=p[1]; }
    return { cx: sx/bestRing.length, cy: sy/bestRing.length, area: bestA };
  }

  function bboxOfGeom(geom){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    function walk(a){
      if (typeof a[0]==="number"){
        if(a[0]<minX)minX=a[0]; if(a[1]<minY)minY=a[1];
        if(a[0]>maxX)maxX=a[0]; if(a[1]>maxY)maxY=a[1]; return;
      }
      for (const x of a) walk(x);
    }
    walk(geom.coordinates);
    return [minX,minY,maxX,maxY];
  }

  // ─────────────────────────────────────────────────────────────
  // Synchronously load the JSON files via XHR. They sit next to the
  // HTML so this works file:// and http(s):// alike.
  // ─────────────────────────────────────────────────────────────
  function loadJsonSync(path){
    const xhr = new XMLHttpRequest();
    xhr.open("GET", path, false);
    xhr.send(null);
    if (xhr.status !== 200 && xhr.status !== 0) {
      throw new Error("Could not load "+path+" (status "+xhr.status+")");
    }
    return JSON.parse(xhr.responseText);
  }

  let VP_GEO, KU_GEO;
  try {
    VP_GEO = loadJsonSync("data/fi-vaalipiirit.json");
    KU_GEO = loadJsonSync("data/fi-kunnat.json");
  } catch(e){
    console.error("[wf-geo] failed to load geo data:", e);
    VP_GEO = { features: [] };
    KU_GEO = { features: [] };
  }

  // Build country-projected vaalipiirit list.
  const VAALIPIIRIT = VP_GEO.features.map(f => {
    const c = bestCentroid(f.geometry, projCountry);
    return {
      id: f.id,
      label: f.label || VP_LABELS[f.id] || f.id,
      d: geomToPath(f.geometry, projCountry),
      cx: c.cx, cy: c.cy, area: c.area,
      _bbox: bboxOfGeom(f.geometry),     // lon/lat bbox, used for kunta projection
    };
  });
  const VP_BY_ID = Object.fromEntries(VAALIPIIRIT.map(v => [v.id, v]));

  // Build kunnat per vaalipiiri, projected into each vp's local box.
  // Each kunta carries its real kuntakoodi as id (e.g. "091" Helsinki) AND
  // a legacy alias `${vpId}_${index}` for back-compat with existing demo
  // data keys. The map renderer uses the real id; data lookups use either.
  const KUNNAT = {};
  // group features by vp first
  const byVp = {};
  for (const f of KU_GEO.features){
    if (!f.vp) continue;
    (byVp[f.vp] = byVp[f.vp] || []).push(f);
  }
  for (const vp of VAALIPIIRIT){
    const list = byVp[vp.id] || [];
    if (!list.length){ KUNNAT[vp.id] = []; continue; }
    // Build a local projector that uses the vp bbox so kunnat fill the box.
    const project = makeLocalProjector(vp._bbox);
    KUNNAT[vp.id] = list.map(f => {
      const c = bestCentroid(f.geometry, project);
      return {
        id: f.id,                    // real kuntakoodi, e.g. "091"
        kuntakoodi: f.id,
        vp: vp.id,
        label: f.label,
        d: geomToPath(f.geometry, project),
        cx: c.cx, cy: c.cy, area: c.area,
      };
    });
  }

  // Flat lookup by kuntakoodi for variants/breadcrumbs.
  const KUNTA_BY_ID = {};
  for (const vpId of Object.keys(KUNNAT)){
    for (const k of KUNNAT[vpId]) KUNTA_BY_ID[k.id] = k;
  }

  // The country viewBox the renderer should use.
  const COUNTRY_VIEWBOX = `${COUNTRY_VB.x} ${COUNTRY_VB.y} ${COUNTRY_VB.w} ${COUNTRY_VB.h}`;

  Object.assign(window, {
    VAALIPIIRIT, VP_BY_ID, KUNNAT, KUNTA_BY_ID,
    COUNTRY_VIEWBOX,
  });
})();
