// main.js - full system logic: sources -> allocation -> batteries -> destinations -> charts + analytics + settings
import { getSolarPower, getWindPower, getHydroPower } from "./simulation.js";




document.querySelectorAll("form").forEach(f => {
    f.addEventListener("submit", e => e.preventDefault());
});



// ---- CONFIG ----
const BASE_TICK_MS = 2000;          // 2 seconds per tick
const TICK_MS = BASE_TICK_MS;
const BASE_TICK_HOURS = TICK_MS / 1000 / 3600; // kW -> kWh conversion
const HISTORY_POINTS = 30;

let speedMultiplier = 1;// 1x, 2x, 5x, 10x
let tickRunning = false;
let tickIntervalId = null;
function startTickLoop(){
    if(tickIntervalId) clearInterval(tickIntervalId);
    tickIntervalId = setInterval(tick, Math.max(200, TICK_MS / speedMultiplier));
}


// Initial state
const state = {
    sources: {
        solar: { enabled: true, light: 80, toOutPct: 80, availableKW: 0, history: [] },
        wind: { enabled: true, speed: 8, toOutPct: 70, availableKW: 0, history: [] },
        hydro: { enabled: true, flow: 50, toOutPct: 60, availableKW: 0, history: [] },
        diesel: { enabled: false, on: false, toOutPct: 100, availableKW: 0, history: [] }
    },
    batteries: [],  // {id, capacity_kwh, stored_kwh, maxChargeKW, maxDischargeKW}
    destinations: [], // {id, name, allocPct, lastRecvKW}
    totals: {
        gen_kwh: 0,
        out_kwh: 0,
        saved_kwh: 0,
        perSource_kwh: { solar: 0, wind: 0, hydro: 0, diesel: 0 }
    },
    historyCombined: { gen: [], out: [], timeLabels: [] },
    historyBattery: [], // total stored kWh over time
    shedding: { active: false, shedCount: 0 },
    grid: {
        mode: "grid",
        importKW: 0,
        exportKW: 0
    },
    hybrid: {
        enabled: false,
        chargePct: 100
    },

    weather: {
        enabled: false,
        time: 0,              // minutes from 0 to 1440 (full day)
        sunlight: 0,          // 0–100
        wind: 0,              // 0–100
        hydro: 0,              // 0–100
        manualTime: true,   // if true → use slider value, not auto ticking
    },


};

// ---- Charts placeholders ----
let charts = {
    solar: null,
    wind: null,
    hydro: null,
    diesel: null,
    combined: null,
    stackedInputs: null,
    analyticsSourcePie: null,
    analyticsGenTrend: null,
    analyticsBatteryTrend: null,
    analyticsDestinations: null,
    destTrend: null,
    analyticsDestConsumePie: null,
    analyticsDestWasteBar: null
};
let destMiniCharts = {}; // id -> Chart instance
let pendingConfirmCb = null;
function showConfirm({title, desc, label="Remove", onConfirm}){
    const m=q('confirmModal'), t=q('confirmTitle'), d=q('confirmDesc'), ok=q('confirmOk');
    if(!m||!t) return onConfirm && onConfirm();
    t.textContent=title; if(d) d.textContent=desc||''; if(ok) ok.textContent=label;
    m.style.display='flex'; pendingConfirmCb=onConfirm;
    document.body.style.overflow='hidden';
}
function hideConfirm(){
    const m=q('confirmModal'); if(m) m.style.display='none'; pendingConfirmCb=null;
    document.body.style.overflow='';
}
q('confirmCancel')?.addEventListener('click', hideConfirm);
q('confirmBackdrop')?.addEventListener('click', hideConfirm);
q('confirmOk')?.addEventListener('click', ()=>{ const cb=pendingConfirmCb; hideConfirm(); if(cb) cb(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') hideConfirm(); });

function getDashboardMode(){ return localStorage.getItem('dashboardMode') || 'simulation'; }
let dashboardMode = getDashboardMode();
function resetHistoriesToStaticZero(){
    const z = Array(HISTORY_POINTS).fill(0);
    const zl = Array(HISTORY_POINTS).fill('');
    ['solar','wind','hydro','diesel'].forEach(k=>{ if(state.sources[k]) state.sources[k].history = [...z]; state.sources[k].availableKW = 0; });
    state.historyCombined.gen = [...z];
    state.historyCombined.out = [...z];
    state.historyCombined.timeLabels = [...zl];
    const stored = state.batteries.reduce((s,b)=>s+b.stored_kwh,0) || 0;
    state.historyBattery = Array(HISTORY_POINTS).fill(stored);
    // destinations
    state.destinations.forEach(d=>{
        if(!d.history) d.history={incoming:[], consuming:[], wasting:[]};
        d.history.incoming=[...z]; d.history.consuming=[...z]; d.history.wasting=[...z];
        d.incoming=0; d.consuming=0; d.wasting=0; d.lastRecvKW=0; d.shedKW=0;
    });
    // push zeros into charts immediately (no decay animation)
    ['solar','wind','hydro','diesel'].forEach(k=>{ if(charts[k]) { charts[k].data.datasets[0].data=[...z]; charts[k].data.labels=[...zl]; try{charts[k].update();}catch{} }});
    if(charts.combined){
        charts.combined.data.labels=[...zl];
        charts.combined.data.datasets.forEach(ds=> ds.data=[...z].map((v,i)=> ds.label.includes('Forecast')? null : 0));
        // keep forecast dataset as nulls
        if(charts.combined.data.datasets[1] && charts.combined.data.datasets[1].label.includes('Forecast')) charts.combined.data.datasets[1].data=Array(HISTORY_POINTS).fill(null);
        try{charts.combined.update();}catch{}
    }
    if(charts.stackedInputs){
        charts.stackedInputs.data.labels=[...zl];
        charts.stackedInputs.data.datasets.forEach(ds=> ds.data=[...z]);
        try{charts.stackedInputs.update();}catch{}
    }
    if(charts.destTrend){ charts.destTrend.data.labels=[...zl]; charts.destTrend.data.datasets.forEach(ds=> ds.data=[...z]); try{charts.destTrend.update();}catch{} }
    Object.values(destMiniCharts).forEach(ch=>{ try{ ch.data.labels=[...zl]; ch.data.datasets.forEach(ds=> ds.data=[...z]); ch.update(); }catch{} });
    // analytics
    if(q('solarGauge')) q('solarGauge').innerText='0 kW';
    if(q('windGauge')) q('windGauge').innerText='0 kW';
    if(q('hydroGauge')) q('hydroGauge').innerText='0 kW';
    if(q('dieselGauge')) q('dieselGauge').innerText='0 kW';
    if(q('topGen')) q('topGen').innerText='0 kW';
    if(q('topOut')) q('topOut').innerText='0 kW';
}
function applyModeUI(){
    dashboardMode = getDashboardMode();
    const isReal = dashboardMode === 'real';
    const viewer = isViewer();
    const banner=q('realBanner'); if(banner) banner.style.display=isReal?'flex':'none';
    const badge=q('modeBadge'), dot=q('modeDot'), label=q('modeBadgeLabel');
    if(badge){
        badge.style.background = isReal ? '#0f1a14' : '#0a0a0a';
        badge.style.borderColor = isReal ? 'rgba(16,185,129,0.30)' : '#1f1f1f';
        badge.style.color = isReal ? '#10b981' : '#888';
    }
    if(dot){ dot.style.background = isReal ? '#10b981' : '#fff'; dot.style.boxShadow = isReal ? '0 0 8px rgba(16,185,129,0.6)' : 'none'; }
    if(label){ label.textContent = isReal ? 'REAL' : 'SIMULATION'; }
    document.querySelectorAll('.pill-row').forEach(el=>{ el.style.opacity=(isReal||viewer)?'0.45':'1'; el.style.pointerEvents=(isReal||viewer)?'none':'auto'; });
    ['solarLight','windSpeed','hydroFlow','solarToOut','windToOut','hydroToOut','dieselToOut','weatherEnabled','weatherTimeSlider','gridMode','gridModeGrid','autoBalanceToggle'].forEach(id=>{ const el=q(id); if(el){ const dis = isReal || viewer; el.disabled=dis; el.style.opacity=dis?'0.4':'1'; }});
    ['forceAllToOutput','forceAllToBattery'].forEach(id=>{ const el=q(id); if(el) el.style.display=(isReal||viewer)?'none':'inline-flex'; });
    document.body.classList.toggle('real-mode', isReal);
    if(isReal){
        // already look like real — static 0 line, no drop animation
        resetHistoriesToStaticZero();
        try{ updateAnalyticsCharts(); updateDestinationsPageCharts(); }catch{}
    }
    // re-apply viewer lock after real mode toggles
    if(viewer) applyRolePermissions();
}
document.addEventListener('DOMContentLoaded', applyModeUI);
window.addEventListener('storage', applyModeUI);

// ---- Utils ----
function q(id) { return document.getElementById(id); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function nowLabel() { return new Date().toLocaleTimeString(); }
function uid(prefix = 'id') { return prefix + Math.random().toString(36).slice(2, 9); }
function pushHistory(arr, v) { arr.push(v); if (arr.length > HISTORY_POINTS) arr.shift(); }

// ---- Battery helpers ----
function addBattery(capacity_kwh, maxChargeKW, maxDischargeKW, initial_kwh = 0) {
    const b = {
        id: uid('bat'),
        capacity_kwh,
        stored_kwh: clamp(initial_kwh, 0, capacity_kwh),
        maxChargeKW,
        maxDischargeKW
    };
    state.batteries.push(b);
    renderBatteriesUI();
    updateSummaryCapacity();
}

function renderBatteriesUI() {
    const container = q('batteriesContainer');
    if (!container) return;
    container.innerHTML = '';
    state.batteries.forEach(b => {
        const card = document.createElement('article');
        card.className = 'card';
        card.innerHTML = `
      <h4>Battery ${b.id}</h4>
      <div>Capacity: <strong>${b.capacity_kwh}</strong> kWh</div>
      <div>Stored: <strong id="stored-${b.id}">${b.stored_kwh.toFixed(2)}</strong> kWh</div>
      <div>Charge rate: ${b.maxChargeKW} kW | Discharge rate: ${b.maxDischargeKW} kW</div>
      <div class="battery-visual"><div id="bar-${b.id}" style="height:${(b.stored_kwh / b.capacity_kwh) * 100}%"></div></div>
      <button data-bid="${b.id}" class="action-btn removeBatteryBtn">Remove</button>
    `;
        container.appendChild(card);
    });

    document.querySelectorAll('.removeBatteryBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-bid');
            const b = state.batteries.find(x=>x.id===id);
            showConfirm({
                title: `Remove battery ${id.slice(-4)}?`,
                desc: b ? `${b.capacity_kwh} kWh • ${b.stored_kwh.toFixed(1)} kWh stored will be lost.` : 'This cannot be undone.',
                label: 'Remove Battery',
                onConfirm: ()=>{
                    state.batteries = state.batteries.filter(x => x.id !== id);
                    renderBatteriesUI();
                    updateSummaryCapacity();
                }
            });
        });
    });
}

function updateSummaryCapacity() {
    const cap = state.batteries.reduce((s, b) => s + b.capacity_kwh, 0);
    if (q('summaryCapacity')) q('summaryCapacity').innerText = cap.toFixed(2);
}

function chargeBatteries(available_kwh) {
    let remaining = available_kwh;
    const effTickHours = BASE_TICK_HOURS;
    for (const b of state.batteries) {
        if (remaining <= 0) break;
        const canAccept_kwh = b.capacity_kwh - b.stored_kwh;
        if (canAccept_kwh <= 0) continue;
        const perTickLimit = b.maxChargeKW * effTickHours;
        const chargeThis = Math.min(canAccept_kwh, perTickLimit, remaining);
        b.stored_kwh += chargeThis;
        remaining -= chargeThis;
    }
    return remaining;
}

function dischargeBatteries(deficit_kwh) {
    let need = deficit_kwh;
    let provided = 0;
    const effTickHours = BASE_TICK_HOURS;
    const order = [...state.batteries].sort((a, b) => b.stored_kwh - a.stored_kwh);
    for (const b of order) {
        if (need <= 0) break;
        const avail_kwh = b.stored_kwh;
        if (avail_kwh <= 0) continue;
        const perTickLimit = b.maxDischargeKW * effTickHours;
        const take = Math.min(avail_kwh, perTickLimit, need);
        b.stored_kwh -= take;
        need -= take;
        provided += take;
    }
    return provided;
}

// ---- Destinations ----
function renderDestinationsUI() {
    const container = q('destinationsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (state.destinations.length === 0) {
        container.innerHTML = '<p>No destinations added. Add one to allocate output.</p>';
        return;
    }

    state.destinations.forEach(dest => {
        if (dest.priority == null) dest.priority = 2;
        if (dest.demandKW == null) dest.demandKW = 50;
        if (dest.lastRecvKW == null) dest.lastRecvKW = 0;
        if (dest.shedKW == null) dest.shedKW = 0;

        const row = document.createElement('div');
        row.style.marginBottom = '8px';
        row.innerHTML = `
      <div class="dest-row">
        <div class="dest-header" style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${dest.name}</strong>
          <span id="destStatus-${dest.id}" class="status-badge ${dest.shedKW > 0 ? 'error' : 'active'}">
            ${dest.shedKW > 0 ? 'SHED' : 'OK'}
          </span>
        </div>

        <div class="dest-controls" style="display:flex;flex-direction:column;gap:4px;margin:6px 0;">
          <label>Priority:
            <select class="destPriority" data-did="${dest.id}">
              <option value="1"${dest.priority === 1 ? ' selected' : ''}>1 (Critical)</option>
              <option value="2"${dest.priority === 2 ? ' selected' : ''}>2</option>
              <option value="3"${dest.priority === 3 ? ' selected' : ''}>3</option>
              <option value="4"${dest.priority === 4 ? ' selected' : ''}>4 (Low)</option>
            </select>
          </label>

          <label>Demand:
            <input type="range" min="0" max="500" value="${dest.demandKW}" class="destDemand" data-did="${dest.id}">
            <span id="destDemandVal-${dest.id}">${dest.demandKW} kW</span>
          </label>
        </div>

        <div>Supplied: <span id="destRecv-${dest.id}">${dest.lastRecvKW.toFixed(2)}</span> kW</div>
        <button data-did="${dest.id}" class="action-btn removeDestBtn" style="margin-top:6px;">Remove</button>
      </div>
    `;
        container.appendChild(row);
    });

    // priority change
    document.querySelectorAll('.destPriority').forEach(sel => {
        sel.addEventListener('change', () => {
            const id = sel.getAttribute('data-did');
            const d = state.destinations.find(x => x.id === id);
            if (d) d.priority = parseInt(sel.value);
        });
    });

    // demand slider
    document.querySelectorAll('.destDemand').forEach(sl => {
        sl.addEventListener('input', () => {
            const id = sl.getAttribute('data-did');
            const v = parseInt(sl.value);
            const d = state.destinations.find(x => x.id === id);
            if (d) d.demandKW = v;
            const label = q(`destDemandVal-${id}`);
            if (label) label.innerText = v + ' kW';
        });
    });

    // remove button — confirm
    document.querySelectorAll('.removeDestBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-did');
            const d = state.destinations.find(x=>x.id===id);
            showConfirm({
                title: d ? `Remove destination "${d.name}"?` : 'Remove destination?',
                desc: d ? `Demand ${d.demandKW} kW will be deallocated.` : 'This cannot be undone.',
                label: 'Remove Destination',
                onConfirm: ()=>{
                    state.destinations = state.destinations.filter(x => x.id !== id);
                    renderDestinationsUI();
                    renderDestinationsPage();
                }
            });
        });
    });
}


function renderDestinationsPage(){
    const grid = q('destinationsGrid');
    if(!grid) return;
    // remember existing ids to preserve charts
    const existingIds = new Set(state.destinations.map(d=>d.id));
    // remove old charts for deleted dests
    Object.keys(destMiniCharts).forEach(id=>{ if(!existingIds.has(id)){ try{destMiniCharts[id].destroy()}catch{}; delete destMiniCharts[id] }});
    grid.innerHTML='';
    if(state.destinations.length===0){
        grid.innerHTML='<p style="font-family:var(--mono);font-size:11px;color:var(--muted)">No destinations. Add one above.</p>';
        return;
    }
    state.destinations.forEach(dest=>{
        // ensure shape
        if(!dest.history) dest.history={incoming:[], consuming:[], wasting:[]};
        if(dest.efficiency==null) dest.efficiency=0.85;
        if(!dest.totals) dest.totals={incoming_kwh:0, consuming_kwh:0, wasting_kwh:0};
        if(dest.incoming==null) dest.incoming=dest.lastRecvKW||0;
        if(dest.consuming==null) dest.consuming=(dest.lastRecvKW||0)*dest.efficiency;
        if(dest.wasting==null) dest.wasting=(dest.lastRecvKW||0)*(1-dest.efficiency);
        const effPct=Math.round(dest.efficiency*100);
        const sliderMax=Math.max(500, Math.ceil((dest.demandKW+500)/100)*100);
        const card=document.createElement('article');
        card.className='card';
        card.innerHTML=`
          <h4>${dest.name} <span id="destPageStatus-${dest.id}" class="status-badge ${dest.shedKW>0.1?'error':'active'}" style="margin-left:6px">${dest.shedKW>0.1?'SHED '+dest.shedKW.toFixed(0)+' kW':'OK'}</span></h4>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
            <div style="text-align:center;padding:6px;border:1px solid var(--border);border-radius:8px"><div style="font-family:var(--mono);font-size:9px;color:var(--muted-2)">INCOMING</div><div id="destPageInc-${dest.id}" style="font-family:var(--mono);font-weight:700">${(dest.incoming||0).toFixed(1)} kW</div></div>
            <div style="text-align:center;padding:6px;border:1px solid rgba(16,185,129,0.25);border-radius:8px"><div style="font-family:var(--mono);font-size:9px;color:#10b981">CONSUMING</div><div id="destPageCon-${dest.id}" style="font-family:var(--mono);font-weight:700;color:#10b981">${(dest.consuming||0).toFixed(1)} kW</div></div>
            <div style="text-align:center;padding:6px;border:1px solid rgba(245,158,11,0.25);border-radius:8px"><div style="font-family:var(--mono);font-size:9px;color:#f59e0b">WASTING</div><div id="destPageWst-${dest.id}" style="font-family:var(--mono);font-weight:700;color:#f59e0b">${(dest.wasting||0).toFixed(1)} kW</div></div>
          </div>
          <canvas id="destChart-${dest.id}" class="mini-chart" style="height:84px"></canvas>
          <label>Demand (kW)</label>
          <input type="range" min="0" max="${sliderMax}" value="${Math.min(dest.demandKW, sliderMax)}" data-did="${dest.id}" class="destPageDemand">
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px"><span style="font-family:var(--mono);font-size:11px">${dest.demandKW} kW ${dest.shedKW>0.1?'<span style="color:#ff6b6b">• shed '+dest.shedKW.toFixed(1)+' kW</span>':''}</span><input type="number" value="${dest.demandKW}" data-did="${dest.id}" class="destPageDemandNum" style="margin-left:auto;width:90px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);background:#0a0f12;color:var(--text);font-family:var(--mono);font-size:12px"></div>
          <label>Efficiency — consuming %</label>
          <input type="range" min="50" max="98" value="${effPct}" data-did="${dest.id}" class="destPageEff">
          <span style="font-family:var(--mono);font-size:11px">${effPct}% consuming • ${100-effPct}% waste</span>
          <label>Priority</label>
          <select data-did="${dest.id}" class="destPagePriority"><option value="1"${dest.priority===1?' selected':''}>1 Critical</option><option value="2"${dest.priority===2?' selected':''}>2 High</option><option value="3"${dest.priority===3?' selected':''}>3 Normal</option><option value="4"${dest.priority===4?' selected':''}>4 Low</option></select>
          <button data-did="${dest.id}" class="action-btn removeDestPageBtn" style="margin-top:8px;width:100%;border-color:rgba(255,62,62,0.25);color:#ff9a9a;background:rgba(255,62,62,0.06)">Remove</button>
        `;
        grid.appendChild(card);
    });
    // init mini charts
    state.destinations.forEach(dest=>{
        const el=q(`destChart-${dest.id}`);
        if(!el || typeof Chart==='undefined') return;
        if(destMiniCharts[dest.id]){ try{destMiniCharts[dest.id].destroy()}catch{} }
        destMiniCharts[dest.id]=new Chart(el.getContext('2d'),{
            type:'line',
            data:{labels:Array(HISTORY_POINTS).fill(''), datasets:[
                {label:'Incoming', data:(dest.history.incoming||[]).slice(), borderColor:'#e6f0f2', backgroundColor:'rgba(230,240,242,0.08)', borderWidth:1.4, pointRadius:0, tension:0.35, fill:false},
                {label:'Consuming', data:(dest.history.consuming||[]).slice(), borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.08)', borderWidth:1.4, pointRadius:0, tension:0.35, fill:false},
                {label:'Wasting', data:(dest.history.wasting||[]).slice(), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.08)', borderWidth:1.4, pointRadius:0, tension:0.35, fill:false}
            ]},
            options:{responsive:true, animation:false, scales:{x:{display:false}, y:{beginAtZero:true, grid:{color:'rgba(35,48,56,0.5)'}, ticks:{color:'#5f737d', font:{family:'JetBrains Mono', size:8}}, border:{display:false}}}, plugins:{legend:{labels:{color:'#8a9ba3', font:{family:'JetBrains Mono', size:8}, boxWidth:10, usePointStyle:true}}}}
        });
    });
    // bind controls — slider and number input stay in sync and slider max auto-scales with demand
    grid.querySelectorAll('.destPageDemand').forEach(sl=> sl.addEventListener('input', e=>{
        const id=e.target.getAttribute('data-did'); const d=state.destinations.find(x=>x.id===id); if(!d) return;
        d.demandKW=parseInt(e.target.value)||0;
        const num=grid.querySelector(`.destPageDemandNum[data-did="${id}"]`); if(num) num.value=d.demandKW;
        const newMax=Math.max(500, Math.ceil((d.demandKW+500)/100)*100); e.target.max=newMax;
    }));
    grid.querySelectorAll('.destPageDemandNum').forEach(inp=> inp.addEventListener('input', e=>{
        const id=e.target.getAttribute('data-did'); const d=state.destinations.find(x=>x.id===id); if(!d) return;
        d.demandKW=parseInt(e.target.value)||0;
        const sl=grid.querySelector(`.destPageDemand[data-did="${id}"]`); if(sl){ const newMax=Math.max(500, Math.ceil((d.demandKW+500)/100)*100); sl.max=newMax; sl.value=Math.min(d.demandKW, newMax); }
    }));
    grid.querySelectorAll('.destPageEff').forEach(sl=> sl.addEventListener('input', e=>{ const id=e.target.getAttribute('data-did'); const d=state.destinations.find(x=>x.id===id); if(d) d.efficiency=parseInt(e.target.value)/100 }));
    grid.querySelectorAll('.destPagePriority').forEach(sel=> sel.addEventListener('change', e=>{ const id=e.target.getAttribute('data-did'); const d=state.destinations.find(x=>x.id===id); if(d) d.priority=parseInt(e.target.value)}));
    grid.querySelectorAll('.removeDestPageBtn').forEach(btn=> btn.addEventListener('click', ()=>{
        const id=btn.getAttribute('data-did');
        const d=state.destinations.find(x=>x.id===id);
        showConfirm({
            title: d ? `Remove destination "${d.name}"?` : 'Remove destination?',
            desc: d ? `Demand ${d.demandKW} kW • ${d.incoming.toFixed(1)} kW incoming will be deallocated.` : 'This cannot be undone.',
            label: 'Remove Destination',
            onConfirm: ()=>{
                state.destinations=state.destinations.filter(x=>x.id!==id);
                try{destMiniCharts[id].destroy()}catch{}; delete destMiniCharts[id];
                renderDestinationsUI(); renderDestinationsPage();
            }
        });
    }));
}

function addDestination(name = 'Dest ' + (state.destinations.length + 1), opts = {}) {
    const id = uid('dst');
    state.destinations.push({
        id,
        name,
        priority: opts.priority ?? 2,
        demandKW: opts.demandKW ?? 50,
        efficiency: opts.efficiency ?? 0.85,
        lastRecvKW: 0,
        shedKW: 0,
        incoming: 0,
        consuming: 0,
        wasting: 0,
        history: { incoming: [], consuming: [], wasting: [] },
        totals: { incoming_kwh: 0, consuming_kwh: 0, wasting_kwh: 0 }
    });
    renderDestinationsUI();
    renderDestinationsPage();
}


// ---- Charts init — LAB THEME ----
function initCharts() {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#8a9ba3';
        Chart.defaults.borderColor = 'rgba(35,48,56,0.9)';
        Chart.defaults.font.family = 'JetBrains Mono';
        Chart.defaults.font.size = 10;
    }
    function makeLineChart(ctxId, label, color) {
        const el = q(ctxId);
        if (!el || typeof Chart === 'undefined') return null;
        return new Chart(el.getContext('2d'), {
            type: 'line',
            data: { labels: Array(HISTORY_POINTS).fill(''), datasets: [{ label, data: Array(HISTORY_POINTS).fill(0), borderColor: color, backgroundColor: color + '14', borderWidth: 1.5, pointRadius: 0, tension: 0.35, fill: false }] },
            options: {
                responsive: true, animation: false,
                scales: {
                    x: { display: false, grid: { color: 'rgba(35,48,56,0.5)' } },
                    y: { grid: { color: 'rgba(35,48,56,0.6)' }, ticks: { color: '#5f737d', font: { family: 'JetBrains Mono', size: 9 } }, border: { display: false } }
                },
                plugins: { legend: { labels: { color: '#8a9ba3', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 12, usePointStyle: true } } }
            }
        });
    }

    // vibrant trifecta — wind/hydro swapped (wind=emerald, hydro=sky)
    charts.solar = makeLineChart('solarChart', 'Solar (kW)', '#f59e0b');
    charts.wind = makeLineChart('windChart', 'Wind (kW)', '#10b981');
    charts.hydro = makeLineChart('hydroChart', 'Hydro (kW)', '#38bdf8');
    charts.diesel = makeLineChart('dieselChart', 'Diesel (kW)', '#52525b');

    const cEl = q('combinedChart');
    if (cEl && typeof Chart !== 'undefined') {
        charts.combined = new Chart(cEl.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array(HISTORY_POINTS).fill(''),
                datasets: [
                    {
                        label: 'Generation (Actual)',
                        data: Array(HISTORY_POINTS).fill(0),
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245,158,11,0.08)',
                        borderWidth: 1.8, pointRadius: 0, tension: 0.35,
                        fill: false
                    },
                    {
                        label: 'Generation (Forecast)',
                        data: Array(HISTORY_POINTS).fill(null),
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56,189,248,0.06)',
                        borderDash: [6, 6], borderWidth: 1.4, pointRadius: 0, tension: 0.35,
                        fill: false
                    },
                    {
                        label: 'Output (kW)',
                        data: Array(HISTORY_POINTS).fill(0),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.08)',
                        borderWidth: 1.8, pointRadius: 0, tension: 0.35,
                        fill: false
                    }
                ]

            },
            options: {
                responsive: true, animation: false,
                scales: {
                    x: { grid: { color: 'rgba(35,48,56,0.4)' }, ticks: { color: '#5f737d', font: { family: 'JetBrains Mono', size: 9 } }, border: { display: false } },
                    y: { grid: { color: 'rgba(35,48,56,0.6)' }, ticks: { color: '#5f737d', font: { family: 'JetBrains Mono', size: 9 } }, border: { display: false } }
                },
                plugins: { legend: { labels: { color: '#8a9ba3', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 12, usePointStyle: true } } }
            }
        });
    }

    const sEl = q('stackedInputsChart');
    if (sEl && typeof Chart !== 'undefined') {
        charts.stackedInputs = new Chart(sEl.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Array(HISTORY_POINTS).fill(''),
                datasets: [
                    { label: 'Solar', data: Array(HISTORY_POINTS).fill(0), backgroundColor: '#f59e0b', borderRadius: 4 },
                    { label: 'Wind', data: Array(HISTORY_POINTS).fill(0), backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'Hydro', data: Array(HISTORY_POINTS).fill(0), backgroundColor: '#38bdf8', borderRadius: 4 },
                    { label: 'Diesel', data: Array(HISTORY_POINTS).fill(0), backgroundColor: '#52525b', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, animation: false,
                scales: {
                    x: { display: false, stacked: true, grid: { display: false } },
                    y: { beginAtZero: true, stacked: true, grid: { color: 'rgba(35,48,56,0.6)' }, ticks: { color: '#5f737d', font: { family: 'JetBrains Mono', size: 9 } }, border: { display: false } }
                },
                plugins: { legend: { position: 'bottom', labels: { color: '#8a9ba3', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 10, usePointStyle: true } } }
            }
        });
    }

    const pieEl = q('analyticsSourcePie');
    if (pieEl && typeof Chart !== 'undefined') {
        charts.analyticsSourcePie = new Chart(pieEl.getContext('2d'), {
            type: 'pie',
            data: {
                labels: ['Solar', 'Wind', 'Hydro', 'Diesel'],
                datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#f59e0b', '#10b981', '#38bdf8', '#52525b'] }]
            },
            options: { responsive: true, animation: false }
        });
    }

    const genEl = q('analyticsGenTrend');
    if (genEl && typeof Chart !== 'undefined') {
        charts.analyticsGenTrend = new Chart(genEl.getContext('2d'), {
            type: 'line',
            data: { labels: Array(HISTORY_POINTS).fill(''), datasets: [{ label: 'Generation (kW)', data: Array(HISTORY_POINTS).fill(0), borderColor: '#f59e0b', backgroundColor:'rgba(245,158,11,0.08)', fill:false, tension: 0.35, pointRadius:0, borderWidth:1.6 }] },
            options: { responsive: true, animation: false }
        });
    }

    const batEl = q('analyticsBatteryTrend');
    if (batEl && typeof Chart !== 'undefined') {
        charts.analyticsBatteryTrend = new Chart(batEl.getContext('2d'), {
            type: 'line',
            data: { labels: Array(HISTORY_POINTS).fill(''), datasets: [{ label: 'Stored (kWh)', data: Array(HISTORY_POINTS).fill(0), borderColor: '#10b981', backgroundColor:'rgba(16,185,129,0.08)', fill:false, tension: 0.35, pointRadius:0, borderWidth:1.6 }] },
            options: { responsive: true, animation: false }
        });
    }

    const destEl = q('analyticsDestinations');
    if (destEl && typeof Chart !== 'undefined') {
        charts.analyticsDestinations = new Chart(destEl.getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Destinations (kW)', data: [], backgroundColor: '#10b981', borderRadius:4 }] },
            options: { responsive: true, animation: false, scales: { y: { beginAtZero: true } } }
        });
    }
    const destTrendEl = q('destTrendChart');
    if(destTrendEl && typeof Chart !== 'undefined'){
        charts.destTrend = new Chart(destTrendEl.getContext('2d'),{
            type:'line',
            data:{labels:Array(HISTORY_POINTS).fill(''), datasets:[
                {label:'Incoming', data:Array(HISTORY_POINTS).fill(0), borderColor:'#e6f0f2', backgroundColor:'rgba(230,240,242,0.08)', borderWidth:1.6, tension:0.35, fill:false, pointRadius:0},
                {label:'Consuming', data:Array(HISTORY_POINTS).fill(0), borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.08)', borderWidth:1.6, tension:0.35, fill:false, pointRadius:0},
                {label:'Wasting', data:Array(HISTORY_POINTS).fill(0), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.08)', borderWidth:1.6, tension:0.35, fill:false, pointRadius:0}
            ]},
            options:{responsive:true, animation:false, scales:{x:{display:false}, y:{beginAtZero:true, grid:{color:'rgba(35,48,56,0.6)'}, ticks:{color:'#5f737d', font:{family:'JetBrains Mono', size:9}}, border:{display:false}}}, plugins:{legend:{labels:{color:'#8a9ba3', font:{family:'JetBrains Mono', size:9}, boxWidth:10, usePointStyle:true}}}}
        });
    }
    const destPieEl = q('analyticsDestConsumePie');
    if(destPieEl && typeof Chart !== 'undefined'){
        charts.analyticsDestConsumePie = new Chart(destPieEl.getContext('2d'),{
            type:'pie',
            data:{labels:[], datasets:[{data:[], backgroundColor:['#10b981','#f59e0b','#e6f0f2','#7c86ff','#ffb020','#00e5cc']}]},
            options:{responsive:true, animation:false}
        });
    }
    const destWasteEl = q('analyticsDestWasteBar');
    if(destWasteEl && typeof Chart !== 'undefined'){
        charts.analyticsDestWasteBar = new Chart(destWasteEl.getContext('2d'),{
            type:'bar',
            data:{labels:[], datasets:[
                {label:'Consuming', data:[], backgroundColor:'#10b981', stack:'a'},
                {label:'Wasting', data:[], backgroundColor:'#f59e0b', stack:'a'}
            ]},
            options:{responsive:true, animation:false, scales:{x:{stacked:true, grid:{display:false}, ticks:{color:'#5f737d', font:{family:'JetBrains Mono', size:9}}}, y:{stacked:true, beginAtZero:true, grid:{color:'rgba(35,48,56,0.6)'}, ticks:{color:'#5f737d', font:{family:'JetBrains Mono', size:9}}, border:{display:false}}}, plugins:{legend:{labels:{color:'#8a9ba3', font:{family:'JetBrains Mono', size:9}}}} }
        });
    }
}

function localPowerFallback(){
    const sun = state.weather.enabled ? state.weather.sunlight : state.sources.solar.light;
    const wind = state.weather.enabled ? (state.weather.wind / 100 * 25) : state.sources.wind.speed;
    const hydro = state.weather.enabled ? state.weather.hydro : state.sources.hydro.flow;
    return { solar_kw: getSolarPower(sun), wind_kw: getWindPower(wind), hydro_kw: getHydroPower(hydro) };
}
async function fetchBackendPower() {
    const payload = {
        sunlight: state.weather.enabled ? state.weather.sunlight : state.sources.solar.light,
        wind: state.weather.enabled ? (state.weather.wind / 100 * 25) : state.sources.wind.speed,
        hydro: state.weather.enabled ? state.weather.hydro : state.sources.hydro.flow
    };
    try {
        const ctrl = new AbortController();
        const t = setTimeout(()=>ctrl.abort(), 700);
        const res = await fetch("http://127.0.0.1:5000/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctrl.signal
        });
        clearTimeout(t);
        if (!res.ok) throw new Error("Backend error");
        return await res.json();
    } catch {
        return localPowerFallback();
    }
}



// ---- core tick ---- — speed actually increases interval (faster ticks), kWh per tick stays BASE_TICK_HOURS (2s simulated)
async function tick() {
    if (tickRunning) return;
    tickRunning = true;
    dashboardMode = getDashboardMode();
    if(state.weather.enabled) updateWeather();
    const s = state.sources;
    const effTickHours = BASE_TICK_HOURS;
    try {
        if(dashboardMode === 'real'){
            s.solar.availableKW = 0; s.wind.availableKW = 0; s.hydro.availableKW = 0; s.diesel.availableKW = 0;
        } else {
            const backendData = await fetchBackendPower();
            s.solar.availableKW = s.solar.enabled === false ? 0 : (backendData.solar_kw || 0);
            s.wind.availableKW = s.wind.enabled === false ? 0 : (backendData.wind_kw || 0);
            s.hydro.availableKW = s.hydro.enabled === false ? 0 : (backendData.hydro_kw || 0);
            s.diesel.availableKW = s.diesel.on ? 50 : 0;
        }
    } catch (e) {
        console.error("Tick error:", e);
        if(dashboardMode === 'real'){
            s.solar.availableKW = 0; s.wind.availableKW = 0; s.hydro.availableKW = 0; s.diesel.availableKW = 0;
        } else {
            const fb = localPowerFallback();
            if (s.solar.enabled !== false) s.solar.availableKW = fb.solar_kw; else s.solar.availableKW = 0;
            if (s.wind.enabled !== false) s.wind.availableKW = fb.wind_kw; else s.wind.availableKW = 0;
            if (s.hydro.enabled !== false) s.hydro.availableKW = fb.hydro_kw; else s.hydro.availableKW = 0;
            s.diesel.availableKW = s.diesel.on ? 50 : 0;
        }
    } finally {
        tickRunning = false;
    }




    // UI gauges
    if (q('solarGauge')) q('solarGauge').innerText = s.solar.availableKW + ' kW';
    if (q('windGauge')) q('windGauge').innerText = s.wind.availableKW + ' kW';
    if (q('hydroGauge')) q('hydroGauge').innerText = s.hydro.availableKW + ' kW';
    if (q('dieselGauge')) q('dieselGauge').innerText = s.diesel.availableKW + ' kW';

    // append histories
    pushHistory(s.solar.history, s.solar.availableKW);
    pushHistory(s.wind.history, s.wind.availableKW);
    pushHistory(s.hydro.history, s.hydro.availableKW);
    pushHistory(s.diesel.history, s.diesel.availableKW);

    // update small charts
    updateLineChart(charts.solar, s.solar.history);
    updateLineChart(charts.wind, s.wind.history);
    updateLineChart(charts.hydro, s.hydro.history);
    updateLineChart(charts.diesel, s.diesel.history);

    // 2) split into output vs surplus
    const sourceOutsKW = {
        solar: s.solar.availableKW * (s.solar.toOutPct / 100),
        wind: s.wind.availableKW * (s.wind.toOutPct / 100),
        hydro: s.hydro.availableKW * (s.hydro.toOutPct / 100),
        diesel: s.diesel.availableKW * (s.diesel.toOutPct / 100)
    };
    const sourceSurplusKW = {
        solar: s.solar.availableKW - sourceOutsKW.solar,
        wind: s.wind.availableKW - sourceOutsKW.wind,
        hydro: s.hydro.availableKW - sourceOutsKW.hydro,
        diesel: s.diesel.availableKW - sourceOutsKW.diesel
    };

    const totalGenKW = s.solar.availableKW + s.wind.availableKW + s.hydro.availableKW + s.diesel.availableKW;
    const totalOutKW = sourceOutsKW.solar + sourceOutsKW.wind + sourceOutsKW.hydro + sourceOutsKW.diesel;
    const surplusKW = Object.values(sourceSurplusKW).reduce((a, b) => a + Math.max(0, b), 0);

    // 3) destinations allocation with LOAD SHEDDING
    let remainingKW = totalOutKW;
    let shedCount = 0;

    // sort by priority: 1 (highest) → 4 (lowest)
    const sortedDests = [...state.destinations].sort((a, b) => (a.priority || 2) - (b.priority || 2));
    // ensure shape
    state.destinations.forEach(d=>{
        if(!d.history) d.history={incoming:[], consuming:[], wasting:[]};
        if(d.efficiency==null) d.efficiency=0.85;
        if(!d.totals) d.totals={incoming_kwh:0, consuming_kwh:0, wasting_kwh:0};
    });
    sortedDests.forEach(d => {
        const demand = d.demandKW || 0;
        let supplied = 0;
        if (remainingKW > 0 && demand > 0) {
            supplied = Math.min(demand, remainingKW);
            remainingKW -= supplied;
        }
        d.lastRecvKW = supplied;
        d.shedKW = Math.max(0, demand - supplied);
        if (d.shedKW > 0.1) shedCount++;
        const eff=d.efficiency??0.85;
        d.incoming=supplied;
        d.consuming=supplied*eff;
        d.wasting=supplied*(1-eff);
        pushHistory(d.history.incoming, d.incoming);
        pushHistory(d.history.consuming, d.consuming);
        pushHistory(d.history.wasting, d.wasting);
        d.totals.incoming_kwh += d.incoming * effTickHours;
        d.totals.consuming_kwh += d.consuming * effTickHours;
        d.totals.wasting_kwh += d.wasting * effTickHours;
    });

    // update shedding state
    state.shedding.active = shedCount > 0;
    state.shedding.shedCount = shedCount;

    // recompute for analytics/UI
    const totalDestKW = state.destinations.reduce((s, d) => s + (d.lastRecvKW || 0), 0);
    const localUsedKW = totalOutKW - totalDestKW;
    void localUsedKW;


    // ========== GRID MODE LOGIC ==========
    let gridImport = 0;
    let gridExport = 0;

    // total demand = sum of ALL destination demand (not supplied)
    const totalDemandKW = state.destinations.reduce((s, d) => s + d.demandKW, 0);

    // actual supply = how much was given from system output
    const totalSuppliedKW = state.destinations.reduce((s, d) => s + d.lastRecvKW, 0);

    // deficit or surplus
    const deficitKW = totalDemandKW - totalSuppliedKW;
    {// need > 0
        const surplusKW = totalOutKW - totalSuppliedKW;      // extra > 0

        const mode = state.grid.mode;

        if (mode === "grid") {
            if (deficitKW > 0) gridImport = deficitKW;
            if (surplusKW > 0) gridExport = surplusKW;
        }

        if (mode === "island") {
            // NO import/export allowed
            gridImport = 0;
            gridExport = 0;
        }

        if (mode === "hybrid") {
            const totalCap = state.batteries.reduce((s, b) => s + b.capacity_kwh, 0);
            const totalStored = state.batteries.reduce((s, b) => s + b.stored_kwh, 0);
            const soc = totalStored / totalCap;

            // import only if battery low
            if (deficitKW > 0 && soc < 0.20) gridImport = deficitKW;

            // export always allowed
            if (surplusKW > 0) gridExport = surplusKW;
        }

        // store
        state.grid.importKW = gridImport;
        state.grid.exportKW = gridExport;

        // update UI
        if (q('gridImport')) q('gridImport').innerText = gridImport.toFixed(2);
        if (q('gridExport')) q('gridExport').innerText = gridExport.toFixed(2);
        if (q('gridImportGrid')) q('gridImportGrid').innerText = gridImport.toFixed(2);
        if (q('gridExportGrid')) q('gridExportGrid').innerText = gridExport.toFixed(2);
        if (q('gridModeGrid')) q('gridModeGrid').value = state.grid.mode;
        if (q('gridMode')) q('gridMode').value = state.grid.mode;

        // diesel override: island mode forces diesel ON
        if (mode === "island" && deficitKW > 0) {
            state.sources.diesel.on = true;
            const en = q('dieselEnable');
            if (en) en.checked = true;
        }

    }

    // 4) batteries: charge from surplus + hybrid excess (output leftover)
    const genSurplus_kWh = surplusKW * effTickHours;
    let hybridExcessKW = 0;
    let hybridExcess_kWh = 0;
    if (state.hybrid?.enabled) {
        hybridExcessKW = Math.max(0, remainingKW) * ((state.hybrid.chargePct ?? 100) / 100);
        hybridExcess_kWh = hybridExcessKW * effTickHours;
    }
    const totalCharge_kWh = genSurplus_kWh + hybridExcess_kWh;
    const leftoverAfterCharge_kWh = chargeBatteries(totalCharge_kWh);
    const charged_kWh = totalCharge_kWh - leftoverAfterCharge_kWh;
    // hybrid: reduce grid export by amount diverted to battery (controllable via slider)
    if (state.hybrid?.enabled && state.grid.mode !== 'island') {
        const intendedExportKW = Math.max(0, remainingKW - hybridExcessKW) + (leftoverAfterCharge_kWh / effTickHours);
        gridExport = intendedExportKW;
        state.grid.exportKW = gridExport;
        if (q('gridExport')) q('gridExport').innerText = gridExport.toFixed(2);
        if (q('gridExportGrid')) q('gridExportGrid').innerText = gridExport.toFixed(2);
    }
    // hybrid status UI — works in both Real & Simulation (settings + topbar + grid tab)
    if(q('hybridGenSurplus')) q('hybridGenSurplus').innerText = surplusKW.toFixed(1)+' kW';
    if(q('hybridToBatt')) q('hybridToBatt').innerText = (state.hybrid?.enabled ? hybridExcessKW.toFixed(1) : '0.0')+' kW → '+(state.hybrid?.enabled ? 'battery' : 'grid');
    if(q('hybridTopStatus')) q('hybridTopStatus').innerText = (state.hybrid?.enabled ? hybridExcessKW.toFixed(1) : '0.0')+' kW → '+(state.hybrid?.enabled ? 'batt' : 'grid');
    if(q('hybridGenSurplusGrid')) q('hybridGenSurplusGrid').innerText = surplusKW.toFixed(1)+' kW';
    if(q('hybridToBattGrid')) q('hybridToBattGrid').innerText = (state.hybrid?.enabled ? hybridExcessKW.toFixed(1) : '0.0')+' kW';

    // 5) energy accounting
    const gen_kWh_thisTick = totalGenKW * effTickHours;
    const out_kWh_thisTick = totalOutKW * effTickHours;

    state.totals.gen_kwh += gen_kWh_thisTick;
    state.totals.out_kwh += out_kWh_thisTick;
    state.totals.saved_kwh += charged_kWh;

    state.totals.perSource_kwh.solar += s.solar.availableKW * effTickHours;
    state.totals.perSource_kwh.wind += s.wind.availableKW * effTickHours;
    state.totals.perSource_kwh.hydro += s.hydro.availableKW * effTickHours;
    state.totals.perSource_kwh.diesel += s.diesel.availableKW * effTickHours;

    // top UI
    if (q('topGen')) q('topGen').innerText = Math.round(totalGenKW) + ' kW';
    if (q('topOut')) q('topOut').innerText = Math.round(totalOutKW) + ' kW';
    const totalStored = state.batteries.reduce((s, b) => s + b.stored_kwh, 0);
    if (q('topStored')) q('topStored').innerText = totalStored.toFixed(2) + ' kWh';

    if (q('summaryGen')) q('summaryGen').innerText = state.totals.gen_kwh.toFixed(3);
    if (q('summaryOut')) q('summaryOut').innerText = state.totals.out_kwh.toFixed(3);
    if (q('summarySaved')) q('summarySaved').innerText = state.totals.saved_kwh.toFixed(3);
    if (q('energySaved')) q('energySaved').innerText = state.totals.saved_kwh.toFixed(3);

    // per-dest UI
    state.destinations.forEach(d => {
        const recv = q(`destRecv-${d.id}`);
        if (recv) recv.innerText = (d.lastRecvKW || 0).toFixed(2);

        const st = q(`destStatus-${d.id}`);
        if (st) {
            if (d.shedKW > 0.1) {
                st.innerText = 'SHED';
                st.classList.add('error');
                st.classList.remove('active');
            } else {
                st.innerText = 'OK';
                st.classList.remove('error');
                st.classList.add('active');
            }
        }
    });


    // battery visuals
    state.batteries.forEach(b => {
        const bar = q(`bar-${b.id}`);
        const storedEl = q(`stored-${b.id}`);
        if (bar) bar.style.height = ((b.stored_kwh / Math.max(1, b.capacity_kwh)) * 100) + '%';
        if (storedEl) storedEl.innerText = b.stored_kwh.toFixed(2);
    });

    // history for combined & battery
    pushHistoryCombined(totalGenKW, totalOutKW);
    pushHistory(state.historyBattery, totalStored);
    if (state.historyBattery.length > HISTORY_POINTS) state.historyBattery.shift();

    updateCombinedCharts();
    updateAnalyticsCharts();

    // slider labels (guard if missing)
    if (q('solarToOutVal')) q('solarToOutVal').innerText = s.solar.toOutPct + '%';
    if (q('windToOutVal')) q('windToOutVal').innerText = s.wind.toOutPct + '%';
    if (q('hydroToOutVal')) q('hydroToOutVal').innerText = s.hydro.toOutPct + '%';
    if (q('dieselToOutVal')) q('dieselToOutVal').innerText = s.diesel.toOutPct + '%';




}

function updateLineChart(chart, dataArr) {
    if (!chart) return;
    chart.data.labels = dataArr.map(() => '');
    chart.data.datasets[0].data = dataArr;
    chart.update();
}

function pushStackedHistory(solar, wind, hydro, diesel) {
    if (!charts.stackedInputs) return;
    const ds = charts.stackedInputs.data.datasets;
    ds[0].data.push(solar);
    ds[1].data.push(wind);
    ds[2].data.push(hydro);
    ds[3].data.push(diesel);
    if (ds[0].data.length > HISTORY_POINTS) ds.forEach(d => d.data.shift());
    charts.stackedInputs.update();
}

function pushHistoryCombined(genKW, outKW) {
    pushHistory(state.historyCombined.gen, genKW);
    pushHistory(state.historyCombined.out, outKW);
    pushHistory(state.historyCombined.timeLabels, nowLabel());
}

function updateCombinedCharts() {
    if (charts.combined) {
        charts.combined.data.labels = state.historyCombined.timeLabels.slice();
        charts.combined.data.datasets[0].data = state.historyCombined.gen.slice();
        // datasets[1] is forecast (dashed) — keep nulls, datasets[2] is output
        if(charts.combined.data.datasets[2]) charts.combined.data.datasets[2].data = state.historyCombined.out.slice();
        else charts.combined.data.datasets[1].data = state.historyCombined.out.slice();
        charts.combined.update();
    }

    const s = state.sources;
    pushStackedHistory(s.solar.availableKW, s.wind.availableKW, s.hydro.availableKW, s.diesel.availableKW);
}

// ---- Analytics charts update ----
function updateAnalyticsCharts() {
    const src = state.totals.perSource_kwh;
    if (charts.analyticsSourcePie) {
        charts.analyticsSourcePie.data.datasets[0].data = [
            src.solar, src.wind, src.hydro, src.diesel
        ];
        charts.analyticsSourcePie.update();
    }

    if (charts.analyticsGenTrend) {
        charts.analyticsGenTrend.data.labels = state.historyCombined.timeLabels.slice();
        charts.analyticsGenTrend.data.datasets[0].data = state.historyCombined.gen.slice();
        charts.analyticsGenTrend.update();
    }

    if (charts.analyticsBatteryTrend) {
        charts.analyticsBatteryTrend.data.labels = state.historyBattery.map(() => '');
        charts.analyticsBatteryTrend.data.datasets[0].data = state.historyBattery.slice();
        charts.analyticsBatteryTrend.update();
    }

    if (charts.analyticsDestinations) {
        const labels = state.destinations.map(d => d.name);
        const data = state.destinations.map(d => d.lastRecvKW || 0);
        charts.analyticsDestinations.data.labels = labels;
        charts.analyticsDestinations.data.datasets[0].data = data;
        charts.analyticsDestinations.update();
    }
    // destinations page analytics
    updateDestinationsPageCharts();
}

function updateDestinationsPageCharts(){
    // destTrend — aggregate incoming/consuming/wasting over time
    if(charts.destTrend){
        const n = state.historyCombined.timeLabels.length;
        // dest histories all have HISTORY_POINTS length after first ticks, but we derive aggregate per tick
        // use per-dest incoming histories to build trend
        const labels = state.historyCombined.timeLabels.slice();
        // aggregate per index: sum across dests at that history index (last n points)
        const aggIncoming = Array(n).fill(0).map((_,i)=> state.destinations.reduce((s,d)=> s + (d.history.incoming[i - (HISTORY_POINTS - d.history.incoming.length)]|| d.history.incoming[i]||0),0));
        const aggConsuming = Array(n).fill(0).map((_,i)=> state.destinations.reduce((s,d)=> s + (d.history.consuming[i - (HISTORY_POINTS - d.history.consuming.length)]|| d.history.consuming[i]||0),0));
        const aggWasting = Array(n).fill(0).map((_,i)=> state.destinations.reduce((s,d)=> s + (d.history.wasting[i - (HISTORY_POINTS - d.history.wasting.length)]|| d.history.wasting[i]||0),0));
        // fallback simple: if still empty, use current totals
        if(n===0){ return; }
        // use simpler: current aggregated histories via last n values of combined
        // instead compute directly from last HISTORY_POINTS ticks using stored histories
        // For simplicity, build from dest histories padded to HISTORY_POINTS
        const pad = (arr)=>{ const p=[...arr]; while(p.length<HISTORY_POINTS) p.unshift(0); return p.slice(-HISTORY_POINTS); };
        const incomingSeries = (()=>{ const sums=Array(HISTORY_POINTS).fill(0); state.destinations.forEach(d=>{ const a=pad(d.history.incoming); a.forEach((v,i)=>sums[i]+=v)}); return sums; })();
        const consumingSeries = (()=>{ const sums=Array(HISTORY_POINTS).fill(0); state.destinations.forEach(d=>{ const a=pad(d.history.consuming); a.forEach((v,i)=>sums[i]+=v)}); return sums; })();
        const wastingSeries = (()=>{ const sums=Array(HISTORY_POINTS).fill(0); state.destinations.forEach(d=>{ const a=pad(d.history.wasting); a.forEach((v,i)=>sums[i]+=v)}); return sums; })();
        charts.destTrend.data.labels = Array(HISTORY_POINTS).fill('');
        charts.destTrend.data.datasets[0].data = incomingSeries;
        charts.destTrend.data.datasets[1].data = consumingSeries;
        charts.destTrend.data.datasets[2].data = wastingSeries;
        charts.destTrend.update();
    }
    if(charts.analyticsDestConsumePie){
        const labels = state.destinations.map(d=>d.name);
        const data = state.destinations.map(d=>d.totals.consuming_kwh||0);
        charts.analyticsDestConsumePie.data.labels = labels;
        charts.analyticsDestConsumePie.data.datasets[0].data = data;
        charts.analyticsDestConsumePie.update();
    }
    if(charts.analyticsDestWasteBar){
        const labels = state.destinations.map(d=>d.name);
        charts.analyticsDestWasteBar.data.labels = labels;
        charts.analyticsDestWasteBar.data.datasets[0].data = state.destinations.map(d=>d.consuming||0);
        charts.analyticsDestWasteBar.data.datasets[1].data = state.destinations.map(d=>d.wasting||0);
        charts.analyticsDestWasteBar.update();
    }
    // summary gauges
    const totalInc = state.destinations.reduce((s,d)=>s+(d.incoming||0),0);
    const totalCon = state.destinations.reduce((s,d)=>s+(d.consuming||0),0);
    const totalWst = state.destinations.reduce((s,d)=>s+(d.wasting||0),0);
    const eff = totalInc>0 ? (totalCon/totalInc)*100 : 0;
    if(q('destEfficiencyGauge')) q('destEfficiencyGauge').innerText = eff.toFixed(1)+'%';
    if(q('destEfficiencyText')) q('destEfficiencyText').innerText = totalCon.toFixed(1)+' / '+totalInc.toFixed(1)+' kW consuming • '+eff.toFixed(1)+'% efficiency'+(eff<60?' — high waste': eff>85?' — healthy':'');
    if(q('destSumIncoming')) q('destSumIncoming').innerText = totalInc.toFixed(1)+' kW';
    if(q('destSumConsuming')) q('destSumConsuming').innerText = totalCon.toFixed(1)+' kW';
    if(q('destSumWasting')) q('destSumWasting').innerText = totalWst.toFixed(1)+' kW';
    const cumInc = state.destinations.reduce((s,d)=>s+(d.totals.incoming_kwh||0),0);
    const cumCon = state.destinations.reduce((s,d)=>s+(d.totals.consuming_kwh||0),0);
    const cumWst = state.destinations.reduce((s,d)=>s+(d.totals.wasting_kwh||0),0);
    if(q('destSumIncomingKwh')) q('destSumIncomingKwh').innerText = cumInc.toFixed(2)+' kWh';
    if(q('destSumConsumingKwh')) q('destSumConsumingKwh').innerText = cumCon.toFixed(2)+' kWh';
    if(q('destSumWastingKwh')) q('destSumWastingKwh').innerText = cumWst.toFixed(2)+' kWh';
    // leaderboard
    const lb=q('destLeaderboard');
    if(lb){
        const sorted=[...state.destinations].sort((a,b)=>(b.efficiency||0)-(a.efficiency||0));
        lb.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr style="color:var(--muted-2);font-size:9px;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid var(--border)"><th style="text-align:left;padding:4px">Destination</th><th style="text-align:right;padding:4px">In</th><th style="text-align:right;padding:4px">Use</th><th style="text-align:right;padding:4px">Waste</th><th style="text-align:right;padding:4px">Eff</th><th style="text-align:right;padding:4px">Status</th></tr></thead><tbody>'+sorted.map(d=>`<tr style="border-bottom:1px solid #111"><td style="padding:4px">${d.name}</td><td style="text-align:right;padding:4px">${(d.incoming||0).toFixed(1)}</td><td style="text-align:right;padding:4px;color:#10b981">${(d.consuming||0).toFixed(1)}</td><td style="text-align:right;padding:4px;color:#f59e0b">${(d.wasting||0).toFixed(1)}</td><td style="text-align:right;padding:4px">${Math.round((d.efficiency||0)*100)}%</td><td style="text-align:right;padding:4px"><span style="padding:2px 6px;border-radius:999px;font-size:9px;border:1px solid ${d.shedKW>0.1?'rgba(255,62,62,0.3)':'rgba(16,185,129,0.3)'};background:${d.shedKW>0.1?'rgba(255,62,62,0.08)':'rgba(16,185,129,0.08)'};color:${d.shedKW>0.1?'#ff9a9a':'#10b981'}">${d.shedKW>0.1?'SHED '+d.shedKW.toFixed(0):'OK'}</span></td></tr>`).join('')+'</tbody></table>';
    }
    // update mini charts + per-card numbers
    state.destinations.forEach(d=>{
        const ch=destMiniCharts[d.id];
        if(ch){
            ch.data.datasets[0].data = d.history.incoming.slice();
            ch.data.datasets[1].data = d.history.consuming.slice();
            ch.data.datasets[2].data = d.history.wasting.slice();
            ch.update();
        }
        const incEl=q(`destPageInc-${d.id}`); if(incEl) incEl.innerText=(d.incoming||0).toFixed(1)+' kW';
        const conEl=q(`destPageCon-${d.id}`); if(conEl) conEl.innerText=(d.consuming||0).toFixed(1)+' kW';
        const wstEl=q(`destPageWst-${d.id}`); if(wstEl) wstEl.innerText=(d.wasting||0).toFixed(1)+' kW';
        const stEl=q(`destPageStatus-${d.id}`); if(stEl){ stEl.innerText=d.shedKW>0.1?'SHED '+d.shedKW.toFixed(0)+' kW':'OK'; stEl.className='status-badge '+(d.shedKW>0.1?'error':'active'); }
    });
}

// ---- UI binding ----
function bindUI() {
    // Sources controls
    q('solarLight')?.addEventListener('input', e => {
        state.sources.solar.light = parseInt(e.target.value);
        if (q('solarLightValue')) q('solarLightValue').innerText = e.target.value + '%';
    });
    q('solarToOut')?.addEventListener('input', e => {
        state.sources.solar.toOutPct = parseInt(e.target.value);
        if (q('solarToOutVal')) q('solarToOutVal').innerText = e.target.value + '%';
    });

    q('windSpeed')?.addEventListener('input', e => {
        state.sources.wind.speed = parseInt(e.target.value);
        if (q('windSpeedValue')) q('windSpeedValue').innerText = e.target.value + ' m/s';
    });
    q('windToOut')?.addEventListener('input', e => {
        state.sources.wind.toOutPct = parseInt(e.target.value);
        if (q('windToOutVal')) q('windToOutVal').innerText = e.target.value + '%';
    });

    q('hydroFlow')?.addEventListener('input', e => {
        state.sources.hydro.flow = parseInt(e.target.value);
        if (q('hydroFlowVal')) q('hydroFlowVal').innerText = e.target.value + '%';
    });
    q('hydroToOut')?.addEventListener('input', e => {
        state.sources.hydro.toOutPct = parseInt(e.target.value);
        if (q('hydroToOutVal')) q('hydroToOutVal').innerText = e.target.value + '%';
    });

    q('dieselEnable')?.addEventListener('change', e => {
        state.sources.diesel.on = e.target.checked;
        state.sources.diesel.enabled = e.target.checked;
        if (q('dieselStatus')) q('dieselStatus').innerText = e.target.checked ? 'Active' : 'Offline';
        if (!e.target.checked) {
            state.sources.diesel.availableKW = 0;
            pushHistory(state.sources.diesel.history, 0);
            updateLineChart(charts.diesel, state.sources.diesel.history);
            if (q('dieselGauge')) q('dieselGauge').innerText = '0 kW';
        }
    });
    q('solarEnable')?.addEventListener('change', e => {
        state.sources.solar.enabled = e.target.checked;
        if (q('solarStatus')) q('solarStatus').innerText = e.target.checked ? 'Active' : 'Offline';
        if (!e.target.checked) {
            state.sources.solar.availableKW = 0;
            pushHistory(state.sources.solar.history, 0);
            updateLineChart(charts.solar, state.sources.solar.history);
            if (q('solarGauge')) q('solarGauge').innerText = '0 kW';
        }
    });
    q('windEnable')?.addEventListener('change', e => {
        state.sources.wind.enabled = e.target.checked;
        if (q('windStatus')) q('windStatus').innerText = e.target.checked ? 'Active' : 'Offline';
        if (!e.target.checked) {
            state.sources.wind.availableKW = 0;
            pushHistory(state.sources.wind.history, 0);
            updateLineChart(charts.wind, state.sources.wind.history);
            if (q('windGauge')) q('windGauge').innerText = '0 kW';
        }
    });
    q('hydroEnable')?.addEventListener('change', e => {
        state.sources.hydro.enabled = e.target.checked;
        if (q('hydroStatus')) q('hydroStatus').innerText = e.target.checked ? 'Active' : 'Offline';
        if (!e.target.checked) {
            state.sources.hydro.availableKW = 0;
            pushHistory(state.sources.hydro.history, 0);
            updateLineChart(charts.hydro, state.sources.hydro.history);
            if (q('hydroGauge')) q('hydroGauge').innerText = '0 kW';
        }
    });
    // pill toggles — FULL button style (motion.dev)
    document.querySelectorAll('.pill-toggle[data-toggle]').forEach(btn=>{
        const id=btn.getAttribute('data-toggle');
        const cb=q(id);
        const row=btn.closest('.pill-row');
        const hintId=id.replace('Enable','Hint');
        const hint=q(hintId);
        const isDiesel=id==='dieselEnable';
        function sync(){
            const on=cb?.checked;
            btn.classList.toggle('on', !!on);
            if(row) row.classList.toggle('on', !!on);
            const icon=btn.querySelector('.knob i');
            if(icon) icon.className= on ? 'fa-solid fa-check' : 'fa-solid fa-xmark';
            if(hint) hint.textContent = on ? (isDiesel ? 'ON • backup active' : 'ON • feeding grid') : (isDiesel ? 'OFF • standby' : 'OFF • idle');
        }
        sync();
        const toggle=()=>{
            if(!cb) return;
            cb.checked=!cb.checked;
            cb.dispatchEvent(new Event('change', {bubbles:true}));
            sync();
        };
        btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggle(); });
        if(row) row.addEventListener('click', toggle);
        cb?.addEventListener('change', sync);
    });
    q('dieselToOut')?.addEventListener('input', e => {
        state.sources.diesel.toOutPct = parseInt(e.target.value);
        if (q('dieselToOutVal')) q('dieselToOutVal').innerText = e.target.value + '%';
    });

    // Destinations / Batteries
    q('addDestinationBtn')?.addEventListener('click', () => {
        const name = prompt('Destination name (e.g. Grid, Plant A)') || ('Dest ' + (state.destinations.length + 1));
        addDestination(name);
    });
    q('addDestPageBtn')?.addEventListener('click', () => {
        const name = q('newDestName').value.trim() || ('Dest ' + (state.destinations.length + 1));
        const demand = parseFloat(q('newDestDemand').value) || 80;
        const eff = Math.max(0.5, Math.min(0.98, (parseFloat(q('newDestEff').value)||85)/100));
        const pri = parseInt(q('newDestPriority').value) || 2;
        addDestination(name, {demandKW:demand, efficiency:eff, priority:pri});
        q('newDestName').value='';
        // reset guided form to defaults
        if(q('newDestDemand')) q('newDestDemand').value=80;
        if(q('newDestDemandSlider')){ q('newDestDemandSlider').value=80; q('newDestDemandSlider').max=Math.max(500,80+500); }
        if(q('newDestEff')) q('newDestEff').value=85;
        if(q('newDestEffSlider')) q('newDestEffSlider').value=85;
        if(q('newDestPriority')) q('newDestPriority').value=2;
        document.querySelectorAll('.prio-btn').forEach(b=>{ const v=parseInt(b.getAttribute('data-prio')); b.classList.toggle('active', v===2); b.style.background=v===2?'#fff':'#0a0f12'; b.style.color=v===2?'#0a0a0a':'var(--muted)'; b.style.borderColor=v===2?'#fff':'var(--border)'; });
        syncNewDestPreview();
    });
    // guided add-destination form — easy, not random box
    function syncNewDestPreview(){
        const dem=parseInt(q('newDestDemand')?.value)||0;
        const eff=parseInt(q('newDestEff')?.value)||85;
        const pri=q('newDestPriority')?.value||2;
        const name=q('newDestName')?.value?.trim()||'—';
        if(q('newDestDemandLabel')) q('newDestDemandLabel').textContent=dem+' kW';
        if(q('newDestEffLabel')) q('newDestEffLabel').textContent=eff+'%';
        const use=Math.round(dem*eff/100), waste=dem-use;
        if(q('effUseBar')) q('effUseBar').style.width=eff+'%';
        if(q('effWasteBar')) q('effWasteBar').style.width=(100-eff)+'%';
        if(q('effUseTxt')) q('effUseTxt').textContent=use+' kW use';
        if(q('effWasteTxt')) q('effWasteTxt').textContent=waste+' kW waste';
        if(q('newDestPreview')) q('newDestPreview').innerHTML=`Will request <span style="color:var(--text);">${dem}kW</span> at <span style="color:var(--text);">P${pri}</span> • ${eff}% efficient — <span style="color:#10b981;">${use} use</span> / <span style="color:#f59e0b;">${waste} waste</span> • <span style="color:var(--muted);">${name}</span>`;
        const slider=q('newDestDemandSlider'); if(slider){ const m=Math.max(500, Math.ceil((dem+500)/100)*100); slider.max=m; if(parseInt(slider.value)!==dem) slider.value=Math.min(dem,m); }
    }
    document.querySelectorAll('.preset-name').forEach(b=> b.addEventListener('click', ()=>{ const v=b.getAttribute('data-name'); if(q('newDestName')){ q('newDestName').value=v; syncNewDestPreview(); } }));
    q('newDestDemandSlider')?.addEventListener('input', e=>{ if(q('newDestDemand')) q('newDestDemand').value=e.target.value; syncNewDestPreview(); });
    q('newDestDemand')?.addEventListener('input', ()=> syncNewDestPreview());
    q('newDestMinus')?.addEventListener('click', ()=>{ const cur=parseInt(q('newDestDemand').value)||0; const nv=Math.max(0, cur-10); if(q('newDestDemand')) q('newDestDemand').value=nv; if(q('newDestDemandSlider')) q('newDestDemandSlider').value=nv; syncNewDestPreview(); });
    q('newDestPlus')?.addEventListener('click', ()=>{ const cur=parseInt(q('newDestDemand').value)||0; const nv=cur+10; if(q('newDestDemand')) q('newDestDemand').value=nv; if(q('newDestDemandSlider')) q('newDestDemandSlider').value=nv; syncNewDestPreview(); });
    q('newDestEffSlider')?.addEventListener('input', e=>{ if(q('newDestEff')) q('newDestEff').value=e.target.value; syncNewDestPreview(); });
    q('newDestEff')?.addEventListener('input', e=>{ if(q('newDestEffSlider')) q('newDestEffSlider').value=e.target.value; syncNewDestPreview(); });
    document.querySelectorAll('.prio-btn').forEach(b=> b.addEventListener('click', ()=>{
        const v=b.getAttribute('data-prio'); if(q('newDestPriority')) q('newDestPriority').value=v;
        document.querySelectorAll('.prio-btn').forEach(x=>{ const a=x.getAttribute('data-prio')===v; x.classList.toggle('active', a); x.style.background=a?'#fff':'#0a0f12'; x.style.color=a?'#0a0a0a':'var(--muted)'; x.style.borderColor=a?'#fff':'var(--border)'; });
        syncNewDestPreview();
    }));
    syncNewDestPreview();

    q('addBatteryBtn')?.addEventListener('click', () => {
        const cap = parseFloat(q('newBatteryCapacity').value) || 500;
        const cr = parseFloat(q('newBatteryChargeRate').value) || 200;
        const dr = parseFloat(q('newBatteryDischargeRate').value) || 200;
        addBattery(cap, cr, dr, 0);
    });

    q('forceAllToOutput')?.addEventListener('click', () => {
        for (const key of Object.keys(state.sources)) state.sources[key].toOutPct = 100;
        ['solarToOut', 'windToOut', 'hydroToOut', 'dieselToOut'].forEach(id => { if (q(id)) q(id).value = 100; });
    });

    q('forceAllToBattery')?.addEventListener('click', () => {
        for (const key of Object.keys(state.sources)) state.sources[key].toOutPct = 0;
        ['solarToOut', 'windToOut', 'hydroToOut', 'dieselToOut'].forEach(id => { if (q(id)) q(id).value = 0; });
    });

    // Nav retract — collapses to icons
    q('navToggle')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('collapsed');
        document.querySelector('.app-grid')?.classList.toggle('nav-collapsed');
        const ic=q('navToggle')?.querySelector('i');
        if(ic) ic.className = document.querySelector('.sidebar')?.classList.contains('collapsed') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
        // resize charts that were hidden
        setTimeout(()=>{ Object.values(charts).forEach(c=>{ try{c?.resize(); c?.update();}catch{}}); Object.values(destMiniCharts).forEach(c=>{ try{c?.resize(); c?.update();}catch{}}); }, 340);
    });
    // Dashboard mode — locked to login choice (copy), not togglable in-dashboard
    // Theme toggle (existing)
    q('themeToggleBtn')?.addEventListener('click', () => {
        document.body.classList.toggle('dark');
    });

    // Settings: explicit theme
    q('themeLight')?.addEventListener('click', () => {
        document.body.classList.remove('dark');
    });
    q('themeDark')?.addEventListener('click', () => {
        document.body.classList.add('dark');
    });

    q('gridMode')?.addEventListener('change', e => {
        state.grid.mode = e.target.value;
        if(q('gridModeGrid')) q('gridModeGrid').value = e.target.value;
    });
    q('gridModeGrid')?.addEventListener('change', e => {
        state.grid.mode = e.target.value;
        if(q('gridMode')) q('gridMode').value = e.target.value;
    });

    // Hybrid Charge Mode — works in both Real & Simulation, controllable switching (topbar + settings)
    function syncHybridUI(){
        const on = !!state.hybrid.enabled;
        const pct = state.hybrid.chargePct ?? 100;
        [['hybridRow','hybridToggleBtn','hybridHint','hybridControls','hybridToggle','hybridPct','hybridPctVal'],
         ['hybridTopRow','hybridTopToggleBtn','hybridTopHint','hybridTopControls','hybridTopToggle','hybridTopPct','hybridTopPctVal']].forEach(([rowId,btnId,hintId,ctrlsId,cbId,pctId,valId])=>{
            const row = q(rowId); if(row) row.classList.toggle('on', !!on);
            const btn = q(btnId); if(btn) btn.classList.toggle('on', !!on);
            const hint = q(hintId); if(hint) hint.textContent = on ? 'ON • excess → battery' : 'OFF • output only';
            const ctrls = q(ctrlsId); if(ctrls) ctrls.style.display = on ? 'flex' : 'none';
            const cb = q(cbId); if(cb) cb.checked = on;
            if(q(pctId)){ q(pctId).value = pct; }
            if(q(valId)) q(valId).innerText = pct + '%';
        });
    }
    ;['hybridToggle','hybridTopToggle'].forEach(id=>{
        q(id)?.addEventListener('change', e=>{
            state.hybrid.enabled = e.target.checked;
            syncHybridUI();
        });
    });
    ;['hybridPct','hybridTopPct'].forEach(id=>{
        q(id)?.addEventListener('input', e=>{
            state.hybrid.chargePct = parseInt(e.target.value) || 0;
            syncHybridUI();
        });
    });
    syncHybridUI();

    q('weatherEnabled')?.addEventListener('change', e => {
        state.weather.enabled = e.target.checked;
    });

    q('weatherTimeSlider')?.addEventListener('input', e => {
        state.weather.manualTime = true;
        state.weather.time = parseInt(e.target.value);
        updateWeather(true);  // force update immediately
    });




    // Simulation speed — actually changes tick interval, charts visibly speed up
    document.querySelectorAll('.simSpeed').forEach(btn => {
        btn.addEventListener('click', () => {
            const sp = parseFloat(btn.getAttribute('data-speed')) || 1;
            speedMultiplier = sp;
            startTickLoop();
            document.querySelectorAll('.simSpeed').forEach(b=> b.classList.toggle('active', b===btn));
        });
    });

    // Reset buttons
    q('resetBatteries')?.addEventListener('click', () => {
        state.batteries.forEach(b => b.stored_kwh = 0);
        renderBatteriesUI();
    });

    q('resetDestinations')?.addEventListener('click', () => {
        state.destinations = [];
        Object.values(destMiniCharts).forEach(ch=>{try{ch.destroy()}catch{}}); destMiniCharts={};
        renderDestinationsUI();
        renderDestinationsPage();
    });

    q('resetAll')?.addEventListener('click', () => {
        // manual reset WITHOUT reload
        state.batteries.forEach(b => b.stored_kwh = 0);
        state.destinations.forEach(d => {
            d.lastRecvKW = 0;
            d.shedKW = 0;
        });
        state.totals.gen_kwh = 0;
        state.totals.out_kwh = 0;
        state.totals.saved_kwh = 0;
    });


    // Presets
    document.querySelectorAll('.preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-preset');
            applyPreset(type);
        });
    });

    // Logout
    q('logoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem('userRole');
        localStorage.removeItem('username');
        localStorage.removeItem('dashboardMode');
        window.location.href = 'index.html';
    });

    // Tabs
    initTabs();

    // Role display (basic)
    applyRolePermissions();
}

// ---- Presets ----
function applyPreset(type) {
    const s = state.sources;
    switch (type) {
        case 'sunny':
            s.solar.light = 100; s.solar.toOutPct = 90;
            s.wind.speed = 5; s.wind.toOutPct = 40;
            s.hydro.flow = 40; s.hydro.toOutPct = 50;
            s.diesel.on = false;
            break;
        case 'windy':
            s.solar.light = 30; s.solar.toOutPct = 30;
            s.wind.speed = 18; s.wind.toOutPct = 90;
            s.hydro.flow = 50; s.hydro.toOutPct = 50;
            s.diesel.on = false;
            break;
        case 'hydro':
            s.solar.light = 40; s.solar.toOutPct = 40;
            s.wind.speed = 8; s.wind.toOutPct = 40;
            s.hydro.flow = 100; s.hydro.toOutPct = 90;
            s.diesel.on = false;
            break;
        case 'diesel':
            s.solar.light = 0; s.solar.toOutPct = 0;
            s.wind.speed = 0; s.wind.toOutPct = 0;
            s.hydro.flow = 0; s.hydro.toOutPct = 0;
            s.diesel.on = true; s.diesel.toOutPct = 100;
            break;
    }

    if (q('solarLight')) { q('solarLight').value = s.solar.light; if (q('solarLightValue')) q('solarLightValue').innerText = s.solar.light + '%'; }
    if (q('solarToOut')) { q('solarToOut').value = s.solar.toOutPct; if (q('solarToOutVal')) q('solarToOutVal').innerText = s.solar.toOutPct + '%'; }

    if (q('windSpeed')) { q('windSpeed').value = s.wind.speed; if (q('windSpeedValue')) q('windSpeedValue').innerText = s.wind.speed + ' m/s'; }
    if (q('windToOut')) { q('windToOut').value = s.wind.toOutPct; if (q('windToOutVal')) q('windToOutVal').innerText = s.wind.toOutPct + '%'; }

    if (q('hydroFlow')) { q('hydroFlow').value = s.hydro.flow; if (q('hydroFlowVal')) q('hydroFlowVal').innerText = s.hydro.flow + '%'; }
    if (q('hydroToOut')) { q('hydroToOut').value = s.hydro.toOutPct; if (q('hydroToOutVal')) q('hydroToOutVal').innerText = s.hydro.toOutPct + '%'; }

    if (q('dieselEnable')) q('dieselEnable').checked = s.diesel.on;
    if (q('dieselToOut')) { q('dieselToOut').value = s.diesel.toOutPct; if (q('dieselToOutVal')) q('dieselToOutVal').innerText = s.diesel.toOutPct + '%'; }

    if (q('dieselStatus')) q('dieselStatus').innerText = s.diesel.on ? 'Active' : 'Offline';
}

// ---- Tabs ----
function initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab');
    if (!navButtons.length || !tabs.length) return;

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            tabs.forEach(t => t.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const activeTab = document.getElementById(`tab-${tabId}`);
            if (activeTab) activeTab.classList.add('active');
            // when destinations tab becomes visible, Chart.js canvases were hidden (0 size) — force resize so trend + pies actually paint
            if(tabId==='destinations'){
                setTimeout(()=>{
                    try{
                        charts.destTrend?.resize(); charts.destTrend?.update();
                        charts.analyticsDestConsumePie?.resize(); charts.analyticsDestConsumePie?.update();
                        charts.analyticsDestWasteBar?.resize(); charts.analyticsDestWasteBar?.update();
                        Object.values(destMiniCharts).forEach(c=>{ try{c.resize(); c.update();}catch{}})
                        updateDestinationsPageCharts();
                    }catch{}
                }, 60);
            }
        });
    });
}

// ---- Role display (minimal) ----
function isViewer(){ return (localStorage.getItem('userRole') || 'admin') === 'viewer'; }
function applyRolePermissions() {
    const role = localStorage.getItem('userRole') || 'admin';
    const username = localStorage.getItem('username') || '';
    const viewer = role === 'viewer';

    const roleLabel = q('roleLabel');
    if (roleLabel) roleLabel.innerText = role.charAt(0).toUpperCase() + role.slice(1);

    const avatar = document.querySelector('.avatar');
    if (avatar && username) avatar.innerText = username.slice(0, 2).toUpperCase();

    document.body.classList.toggle('viewer-mode', viewer);
    // viewer banner
    let vb = document.getElementById('viewerBanner');
    if(viewer){
        if(!vb){
            vb = document.createElement('div');
            vb.id='viewerBanner';
            vb.style.cssText='position:fixed; top:8px; left:50%; transform:translateX(-50%); background:#111; border:1px solid #333; color:#888; font-family:var(--mono); font-size:10px; letter-spacing:0.12em; text-transform:uppercase; padding:6px 12px; border-radius:999px; z-index:99; display:flex; align-items:center; gap:6px;';
            vb.innerHTML='<i class="fa-solid fa-eye"></i> View Only — no changes allowed';
            document.body.appendChild(vb);
        }
    }else if(vb) vb.remove();

    // disable/enable all controls except nav/logout — viewer is view-only in both Real & Simulation
    document.querySelectorAll('button, input, select, textarea').forEach(el=>{
        const keep = el.id==='logoutBtn' || el.classList.contains('nav-btn') || el.closest('#viewerBanner') || el.id==='navToggle';
        if(keep) return;
        el.disabled = viewer;
        el.style.pointerEvents = viewer ? 'none' : '';
        el.style.opacity = viewer ? '0.55' : '';
        if(viewer) el.classList.add('disabled-control'); else el.classList.remove('disabled-control');
    });
    document.querySelectorAll('.pill-row, .pill-toggle, .battery-visual, canvas').forEach(el=>{
        el.style.pointerEvents = viewer ? 'none' : '';
        el.style.opacity = viewer ? (el.tagName==='CANVAS' ? '0.7' : '0.55') : '';
    });
    // topbar hybrid and grid still visible but disabled
    document.querySelectorAll('#hybridTopbar, #hybridTopRow').forEach(el=>{
        el.style.pointerEvents = viewer ? 'none' : '';
        el.style.opacity = viewer ? '0.55' : '';
    });
}

// ---- PUBLIC ENTRY ----
export function initApp() {
    if (!q('combinedChart')) return;

    if (state.batteries.length === 0) {
        addBattery(2000, 500, 500, 1000);
        addBattery(500, 200, 200, 250);
    }

    if (state.destinations.length === 0) {
        addDestination('Grid');
        addDestination('Local Factory');
    }

    initCharts();
    bindUI();
    renderDestinationsPage();
    applyModeUI();

    startTickLoop();
}


// =========================
// ADVANCED FEATURES (Tier 1 + Themes)
// =========================

// simple flag for auto-balance
let autoBalanceOn = false;

// init extra controls after page load (runs only on dashboard)
window.addEventListener("load", () => {
    // if not on dashboard, skip
    if (!document.getElementById("tab-dashboard")) return;

    // Auto-balance toggle
    const ab = document.getElementById("autoBalanceToggle");
    if (ab) {
        autoBalanceOn = ab.checked;
        ab.addEventListener("change", () => {
            autoBalanceOn = ab.checked;
        });
    }

    // Theme presets
    const themeBtns = [
        { id: "themeLight", mode: "light" },
        { id: "themeDark", mode: "dark" },
        { id: "themeSolar", mode: "solar" },
        { id: "themeBlue", mode: "blue" },
        { id: "themeGreen", mode: "green" }
    ];
    themeBtns.forEach(t => {
        const btn = document.getElementById(t.id);
        if (!btn) return;
        btn.addEventListener("click", () => applyTheme(t.mode));
    });

    // Housekeeping loop: auto-balance + forecast + alerts every 3s
    setInterval(() => {
        if (!document.getElementById("tab-dashboard")) return;
        runAutoBalance();
        updateForecastPanel();
        updateAlertsPanel();
    }, 3000);
});

// apply visual theme
function applyTheme(mode) {
    const body = document.body;
    body.classList.remove("dark", "theme-solar", "theme-blue", "theme-green");

    switch (mode) {
        case "dark":
            body.classList.add("dark");
            break;
        case "solar":
            body.classList.add("theme-solar");
            break;
        case "blue":
            body.classList.add("theme-blue");
            break;
        case "green":
            body.classList.add("theme-green");
            break;
        case "light":
        default:
            // default light: nothing
            break;
    }
}

// auto-balance logic: adjust source output % and diesel based on battery SOC
function runAutoBalance() {
    if (!autoBalanceOn) return;
    if (!window.state) return; // safety if state not in scope (but in our file it is)

    try {
        const s = state.sources;
        const totalCap = state.batteries.reduce((sum, b) => sum + b.capacity_kwh, 0);
        const totalStored = state.batteries.reduce((sum, b) => sum + b.stored_kwh, 0);
        const soc = totalCap > 0 ? totalStored / totalCap : 0;

        const lastGen = state.historyCombined.gen.length
            ? state.historyCombined.gen[state.historyCombined.gen.length - 1]
            : 0;

        // Low battery → charge more, maybe use diesel
        if (soc < 0.2) {
            s.solar.toOutPct = Math.max(30, s.solar.toOutPct - 10);
            s.wind.toOutPct = Math.max(30, s.wind.toOutPct - 10);
            s.hydro.toOutPct = Math.max(30, s.hydro.toOutPct - 10);

            if (lastGen < 200) {
                s.diesel.on = true;
                const dieselEnable = document.getElementById("dieselEnable");
                if (dieselEnable) dieselEnable.checked = true;
            }
        }

        // High battery → send more to output, shut diesel
        if (soc > 0.8) {
            s.solar.toOutPct = Math.min(95, s.solar.toOutPct + 10);
            s.wind.toOutPct = Math.min(95, s.wind.toOutPct + 10);
            s.hydro.toOutPct = Math.min(95, s.hydro.toOutPct + 10);

            s.diesel.on = false;
            const dieselEnable = document.getElementById("dieselEnable");
            if (dieselEnable) dieselEnable.checked = false;
        }

        // push new values into sliders & labels if they exist
        const ids = [
            ["solarToOut", "solarToOutVal", s.solar.toOutPct],
            ["windToOut", "windToOutVal", s.wind.toOutPct],
            ["hydroToOut", "hydroToOutVal", s.hydro.toOutPct],
            ["dieselToOut", "dieselToOutVal", s.diesel.toOutPct]
        ];

        ids.forEach(([sliderId, labelId, val]) => {
            const sl = document.getElementById(sliderId);
            const lb = document.getElementById(labelId);
            if (sl) sl.value = val;
            if (lb) lb.innerText = val + "%";
        });

        // update diesel status text
        const dStatus = document.getElementById("dieselStatus");
        if (dStatus) dStatus.innerText = s.diesel.on ? "Active" : "Offline";
    } catch (e) {
        // fail silent; demo only
    }
}

// simple forecast based on last 5 points
function updateForecastPanel() {
    if (!document.getElementById("forecastGen")) return;
    if (!state.historyCombined.gen.length) return;

    const genHist = state.historyCombined.gen;
    const batHist = state.historyBattery;

    const lastN = 5;
    const sliceGen = genHist.slice(-lastN);
    const avgGen =
        sliceGen.reduce((a, b) => a + b, 0) / (sliceGen.length || 1);

    const lastStored =
        batHist.length ? batHist[batHist.length - 1] : 0;

    // super-simple: assume same net trend for next 15 min
    const forecastGen = avgGen;
    const forecastBattery = lastStored; // keep flat to avoid nonsense

    document.getElementById("forecastGen").innerText =
        Math.round(forecastGen) + " kW";
    document.getElementById("forecastBattery").innerText =
        forecastBattery.toFixed(2) + " kWh";
}

// alert system (battery low, diesel running, high gen)
function updateAlertsPanel() {
    const alertList = document.getElementById("alertList");
    const logBox = document.getElementById("logBox");
    if (!alertList || !logBox) return;

    alertList.innerHTML = "";

    const totalCap = state.batteries.reduce((s, b) => s + b.capacity_kwh, 0);
    const totalStored = state.batteries.reduce((s, b) => s + b.stored_kwh, 0);
    const soc = totalCap > 0 ? totalStored / totalCap : 0;

    const lastGen = state.historyCombined.gen.length
        ? state.historyCombined.gen[state.historyCombined.gen.length - 1]
        : 0;

    const dieselOn = state.sources.diesel.on;

    const alerts = [];

    if (soc < 0.15) alerts.push({ msg: "Battery critically low!", level: "high" });
    else if (soc < 0.3) alerts.push({ msg: "Battery low", level: "normal" });

    if (dieselOn) alerts.push({ msg: "Diesel generator running", level: "normal" });

    if (lastGen > 400) alerts.push({ msg: "High generation, consider exporting to grid", level: "normal" });

    if (state.shedding && state.shedding.active) {
        alerts.push({
            msg: `Load shedding active (${state.shedding.shedCount} destination(s) curtailed)`,
            level: "high"
        });
    }

    if (state.grid.importKW > 0) {
        alerts.push({ msg: `Grid Import: ${state.grid.importKW.toFixed(1)} kW`, level: "normal" });
    }

    if (state.grid.exportKW > 0) {
        alerts.push({ msg: `Grid Export: ${state.grid.exportKW.toFixed(1)} kW`, level: "normal" });
    }



    const ts = new Date().toLocaleTimeString();

    alerts.forEach(a => {
        const li = document.createElement("li");
        li.className = "alert " + (a.level === "high" ? "high-alert" : "normal-alert");
        li.textContent = `[${ts}] ${a.msg}`;
        alertList.appendChild(li);

        const p = document.createElement("p");
        p.textContent = `[${ts}] ${a.msg}`;
        logBox.appendChild(p);
        if (logBox.children.length > 100) logBox.removeChild(logBox.firstChild);
        logBox.scrollTop = logBox.scrollHeight;
    });
}


// ========== WEATHER ENGINE ==========

// Smooth noise for wind
function smoothNoise(prev, speed = 0.03, intensity = 5) {
    return prev + (Math.random() - 0.5) * intensity * speed;
}

// Update weather every tick
function updateWeather() {
    if (!state.weather.enabled) return;

    // Advance time: 1 tick = ~1 min
    state.weather.time = (state.weather.time + 1) % 1440;

    const t = state.weather.time;

    // --- SOLAR (sunlight curve) ---
    // Peak at noon (720 minutes), near zero at night
    const dayProgress = Math.abs(t - 720) / 720;  // 0 at noon, 1 at night
    let sunlight = 100 * (1 - dayProgress);       // inverted bell curve

    sunlight = Math.max(0, sunlight);             // clamp
    state.weather.sunlight = sunlight;

    // --- WIND (smooth noise) ---
    state.weather.wind = Math.min(100, Math.max(0,
        smoothNoise(state.weather.wind, 0.05, 8)
    ));

    // --- HYDRO (slow drift) ---
    state.weather.hydro = Math.min(100, Math.max(0,
        smoothNoise(state.weather.hydro, 0.01, 3)
    ));

    // Update UI
    const hh = String(Math.floor(t / 60)).padStart(2, '0');
    const mm = String(t % 60).padStart(2, '0');

    q('weatherTime').innerText = `${hh}:${mm}`;
    q('weatherSun').innerText = `${state.weather.sunlight.toFixed(1)} %`;
    q('weatherWind').innerText = `${state.weather.wind.toFixed(1)} %`;
    q('weatherHydro').innerText = `${state.weather.hydro.toFixed(1)} %`;

    // Push weather values into simulation ONLY IF manual sliders are untouched
    applyWeatherToSources();
}


// Apply weather values as "available" production — respects off toggle
function applyWeatherToSources() {
    if (!state.weather.enabled) return;
    const s = state.sources;
    s.solar.availableKW = s.solar.enabled === false ? 0 : (state.weather.sunlight / 100) * 100;
    s.wind.availableKW = s.wind.enabled === false ? 0 : (state.weather.wind / 100) * 100;
    s.hydro.availableKW = s.hydro.enabled === false ? 0 : (state.weather.hydro / 100) * 100;
}
