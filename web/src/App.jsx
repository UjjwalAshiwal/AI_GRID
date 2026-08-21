import { useEffect, useRef, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"

// ---- helpers
const uid = (p="id") => p+"_"+Math.random().toString(36).slice(2,7)
const HISTORY = 28
const BASE_TICK_HOURS = (2000/1000/3600)

// bklit/elevenlabs palette - monochrome + subtle accent for sources
const C = {
  bg: "#000", surface:"#0a0a0a", surface2:"#111111", border:"#1f1f1f", border2:"#2a2a2a",
  muted:"#888", muted2:"#555",
  solar:"#ffffff", wind:"#a1a1aa", hydro:"#71717a", diesel:"#3f3f46",
  gen:"#fff", out:"#52525b", accent:"#fff"
}

// Custom tooltip
function Tip({ active, payload, label }){
  if(!active || !payload?.length) return null
  return (
    <div className="bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 mono text-[11px] shadow-xl">
      <div className="text-[#666] mb-1">{label}</div>
      {payload.map(p=>(
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{background:p.color||p.stroke}}/>
          <span className="text-[#aaa]">{p.name || p.dataKey}:</span>
          <span className="text-white font-medium">{typeof p.value==="number"? p.value.toFixed(1): p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Card({ title, kicker, children, action, className="" }){
  return (
    <motion.div
      initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.28, ease:[0.25,0.1,0.25,1] }}
      className={`bg-[#0a0a0a] border border-[#1f1f1f] rounded-[14px] p-4 flex flex-col min-h-0 ${className}`}
    >
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-dashed border-[#1f1f1f]">
        <h4 className="mono text-[10px] tracking-[0.12em] uppercase text-[#999] font-medium">{title}</h4>
        <span className="text-[8px] text-[#333]">●</span>
        {kicker && <span className="mono text-[9px] tracking-widest text-[#555] border border-[#1f1f1f] rounded-full px-2 py-0.5">{kicker}</span>}
        {action}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </motion.div>
  )
}

// minimal clean FULL toggle — full-width, clean, no ornament
function PillToggle({ checked, onChange, label, hint }){
  return (
    <motion.button
      type="button"
      onClick={()=> onChange(!checked)}
      whileHover={{ y:-1 }}
      whileTap={{ scale:0.99 }}
      className={`w-full flex items-center justify-between gap-4 px-4 py-3 rounded-xl border text-left transition-colors ${checked ? "bg-white border-white" : "bg-[#0a0a0a] border-[#1f1f1f] hover:border-[#2a2a2a]"}`}
      aria-pressed={checked}
    >
      <div className="min-w-0">
        <div className={`mono text-[11px] tracking-[0.14em] uppercase font-medium leading-none ${checked ? "text-black" : "text-white"}`}>{label}</div>
        {hint && <div className={`mono text-[10px] leading-none mt-1 ${checked ? "text-black/60" : "text-[#666]"}`}>{hint}</div>}
      </div>
      <span className={`relative w-9 h-5 rounded-full p-1 flex items-center shrink-0 transition-colors ${checked ? "bg-black" : "bg-[#1f1f1f] border border-[#2a2a2a]"}`}>
        <motion.span
          layout
          transition={{ type:"spring", stiffness:700, damping:30 }}
          className={`w-3.5 h-3.5 rounded-full shadow ${checked ? "bg-white translate-x-4" : "bg-[#555] translate-x-0"}`}
        />
      </span>
    </motion.button>
  )
}

// Gauge - bklit style notch gauge
function NotchGauge({ value, label, sub }){
  const pct = Math.max(0, Math.min(100, value))
  const total = 40
  const active = Math.round((pct/100)*total)
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full flex justify-center py-2">
        <div className="flex gap-[3px] flex-wrap justify-center max-w-[260px]">
          {Array.from({length: total}).map((_,i)=>{
            const on = i < active
            return <div key={i} className="w-[6px] h-[18px] rounded-[2px] transition-colors duration-500" style={{
              background: on ? "#fff" : "#1a1a1a",
              opacity: on ? 1 : 1,
              boxShadow: on ? "0 0 8px rgba(255,255,255,0.15)" : "none"
            }}/>
          })}
        </div>
      </div>
      <div className="text-center mt-2">
        <div className="mono text-xl font-semibold tracking-tight">{pct.toFixed(1)}%</div>
        <div className="mono text-[10px] tracking-widest uppercase text-[#666]">{label}</div>
        {sub && <div className="mono text-[10px] text-[#444] mt-1">{sub}</div>}
      </div>
    </div>
  )
}

// Heatmap - 7 days x 24h style
function Heatmap({ data }){
  // data: array of values 0-100 for last ~ 7*6 =42 slots, we render grid
  const cols = 14
  const rows = 4
  const cells = useMemo(()=>{
    const arr = [...data]
    while(arr.length < cols*rows) arr.unshift(0)
    return arr.slice(-cols*rows)
  },[data])
  return (
    <div className="space-y-2">
      <div className="grid gap-[3px]" style={{gridTemplateColumns:`repeat(${cols}, minmax(0,1fr))`}}>
        {cells.map((v,i)=>{
          const op = 0.08 + (v/100)*0.9
          return <div key={i} className="aspect-square rounded-[3px] border border-[#1a1a1a] transition-colors duration-700"
            style={{background:`rgba(255,255,255,${op})`}} title={`${v.toFixed(0)} kW`} />
        })}
      </div>
      <div className="flex items-center justify-between mono text-[9px] text-[#555]">
        <span>LOW</span><div className="flex gap-1 items-center"><div className="w-2 h-2 rounded-sm bg-white/10 border border-[#222]"/><div className="w-2 h-2 rounded-sm bg-white/40"/><div className="w-2 h-2 rounded-sm bg-white"/></div><span>HIGH</span>
      </div>
    </div>
  )
}

function ConfirmModal({ open, title, desc, confirmLabel="Remove", onConfirm, onCancel }){
  if(!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onCancel} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div initial={{opacity:0, y:10, scale:0.98}} animate={{opacity:1, y:0, scale:1}} exit={{opacity:0, y:6}} transition={{type:"spring", stiffness:400, damping:28}} className="relative w-[420px] max-w-[92vw] bg-[#0a0a0a] border border-[#1f1f1f] rounded-[16px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0"><i className="fa-solid fa-triangle-exclamation text-sm"/></div>
          <div className="flex-1 min-w-0">
            <div className="mono text-[11px] tracking-[0.16em] uppercase text-[#888]">Confirm</div>
            <div className="text-[15px] font-semibold leading-tight mt-1">{title}</div>
            {desc && <div className="mono text-xs text-[#888] leading-relaxed mt-2">{desc}</div>}
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <motion.button whileHover={{y:-1}} whileTap={{scale:0.98}} onClick={onCancel} className="flex-1 bg-[#111] border border-[#1f1f1f] mono text-[11px] tracking-widest uppercase font-medium py-3 rounded-full">Cancel</motion.button>
          <motion.button whileHover={{y:-1}} whileTap={{scale:0.98}} onClick={onConfirm} className="flex-1 bg-red-500 text-white mono text-[11px] tracking-widest uppercase font-semibold py-3 rounded-full shadow-[0_6px_20px_rgba(239,68,68,0.3)]"> {confirmLabel}</motion.button>
        </div>
      </motion.div>
    </div>
  )
}

export default function App(){
  const [auth, setAuth] = useState(()=> localStorage.getItem("userRole") || "")
  const [user, setUser] = useState(()=> localStorage.getItem("username") || "")
  const [tab, setTab] = useState("dashboard")
  const [search, setSearch] = useState("")
  const [ver, setVer] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [theme, setTheme] = useState(()=> localStorage.getItem("theme") || "dark")
  const [confirm, setConfirm] = useState(null)
  const [newDst, setNewDst] = useState({name:"", demand:80, eff:85, priority:2})
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [mode, setMode] = useState(()=> localStorage.getItem("dashboardMode") || "simulation")
  const isViewer = auth==='viewer'
  useEffect(()=>{ document.documentElement.classList.toggle("light", theme==="light"); localStorage.setItem("theme", theme) }, [theme])
  useEffect(()=>{ localStorage.setItem("dashboardMode", mode) }, [mode])
  useEffect(()=>{ document.body.classList.toggle('viewer-mode', isViewer) }, [isViewer])
  // when switching to real, instantly show static 0 lines — no drop animation from simulation highs
  useEffect(()=>{
    if(mode==='real'){
      const z = Array(HISTORY).fill(0)
      const zl = Array(HISTORY).fill('')
      ;['solar','wind','hydro','diesel'].forEach(k=>{ if(sRef.sources[k]){ sRef.sources[k].history=[...z]; sRef.sources[k].availableKW=0 }})
      sRef.historyCombined.gen=[...z]
      sRef.historyCombined.out=[...z]
      sRef.historyCombined.forecast=Array(HISTORY).fill(null)
      sRef.historyCombined.labels=[...zl]
      const stored = sRef.batteries.reduce((a,b)=>a+b.stored_kwh,0)
      sRef.historyBattery=Array(HISTORY).fill(stored)
      sRef.destinations.forEach(d=>{ if(!d.history) d.history={incoming:[],consuming:[],wasting:[]}; d.history.incoming=[...z]; d.history.consuming=[...z]; d.history.wasting=[...z]; d.incoming=0; d.consuming=0; d.wasting=0; d.lastRecvKW=0; d.shedKW=0 })
      setForecastVal(null); setForecastMeta({status:"ready", error:"real mode — no forecast"})
      setVer(v=>v+1)
    }
  },[mode])

  // state ref - mirrors main.js + AI forecast
  const [forecastVal, setForecastVal] = useState(null)
  const [forecastMeta, setForecastMeta] = useState({ status:"loading", error:null })
  const stateRef = useRef({
    sources:{ solar:{enabled:true, light:80, toOutPct:80, availableKW:0, history:[]}, wind:{enabled:true, speed:8, toOutPct:70, availableKW:0, history:[]}, hydro:{enabled:true, flow:50, toOutPct:60, availableKW:0, history:[]}, diesel:{enabled:false,on:false,toOutPct:100, availableKW:0, history:[]} },
    batteries:[],
    destinations:[],
    totals:{gen_kwh:0,out_kwh:0,saved_kwh:0, perSource_kwh:{solar:0,wind:0,hydro:0,diesel:0}},
    historyCombined:{gen:[],out:[], forecast:[], labels:[]},
    historyBattery:[],
    grid:{mode:"grid", importKW:0, exportKW:0},
    hybrid:{enabled:false, chargePct:100},
    weather:{enabled:false, time:720, sunlight:0, wind:0, hydro:0},
    shedding:{active:false, shedCount:0}
  })

  const sRef = stateRef.current
  const tickRunning = useRef(false)

  // init batteries/dests
  useEffect(()=>{
    if(sRef.batteries.length===0){
      sRef.batteries.push({id:uid("bat"), capacity_kwh:2000, stored_kwh:980, maxChargeKW:500, maxDischargeKW:500})
      sRef.batteries.push({id:uid("bat"), capacity_kwh:500, stored_kwh:220, maxChargeKW:200, maxDischargeKW:200})
    }
    if(sRef.destinations.length===0){
      sRef.destinations.push({id:uid("dst"), name:"Grid", priority:1, demandKW:120, lastRecvKW:0, shedKW:0, efficiency:0.92, incoming:0, consuming:0, wasting:0, history:{incoming:[], consuming:[], wasting:[]}, totals:{incoming_kwh:0, consuming_kwh:0, wasting_kwh:0}})
      sRef.destinations.push({id:uid("dst"), name:"Local Factory", priority:2, demandKW:80, lastRecvKW:0, shedKW:0, efficiency:0.82, incoming:0, consuming:0, wasting:0, history:{incoming:[], consuming:[], wasting:[]}, totals:{incoming_kwh:0, consuming_kwh:0, wasting_kwh:0}})
    }
    setVer(v=>v+1)
  },[])

  // fetch backend
  async function fetchPower(){
    try{
      const r = await fetch("http://127.0.0.1:5000/simulate",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          sunlight: sRef.sources.solar.light,
          wind: sRef.sources.wind.speed,
          hydro: sRef.sources.hydro.flow
        })
      })
      if(!r.ok) throw new Error("backend")
      return await r.json()
    }catch{
      return {
        solar_kw: Math.round((sRef.sources.solar.light/100)*1000),
        wind_kw: Math.round(Math.pow(Math.min(sRef.sources.wind.speed,12)/12,3)*1000),
        hydro_kw: Math.round((sRef.sources.hydro.flow/100)*900)
      }
    }
  }
  async function fetchForecast({ solar_kw, wind_kw, hydro_kw, battery_soc }){
    try{
      const r = await fetch("http://127.0.0.1:5000/forecast",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ solar_kw, wind_kw, hydro_kw, battery_soc })
      })
      if(!r.ok) throw new Error("forecast")
      const d = await r.json()
      return d.gen_kw ?? d.forecast ?? d.prediction ?? null
    }catch{
      // fallback: simple trend
      const last = sRef.historyCombined.gen.at(-1) ?? (solar_kw+wind_kw+hydro_kw)
      return last * 0.98 + (Math.random()-0.5)*12
    }
  }

  // tick — real mode = 0 values, no simulation; simulation = live fetch
  useEffect(()=>{
    let id
    async function tick(){
      if(tickRunning.current) return
      tickRunning.current=true
      try{
        const effHours = BASE_TICK_HOURS
        if(mode === 'real'){
          // real hardware — no simulated data, all 0, no intensity
          sRef.sources.solar.availableKW = 0
          sRef.sources.wind.availableKW = 0
          sRef.sources.hydro.availableKW = 0
          sRef.sources.diesel.availableKW = 0
        } else {
          const d = await fetchPower()
          sRef.sources.solar.availableKW = sRef.sources.solar.enabled === false ? 0 : (d.solar_kw || 0)
          sRef.sources.wind.availableKW = sRef.sources.wind.enabled === false ? 0 : (d.wind_kw || 0)
          sRef.sources.hydro.availableKW = sRef.sources.hydro.enabled === false ? 0 : (d.hydro_kw || 0)
          sRef.sources.diesel.availableKW = sRef.sources.diesel.on ? 50 : 0
        }
        // diesel respects its own toggle, solar/wind/hydro respect enabled — off truly cuts generation

        // histories
        ;["solar","wind","hydro","diesel"].forEach(k=>{
          const h = sRef.sources[k].history
          h.push(sRef.sources[k].availableKW)
          if(h.length>HISTORY) h.shift()
        })

        // split
        const so = {
          solar: sRef.sources.solar.availableKW * (sRef.sources.solar.toOutPct/100),
          wind: sRef.sources.wind.availableKW * (sRef.sources.wind.toOutPct/100),
          hydro: sRef.sources.hydro.availableKW * (sRef.sources.hydro.toOutPct/100),
          diesel: sRef.sources.diesel.availableKW * (sRef.sources.diesel.toOutPct/100),
        }
        const totalGen = sRef.sources.solar.availableKW + sRef.sources.wind.availableKW + sRef.sources.hydro.availableKW + sRef.sources.diesel.availableKW
        const totalOut = so.solar+so.wind+so.hydro+so.diesel
        const surplusKW = Math.max(0, totalGen - totalOut)

        // destinations shedding priority + per-destination incoming/consuming/wasting
        let remaining = totalOut
        const sorted=[...sRef.destinations].sort((a,b)=>a.priority-b.priority)
        let shed=0
        // ensure shape for older dest objects
        sRef.destinations.forEach(d=>{
          if(!d.history) d.history={incoming:[], consuming:[], wasting:[]}
          if(d.efficiency==null) d.efficiency=0.85
          if(!d.totals) d.totals={incoming_kwh:0, consuming_kwh:0, wasting_kwh:0}
        })
        sorted.forEach(d=>{
          const dem=d.demandKW||0
          let sup=0
          if(remaining>0 && dem>0){ sup=Math.min(dem,remaining); remaining-=sup}
          d.lastRecvKW=sup
          d.shedKW=Math.max(0,dem-sup)
          if(d.shedKW>0.1) shed++
          // incoming = allocated, consuming = efficiency portion, wasting = loss
          const eff = d.efficiency ?? 0.85
          d.incoming = sup
          d.consuming = sup * eff
          d.wasting = sup * (1 - eff)
          // push histories
          d.history.incoming.push(d.incoming); if(d.history.incoming.length>HISTORY) d.history.incoming.shift()
          d.history.consuming.push(d.consuming); if(d.history.consuming.length>HISTORY) d.history.consuming.shift()
          d.history.wasting.push(d.wasting); if(d.history.wasting.length>HISTORY) d.history.wasting.shift()
          // totals kWh
          d.totals.incoming_kwh += d.incoming * effHours
          d.totals.consuming_kwh += d.consuming * effHours
          d.totals.wasting_kwh += d.wasting * effHours
        })
        sRef.shedding.active=shed>0; sRef.shedding.shedCount=shed

        // grid
        const totalDemand = sRef.destinations.reduce((a,b)=>a+b.demandKW,0)
        const totalSup = sRef.destinations.reduce((a,b)=>a+b.lastRecvKW,0)
        const deficit = totalDemand - totalSup
        const surplus = totalOut - totalSup
        let imp=0,exp=0
        const gridMode=sRef.grid.mode
        if(gridMode==="grid"){ if(deficit>0) imp=deficit; if(surplus>0) exp=surplus }
        else if(gridMode==="hybrid"){ const cap=sRef.batteries.reduce((a,b)=>a+b.capacity_kwh,0); const sto=sRef.batteries.reduce((a,b)=>a+b.stored_kwh,0); const soc= cap?sto/cap:0; if(deficit>0 && soc<0.2) imp=deficit; if(surplus>0) exp=surplus }
        sRef.grid.importKW=imp; sRef.grid.exportKW=exp
        if(gridMode==="island" && deficit>0){ sRef.sources.diesel.on=true }

        // batteries charge — hybrid: excess output charges battery while destinations run
        let hybridExcessKW = 0, hybridExcess_kWh = 0
        if(sRef.hybrid?.enabled){
          hybridExcessKW = Math.max(0, remaining) * (sRef.hybrid.chargePct/100)
          hybridExcess_kWh = hybridExcessKW * effHours
        }
        const genSurplus_kWh = surplusKW*effHours
        const totalCharge_kWh = genSurplus_kWh + hybridExcess_kWh
        let rem = totalCharge_kWh
        for(const b of sRef.batteries){
          if(rem<=0) break
          const can = b.capacity_kwh - b.stored_kwh
          if(can<=0) continue
          const lim = b.maxChargeKW*effHours
          const add = Math.min(can,lim,rem)
          b.stored_kwh+=add; rem-=add
        }
        const charged = totalCharge_kWh - rem
        // hybrid reduces grid export by diverted amount (controllable)
        if(sRef.hybrid?.enabled && gridMode !== 'island'){
          const intendedExport = Math.max(0, remaining - hybridExcessKW) + (rem / effHours)
          sRef.grid.exportKW = intendedExport
          exp = intendedExport
        }
        sRef.totals.gen_kwh += totalGen*effHours
        sRef.totals.out_kwh += totalOut*effHours
        sRef.totals.saved_kwh += charged
        sRef.totals.perSource_kwh.solar += sRef.sources.solar.availableKW*effHours
        sRef.totals.perSource_kwh.wind += sRef.sources.wind.availableKW*effHours
        sRef.totals.perSource_kwh.hydro += sRef.sources.hydro.availableKW*effHours
        sRef.totals.perSource_kwh.diesel += sRef.sources.diesel.availableKW*effHours

        // AI forecast — disabled in real mode (no simulation)
        const socForForecast = (()=>{ const cap=sRef.batteries.reduce((a,b)=>a+b.capacity_kwh,0); const sto=sRef.batteries.reduce((a,b)=>a+b.stored_kwh,0); return cap? sto/cap : 0.5 })()
        let forecastKw = null
        if(mode === 'real'){
          setForecastVal(null); setForecastMeta({status:"ready", error:"real mode — no forecast"})
          forecastKw = null
        } else {
          try{
            forecastKw = await fetchForecast({ solar_kw: sRef.sources.solar.availableKW, wind_kw: sRef.sources.wind.availableKW, hydro_kw: sRef.sources.hydro.availableKW, battery_soc: socForForecast })
            if(typeof forecastKw==="number"){ setForecastVal(forecastKw); setForecastMeta({status:"ready", error:null}) }
          }catch(e){ setForecastMeta({status:"ready", error:e.message}) }
        }

        // combined histories (include forecast)
        const label = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})
        sRef.historyCombined.gen.push(totalGen); if(sRef.historyCombined.gen.length>HISTORY) sRef.historyCombined.gen.shift()
        sRef.historyCombined.out.push(totalOut); if(sRef.historyCombined.out.length>HISTORY) sRef.historyCombined.out.shift()
        sRef.historyCombined.forecast.push(forecastKw); if(sRef.historyCombined.forecast.length>HISTORY) sRef.historyCombined.forecast.shift()
        sRef.historyCombined.labels.push(label); if(sRef.historyCombined.labels.length>HISTORY) sRef.historyCombined.labels.shift()
        const stored = sRef.batteries.reduce((a,b)=>a+b.stored_kwh,0)
        sRef.historyBattery.push(stored); if(sRef.historyBattery.length>HISTORY) sRef.historyBattery.shift()

        setVer(v=>v+1)
      }catch(e){ console.error(e)}
      tickRunning.current=false
    }
    id = setInterval(tick, Math.max(200, 2000 / speed))
    tick()
    return ()=>clearInterval(id)
  // eslint-disable-next-line
  },[speed, mode])

  // derived
  const totalGen = sRef.sources.solar.availableKW + sRef.sources.wind.availableKW + sRef.sources.hydro.availableKW + sRef.sources.diesel.availableKW
  const totalOut = sRef.sources.solar.availableKW*(sRef.sources.solar.toOutPct/100)+sRef.sources.wind.availableKW*(sRef.sources.wind.toOutPct/100)+sRef.sources.hydro.availableKW*(sRef.sources.hydro.toOutPct/100)+sRef.sources.diesel.availableKW*(sRef.sources.diesel.toOutPct/100)
  const totalStored = sRef.batteries.reduce((a,b)=>a+b.stored_kwh,0)
  const totalCap = sRef.batteries.reduce((a,b)=>a+b.capacity_kwh,0)
  const soc = totalCap? (totalStored/totalCap)*100:0
  const gridC = theme==="light" ? "#e5e5e5" : "#1a1a1a"
  const gridC2 = theme==="light" ? "#e7e7e7" : "#111"
  const axisC = theme==="light" ? "#52525b" : "#555"
  const lineC = theme==="light" ? "#09090b" : "#fff"
  const lineMuted = theme==="light" ? "#27272a" : "#a1a1aa"
  const lineFaint = theme==="light" ? "#52525b" : "#71717a"
  // vibrant palette — same trifecta as Destinations (white incoming / emerald consuming / amber wasting) for ALL charts — wind/hydro swapped
  const palette = theme==="light"
    ? { solar:"#d97706", wind:"#059669", hydro:"#0284c7", diesel:"#52525b", gen:"#09090b", forecast:"#d97706", out:"#059669", barDest:"#059669", pie:["#d97706","#059669","#0284c7","#71717a"] }
    : { solar:"#f59e0b", wind:"#10b981", hydro:"#38bdf8", diesel:"#52525b", gen:"#fff", forecast:"#f59e0b", out:"#10b981", barDest:"#10b981", pie:["#f59e0b","#10b981","#38bdf8","#52525b"] }

  const combinedData = useMemo(()=> sRef.historyCombined.labels.map((l,i)=>({
    t:l, gen:sRef.historyCombined.gen[i]||0, out:sRef.historyCombined.out[i]||0, forecast: sRef.historyCombined.forecast[i] ?? null
  })), [ver])
  const stackedData = useMemo(()=> sRef.historyCombined.labels.map((l,i)=>({
    t:l,
    solar: sRef.sources.solar.history[i]||0,
    wind: sRef.sources.wind.history[i]||0,
    hydro: sRef.sources.hydro.history[i]||0,
    diesel: sRef.sources.diesel.history[i]||0,
  })), [ver])
  const batteryTrend = useMemo(()=> sRef.historyBattery.map((v,i)=>({t:i, stored:v})), [ver])
  const sourceTotals = sRef.totals.perSource_kwh
  const pieData = [
    {name:"Solar", value:sourceTotals.solar},
    {name:"Wind", value:sourceTotals.wind},
    {name:"Hydro", value:sourceTotals.hydro},
    {name:"Diesel", value:sourceTotals.diesel},
  ].filter(d=>d.value>0)

  // destination analytics derived
  const destTotalsAgg = useMemo(()=> sRef.destinations.reduce((a,d)=>({
    incoming: a.incoming + (d.totals?.incoming_kwh||0),
    consuming: a.consuming + (d.totals?.consuming_kwh||0),
    wasting: a.wasting + (d.totals?.wasting_kwh||0),
    incomingKW: a.incomingKW + (d.incoming||0),
    consumingKW: a.consumingKW + (d.consuming||0),
    wastingKW: a.wastingKW + (d.wasting||0),
  }), {incoming:0, consuming:0, wasting:0, incomingKW:0, consumingKW:0, wastingKW:0}), [ver])
  const destEfficiency = destTotalsAgg.incomingKW>0 ? (destTotalsAgg.consumingKW/destTotalsAgg.incomingKW)*100 : 0
  const destConsumePie = useMemo(()=>{
    const byKwh = sRef.destinations.map(d=>({name:d.name, value: d.totals?.consuming_kwh||0}));
    const nz = byKwh.filter(d=>d.value>0);
    if(nz.length) return nz;
    // fallback to live consuming so pie shows immediately
    const byLive = sRef.destinations.map(d=>({name:d.name, value: d.consuming||0})).filter(d=>d.value>0);
    return byLive.length ? byLive : byKwh;
  },[ver])
  const destWasteData = sRef.destinations.map(d=>({name:d.name, waste: d.wasting||0, consuming: d.consuming||0, incoming: d.incoming||0}))
  const destTrendData = useMemo(()=>{
    // always HISTORY points, padded with zeros — so chart shows immediately and stays stable
    const hl = Math.max(...sRef.destinations.map(d=>d.history?.incoming?.length||0), sRef.historyCombined.labels.length, 1);
    return Array.from({length:HISTORY}, (_,i)=>{
      const srcIdx = hl - HISTORY + i;
      if(srcIdx < 0) return { t: i, incoming:0, consuming:0, wasting:0 };
      return {
        t: sRef.historyCombined.labels[srcIdx] || srcIdx,
        incoming: sRef.destinations.reduce((s,d)=>s+(d.history?.incoming[srcIdx]||0),0),
        consuming: sRef.destinations.reduce((s,d)=>s+(d.history?.consuming[srcIdx]||0),0),
        wasting: sRef.destinations.reduce((s,d)=>s+(d.history?.wasting[srcIdx]||0),0),
      };
    })
  },[ver])

  // filters for search
  const filteredDest = sRef.destinations.filter(d=> d.name.toLowerCase().includes(search.toLowerCase()))

  if(!auth){
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)", backgroundSize:"32px 32px"}}/>
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="w-[380px] bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl p-7 relative">
          <div className="absolute -top-px left-1/2 -translate-x-1/2 mono text-[9px] tracking-[0.2em] text-[#555] bg-[#0a0a0a] border border-[#1f1f1f] border-t-0 px-3 py-1 rounded-b-lg">SYSTEM AUTH // GRID-01</div>
          <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center text-xl mx-auto mt-2">◐</div>
          <h2 className="text-center font-semibold text-[20px] mt-4 tracking-tight">RenewGrid Control</h2>
          <p className="mono text-[11px] tracking-widest uppercase text-[#666] text-center mt-1 mb-6">Login to your dashboard</p>
          <div className="space-y-3">
            <div><label className="mono text-[10px] tracking-widest uppercase text-[#666]">Username</label><input id="u" placeholder="admin" className="mt-1 w-full bg-[#000] border border-[#1f1f1f] rounded-lg px-3 py-2.5 mono text-sm outline-none focus:border-[#333] placeholder:text-[#333]"/></div>
            <div><label className="mono text-[10px] tracking-widest uppercase text-[#666]">Role</label><select id="r" className="mt-1 w-full bg-black border border-[#1f1f1f] rounded-lg px-3 py-2.5 mono text-sm outline-none">
              <option value="admin">Admin</option><option value="viewer">Viewer</option>
            </select></div>
            <div>
              <label className="mono text-[10px] tracking-widest uppercase text-[#666]">Dashboard type</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button type="button" onClick={()=> setMode('simulation')} className={`px-3 py-2.5 rounded-full mono text-xs font-medium border flex items-center justify-center gap-2 transition ${mode==='simulation' ? "bg-white text-black border-white shadow" : "bg-black border-[#1f1f1f] text-[#888] hover:border-[#2a2a2a]"}`}>
                  <i className="fa-solid fa-flask text-[11px]"/> Simulation
                </button>
                <button type="button" onClick={()=> setMode('real')} className={`px-3 py-2.5 rounded-full mono text-xs font-medium border flex items-center justify-center gap-2 transition ${mode==='real' ? "bg-white text-black border-white shadow" : "bg-black border-[#1f1f1f] text-[#888] hover:border-[#2a2a2a]"}`}>
                  <i className="fa-solid fa-tower-broadcast text-[11px]"/> Real
                </button>
              </div>
              <div className="mono text-[10px] text-[#555] mt-2 leading-relaxed">{mode==='simulation' ? "Simulated generation, adjustable intensity & live charts." : "Real hardware — 0 kW until device connected, no intensity controls."}</div>
            </div>
            <button onClick={()=>{
              const u=document.getElementById("u").value || "admin"
              const r=document.getElementById("r").value
              localStorage.setItem("userRole",r); localStorage.setItem("username",u); localStorage.setItem("dashboardMode", mode)
              setAuth(r); setUser(u)
            }} className="w-full mt-2 bg-white text-black mono text-xs font-semibold tracking-widest uppercase py-3 rounded-lg hover:bg-zinc-100 transition">Login</button>
          </div>
        </motion.div>
      </div>
    )
  }

  const nav = [
    {id:"dashboard", label:"Dashboard", icon:"fa-gauge", group:"OVERVIEW"},
    {id:"sources", label:"Sources", icon:"fa-bolt", group:"OVERVIEW"},
    {id:"destinations", label:"Destinations", icon:"fa-location-arrow", group:"OVERVIEW"},
    {id:"grid", label:"GRID", icon:"fa-network-wired", group:"OVERVIEW"},
    {id:"storage", label:"Storage", icon:"fa-battery-half", group:"OVERVIEW"},
    {id:"analytics", label:"Analytics", icon:"fa-chart-line", group:"INSIGHTS"},
    {id:"settings", label:"Settings", icon:"fa-gear", group:"SYSTEM"},
  ]
  const groups = ["OVERVIEW","INSIGHTS","SYSTEM"]

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* sidebar - elevenlabs — retractable */}
      <motion.aside animate={{ width: navCollapsed ? 72 : 256 }} transition={{ type:"spring", stiffness:340, damping:32 }} className="shrink-0 bg-black border-r border-[#1a1a1a] flex flex-col sticky top-0 h-screen overflow-hidden">
        <div className="h-11 flex items-center px-3 border-b border-[#1a1a1a] mono text-[10px] tracking-[0.18em] text-[#555] shrink-0">
          {!navCollapsed && <><span className="w-2 h-2 rounded-full bg-white mr-2 animate-pulse"/> RENEWGRID // LAB-01</>}
          <motion.button whileTap={{scale:0.92}} onClick={()=> setNavCollapsed(v=>!v)} className={`ml-auto w-7 h-7 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-center text-[#666] hover:text-white hover:border-[#2a2a2a] ${navCollapsed ? "mx-auto" : ""}`} title={navCollapsed ? "Expand" : "Collapse"}>
            <i className={`fa-solid ${navCollapsed ? "fa-chevron-right" : "fa-chevron-left"} text-[11px]`}/>
          </motion.button>
        </div>
        <div className="p-3">
          <div className={`flex items-center gap-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl px-3 py-3 ${navCollapsed ? "justify-center px-2" : ""}`}>
            <div className="w-9 h-9 rounded-lg bg-white text-black flex items-center justify-center font-bold shrink-0">◐</div>
            {!navCollapsed && (
              <>
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight leading-none truncate">RenewGrid</div>
                  <div className="mono text-[10px] tracking-widest uppercase text-[#666]">Control Center</div>
                </div>
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] shrink-0"/>
              </>
            )}
          </div>
        </div>

        <nav className={`flex-1 py-2 space-y-5 overflow-auto ${navCollapsed ? "px-2" : "px-3"}`}>
          {groups.map(g=>(
            <div key={g}>
              {!navCollapsed && <div className="mono text-[10px] tracking-[0.14em] text-[#333] px-2 mb-2">{g}</div>}
              <div className="space-y-1">
                {nav.filter(n=>n.group===g).map(n=>(
                  <button key={n.id} onClick={()=>setTab(n.id)} title={navCollapsed ? n.label : undefined}
                    className={`flex items-center gap-3 rounded-lg mono text-xs tracking-wide uppercase transition
                    ${navCollapsed ? "w-10 h-10 justify-center p-0 mx-auto" : "w-full px-3 py-2"}
                    ${tab===n.id ? "bg-white text-black" : "text-[#888] hover:bg-[#0a0a0a] hover:text-white border border-transparent hover:border-[#1a1a1a]"}`}>
                    <i className={`fa-solid ${n.icon} text-center text-[13px] ${navCollapsed ? "w-auto" : "w-4"} ${tab===n.id?"text-black":"text-[#555]"}`}/>
                    {!navCollapsed && n.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={`p-3 border-t border-[#1a1a1a] space-y-3 ${navCollapsed ? "px-2" : ""}`}>
          {!navCollapsed ? (
            <>
              <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 flex items-center justify-between mono text-[10px] tracking-widest uppercase text-[#666]">
                <span>Role</span><span className="text-white font-semibold">{auth}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setTheme(theme==="dark"?"light":"dark")} className="flex-1 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 flex items-center justify-center gap-2 mono text-xs hover:border-[#333] transition">
                  <i className={`fa-solid ${theme==="dark"?"fa-moon":"fa-sun"} text-xs`}/>{theme==="dark"?"Dark":"Light"}
                </button>
                <button onClick={()=>{localStorage.clear(); location.reload()}} className="w-10 h-10 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-center text-[#666] hover:text-white hover:border-[#333] transition"><i className="fa-solid fa-right-from-bracket text-xs"/></button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center mono text-[10px] font-bold">{user.slice(0,2).toUpperCase()||"UA"}</div>
                  <span className="mono text-xs truncate">{user||"admin"}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="w-10 h-10 mx-auto rounded-lg bg-white text-black flex items-center justify-center mono text-[10px] font-bold">{user.slice(0,2).toUpperCase()||"UA"}</div>
              <button onClick={()=>setTheme(theme==="dark"?"light":"dark")} className="w-10 h-10 mx-auto rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-center text-[#666] hover:text-white flex justify-center"><i className={`fa-solid ${theme==="dark"?"fa-moon":"fa-sun"} text-xs`}/></button>
              <button onClick={()=>{localStorage.clear(); location.reload()}} className="w-10 h-10 mx-auto rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-center text-[#666] hover:text-white"><i className="fa-solid fa-right-from-bracket text-xs"/></button>
            </div>
          )}
        </div>
      </motion.aside>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* topbar */}
        <header className="h-[56px] sticky top-0 z-20 bg-black/80 backdrop-blur-xl border-b border-[#1a1a1a] flex items-center gap-4 px-5">
          {navCollapsed && (
            <motion.button whileTap={{scale:0.92}} onClick={()=> setNavCollapsed(false)} className="w-9 h-9 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-center text-[#888] hover:text-white shrink-0 lg:hidden xl:flex hidden" title="Expand nav">
              <i className="fa-solid fa-bars text-xs"/>
            </motion.button>
          )}
          <div className={`flex items-center gap-2 bg-[#0a0a0a] border rounded-full px-3 py-2 ${isViewer ? "border-[#333] opacity-60" : "border-[#1f1f1f]"}`} style={{pointerEvents: isViewer ? 'none' : 'auto'}}>
            <span className="mono text-[10px] tracking-[0.12em] uppercase text-[#666] flex items-center gap-1.5 whitespace-nowrap"><i className="fa-solid fa-code-branch text-[10px] text-emerald-500"/> Hybrid</span>
            <button disabled={isViewer} onClick={()=>{if(isViewer) return; sRef.hybrid.enabled=!sRef.hybrid.enabled; setVer(v=>v+1)}} className={`relative w-9 h-5 rounded-full p-1 flex items-center shrink-0 border transition ${isViewer ? "opacity-50 cursor-not-allowed" : ""} ${sRef.hybrid.enabled ? "bg-white border-white" : "bg-[#111] border-[#1f1f1f]"}`}>
              <span className={`w-3.5 h-3.5 rounded-full transition ${sRef.hybrid.enabled ? "bg-black translate-x-4" : "bg-[#555]"}`}/>
            </button>
            <span className="mono text-[9px] whitespace-nowrap" style={{color: sRef.hybrid.enabled ? "#10b981" : "#555"}}>{sRef.hybrid.enabled ? "ON" : "OFF"}</span>
          </div>
          <div className="hidden md:flex items-center gap-2 mono text-[10px] tracking-[0.16em] uppercase border rounded-full px-3 py-1.5" style={{background: mode==='real' ? "#0f1a14" : "#0a0a0a", borderColor: mode==='real' ? "rgba(16,185,129,0.30)" : "#1f1f1f", color: mode==='real' ? "#10b981" : "#888"}}>
            <span className={`w-2 h-2 rounded-full ${mode==='real' ? "bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-white animate-pulse"}`}/>
            {mode==='real' ? "REAL" : "SIMULATION"}
            <span className="text-[9px] opacity-60">• {mode==='real' ? "hardware • 0 kW" : "synthetic • live"}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {[
              {k:"Total Generation", v:Math.round(totalGen)+" kW"},
              {k:"Total Output", v:Math.round(totalOut)+" kW"},
              {k:"Battery Stored", v:totalStored.toFixed(1)+" kWh"},
            ].map(s=>(
              <div key={s.k} className="hidden lg:flex flex-col items-end bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl px-3 py-1.5 min-w-[130px]">
                <span className="mono text-[9px] tracking-[0.14em] uppercase text-[#555]">{s.k}</span>
                <span className="mono text-[13px] font-semibold tracking-tight">{s.v}</span>
              </div>
            ))}
            <button disabled={isViewer} onClick={()=>{if(isViewer) return; setTheme(theme==="dark"?"light":"dark")}} className={`w-9 h-9 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-center text-[#888] hover:text-white hover:border-[#333] transition ${isViewer ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`} title={`Switch to ${theme==="dark"?"light":"dark"}`}>
              <i className={`fa-solid ${theme==="dark"?"fa-moon":"fa-sun"} text-sm`}/>
            </button>
            <div className="w-9 h-9 rounded-lg bg-white text-black flex items-center justify-center mono text-xs font-bold">UA</div>
          </div>
        </header>
        {isViewer && (
          <div className="bg-[#111] border-b border-[#1f1f1f] mono text-[10px] tracking-[0.12em] uppercase text-[#888] px-5 py-2 flex items-center gap-2">
            <i className="fa-solid fa-eye text-[#666]"/> View Only — no changes allowed (Real & Simulation)
          </div>
        )}

        <main className="flex-1 p-5 bg-black" style={{pointerEvents: isViewer ? 'none' : 'auto', opacity: isViewer ? 0.75 : 1}}>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{opacity:0, y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:0.2}} className="space-y-4">

              {tab==="dashboard" && (
                <>
                  {mode==='real' && (
                    <div className="grid grid-cols-12 gap-4">
                      <Card title="REAL MODE — hardware" kicker="● REAL" className="col-span-12 border-[#10b981]/30 bg-[#0f1a14]">
                        <div className="mono text-xs text-[#10b981] flex items-center gap-2"><i className="fa-solid fa-tower-broadcast"/> No simulation — all sources 0 kW. Connect hardware to stream live data. Intensity locked.</div>
                      </Card>
                    </div>
                  )}
                  {/* no blank gap — left: charts+stacked, right: health+summary+quick */}
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 lg:col-span-8 space-y-4">
                      <Card title="Generation vs Output — Live + AI Forecast" kicker={forecastMeta.status==="loading"?"◐ LOADING":"● LIVE"}>
                        <div className="h-[260px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={combinedData} margin={{top:10,right:12,left:0,bottom:0}}>
                              <defs>
                                <linearGradient id="gGen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={palette.gen} stopOpacity={0.32}/><stop offset="100%" stopColor={palette.gen} stopOpacity={0}/></linearGradient>
                                <linearGradient id="gFore" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={palette.forecast} stopOpacity={0.22}/><stop offset="100%" stopColor={palette.forecast} stopOpacity={0}/></linearGradient>
                                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={palette.out} stopOpacity={0.28}/><stop offset="100%" stopColor={palette.out} stopOpacity={0}/></linearGradient>
                              </defs>
                              <CartesianGrid stroke={gridC} strokeDasharray="3 3" vertical={false}/>
                              <XAxis dataKey="t" tick={{fill:axisC, fontSize:10, fontFamily:"JetBrains Mono"}} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24}/>
                              <YAxis tick={{fill:axisC, fontSize:10, fontFamily:"JetBrains Mono"}} axisLine={false} tickLine={false} width={36}/>
                              <Tooltip content={<Tip/>}/>
                              <Area type="monotone" dataKey="gen" name="Generation (Actual)" stroke={palette.gen} strokeWidth={1.7} fill="url(#gGen)" dot={false} isAnimationActive animationDuration={800} animationEasing="ease-out" activeDot={{r:3, fill:palette.gen, stroke:"#000", strokeWidth:1}}/>
                              <Area type="monotone" dataKey="forecast" name="Forecast (AI)" stroke={palette.forecast} strokeWidth={1.5} strokeDasharray="6 4" fill="none" dot={false} isAnimationActive animationDuration={800} animationEasing="ease-out" connectNulls={false} opacity={0.95}/>
                              <Area type="monotone" dataKey="out" name="Output" stroke={palette.out} strokeWidth={1.7} fill="url(#gOut)" dot={false} isAnimationActive animationDuration={800} animationEasing="ease-out" activeDot={{r:3, fill:palette.out}}/>
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex gap-4 mono text-[10px] mt-3 flex-wrap">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:palette.gen}}/> Actual {Math.round(totalGen)} kW</span>
                          <span className="flex items-center gap-1.5"><span className="w-5 h-[2px] rounded-full" style={{background:palette.forecast, borderTop:`2px dashed ${palette.forecast}`}}/> Forecast {forecastVal!==null? Math.round(forecastVal)+" kW" : "—"} <span className="text-[#666]">AI • RandomForest</span></span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:palette.out}}/> Out {Math.round(totalOut)} kW</span>
                          <span className="ml-auto text-[#555]">{sRef.historyCombined.labels.at(-1)||""}</span>
                        </div>
                      </Card>
                      <Card title="Stacked Inputs — Sources">
                        <div className="h-[240px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stackedData}>
                              <CartesianGrid stroke={gridC} strokeDasharray="3 3" vertical={false}/>
                              <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fill:axisC, fontSize:10, fontFamily:"JetBrains Mono"}} axisLine={false} tickLine={false} width={36}/>
                              <Tooltip content={<Tip/>} cursor={{fill:"#0a0a0a"}}/>
                              <Bar isAnimationActive animationDuration={600} animationEasing="ease-out" dataKey="solar" stackId="a" fill={palette.solar} radius={[4,4,0,0]} />
                              <Bar isAnimationActive animationDuration={600} animationEasing="ease-out" dataKey="wind" stackId="a" fill={palette.wind} />
                              <Bar isAnimationActive animationDuration={600} animationEasing="ease-out" dataKey="hydro" stackId="a" fill={palette.hydro} />
                              <Bar isAnimationActive animationDuration={600} animationEasing="ease-out" dataKey="diesel" stackId="a" fill={palette.diesel} radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex gap-3 mono text-[10px] mt-2">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:palette.solar}}/> <span style={{color:palette.solar}}>Solar</span></span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:palette.wind}}/> <span style={{color:palette.wind}}>Wind</span></span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:palette.hydro}}/> <span style={{color:palette.hydro}}>Hydro</span></span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:palette.diesel}}/> Diesel</span>
                        </div>
                      </Card>
                    </div>
                    <div className="col-span-12 lg:col-span-4 space-y-4">
                      <Card title="System Health">
                        <NotchGauge value={soc} label={`SOC — ${totalStored.toFixed(0)}/${totalCap.toFixed(0)} kWh`} sub={soc<20?"Critical — charging needed":soc>80?"Healthy":"Nominal"}/>
                        <div className="grid grid-cols-3 gap-2 mt-4">
                          <div className="bg-black border border-[#1f1f1f] rounded-lg p-3 text-center"><div className="mono text-[9px] tracking-widest text-[#555]">IMPORT</div><div className="mono text-sm font-semibold">{sRef.grid.importKW.toFixed(1)} kW</div></div>
                          <div className="bg-black border border-[#1f1f1f] rounded-lg p-3 text-center"><div className="mono text-[9px] tracking-widest text-[#555]">EXPORT</div><div className="mono text-sm font-semibold">{sRef.grid.exportKW.toFixed(1)} kW</div></div>
                          <div className="bg-black border border-[#1f1f1f] rounded-lg p-3 text-center"><div className="mono text-[9px] tracking-widest text-[#555]">SHED</div><div className={`mono text-sm font-semibold ${sRef.shedding.active?"text-red-400":""}`}>{sRef.shedding.shedCount}</div></div>
                        </div>
                      </Card>
                      <Card title="Energy Summary">
                        <div className="space-y-2 mono text-xs">
                          <div className="flex justify-between bg-black border border-[#1f1f1f] rounded-lg px-3 py-2"><span className="text-[#666]">Generated</span><span className="font-medium">{sRef.totals.gen_kwh.toFixed(2)} kWh</span></div>
                          <div className="flex justify-between bg-black border border-[#1f1f1f] rounded-lg px-3 py-2"><span className="text-[#666]">Sent / Used</span><span className="font-medium">{sRef.totals.out_kwh.toFixed(2)} kWh</span></div>
                          <div className="flex justify-between bg-black border border-[#1f1f1f] rounded-lg px-3 py-2"><span className="text-[#666]">Saved to Batteries</span><span className="font-medium">{sRef.totals.saved_kwh.toFixed(2)} kWh</span></div>
                          <div className="flex justify-between bg-white text-black rounded-lg px-3 py-2 font-semibold"><span>Capacity</span><span>{totalCap.toFixed(0)} kWh</span></div>
                        </div>
                      </Card>
                      <Card title="Quick Controls">
                        {mode==='real' ? (
                          <div className="mono text-xs text-[#666] border border-dashed border-[#1f1f1f] rounded-xl p-4 text-center">Real mode — simulation controls disabled<br/><span className="text-[#10b981]">0 kW • awaiting hardware</span></div>
                        ) : (
                          <div className="flex gap-2">
                            <motion.button whileHover={{ y:-1, scale:1.01 }} whileTap={{ scale:0.98 }} onClick={()=>{Object.values(sRef.sources).forEach(s=>s.toOutPct=100); setVer(v=>v+1)}} className="flex-1 bg-white text-black mono text-[10px] tracking-widest uppercase font-semibold py-2.5 rounded-full shadow-[0_4px_16px_rgba(255,255,255,0.14)]">All → Output</motion.button>
                            <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.98 }} onClick={()=>{Object.values(sRef.sources).forEach(s=>s.toOutPct=0); setVer(v=>v+1)}} className="flex-1 bg-[#111] border border-[#1f1f1f] mono text-[10px] tracking-widest uppercase font-semibold py-2.5 rounded-full hover:border-[#2a2a2a] hover:bg-[#161616]">All → Battery</motion.button>
                          </div>
                        )}
                        <div className="mt-3 bg-black border border-[#1f1f1f] rounded-lg px-3 py-2 flex justify-between mono text-xs"><span className="text-[#666]">Energy Saved</span><span className="font-semibold">{sRef.totals.saved_kwh.toFixed(2)} kWh</span></div>
                        <div className="mono text-[11px] text-[#666] mt-3 leading-relaxed">Destinations moved to <button onClick={()=>setTab("destinations")} className="text-white underline underline-offset-2">Destinations →</button> • manage incoming / consuming / wasting there.</div>
                      </Card>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-4">
                    <Card title="AI Forecast — Actual vs Predicted (Next tick)" kicker="ML • bklit LiveLine" className="col-span-12 lg:col-span-8">
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={combinedData.slice(-20)}>
                            <CartesianGrid stroke={gridC2} strokeDasharray="4 4" vertical={false}/>
                            <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:axisC, fontSize:10}} axisLine={false} tickLine={false} width={32}/>
                            <Tooltip content={<Tip/>}/>
                            <Line type="monotone" dataKey="gen" name="Actual" stroke={palette.gen} strokeWidth={1.8} dot={{r:2, fill:lineC}} activeDot={{r:3}} isAnimationActive animationDuration={700} animationEasing="ease-out"/>
                            <Line type="monotone" dataKey="forecast" name="AI Forecast" stroke={palette.forecast} strokeWidth={1.5} strokeDasharray="6 4" dot={{r:2, fill:"#000", stroke:"#fff", strokeWidth:1}} isAnimationActive animationDuration={700} animationEasing="ease-out" connectNulls={false}/>
                            <Line type="monotone" dataKey="out" name="Output" stroke={palette.out} strokeWidth={1.2} strokeDasharray="4 4" dot={false} isAnimationActive animationDuration={700} animationEasing="ease-out"/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mono text-[10px] text-[#666] mt-2 flex gap-3">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white"/> Actual</span>
                        <span className="flex items-center gap-1.5"><span className="w-4 h-[2px] bg-white" style={{borderTop:"1.5px dashed white"}}/> Forecast (AI)</span>
                        <span className="ml-auto">{forecastMeta.error ? `fallback • ${forecastMeta.error}` : "backend POST /forecast • RandomForest"}</span>
                      </div>
                    </Card>
                    <Card title="Generation Heatmap" className="col-span-12 lg:col-span-4">
                      <Heatmap data={sRef.historyCombined.gen}/>
                      <div className="mono text-[10px] text-[#555] mt-3">Last {HISTORY} ticks • brighter = higher output</div>
                    </Card>
                  </div>
                </>
              )}

              {tab==="sources" && (
                <div className="grid grid-cols-12 gap-4">
                  {[
                    {k:"solar", label:"Solar Panels", icon:"fa-sun", col:palette.solar, slider:"solarLight", val: sRef.sources.solar.light, unit:"%", field:"light"},
                    {k:"wind", label:"Wind Turbine", icon:"fa-wind", col:palette.wind, slider:"windSpeed", val: sRef.sources.wind.speed, unit:" m/s", field:"speed"},
                    {k:"hydro", label:"Hydro Dam", icon:"fa-water", col:palette.hydro, slider:"hydroFlow", val: sRef.sources.hydro.flow, unit:"%", field:"flow"},
                    {k:"diesel", label:"Backup Diesel", icon:"fa-gas-pump", col:palette.diesel, slider:null, val:null},
                  ].map(src=>{
                    const hist = sRef.sources[src.k].history.map((v,i)=>({t:i, v}))
                    const kw = sRef.sources[src.k].availableKW
                    const pct = sRef.sources[src.k].toOutPct
                    return (
                      <Card key={src.k} title={src.label} kicker={`${kw.toFixed(0)} kW`} className="col-span-12 md:col-span-6 xl:col-span-3">
                        <div className="h-[84px] -mx-1">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={hist}>
                              <defs><linearGradient id={`g-${src.k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={src.col} stopOpacity={0.35}/><stop offset="100%" stopColor={src.col} stopOpacity={0}/></linearGradient></defs>
                              <Area type="monotone" dataKey="v" stroke={src.col} strokeWidth={1.4} fill={`url(#g-${src.k})`} dot={false} isAnimationActive animationDuration={700} animationEasing="ease-out"/>
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mono text-[11px] flex items-center gap-2 mt-2">
                          <i className={`fa-solid ${src.icon} text-[#666]`}/><span className="text-[#666]">Live</span><span className="ml-auto font-semibold">{kw.toFixed(1)} kW</span>
                        </div>
                        {mode==='real' ? (
                          <div className="mt-4 mono text-xs text-[#666] border border-dashed border-[#1f1f1f] rounded-xl p-4 text-center leading-relaxed">Real mode — hardware controlled<br/><span className="text-[#10b981]">0 kW • intensity locked</span><br/><span className="text-[10px] text-[#555]">No sliders — awaiting device</span></div>
                        ) : (
                          <>
                            {src.slider && (
                              <div className="mt-3 space-y-3">
                                <div>
                                  <label className="mono text-[10px] tracking-widest uppercase text-[#666]">{src.k} {src.field}</label>
                                  <input type="range" min="0" max={src.k==="wind"?25:100} value={src.val}
                                    onChange={e=>{
                                      const v=parseInt(e.target.value)
                                      if(src.k==="solar") sRef.sources.solar.light=v
                                      if(src.k==="wind") sRef.sources.wind.speed=v
                                      if(src.k==="hydro") sRef.sources.hydro.flow=v
                                      setVer(vv=>vv+1)
                                    }}
                                    className="w-full accent-white mt-1"/>
                                  <div className="mono text-xs text-white">{src.val}{src.unit}</div>
                                </div>
                                <div>
                                  <label className="mono text-[10px] tracking-widest uppercase text-[#666]">Send to Output</label>
                                  <input type="range" min="0" max="100" value={pct}
                                    onChange={e=>{ sRef.sources[src.k].toOutPct=parseInt(e.target.value); setVer(v=>v+1)}}
                                    className="w-full accent-white mt-1"/>
                                  <div className="mono text-xs">{pct}%</div>
                                </div>
                                <PillToggle
                                  checked={!!(sRef.sources[src.k].enabled ?? sRef.sources[src.k].on)}
                                  onChange={v=>{
                                    if(src.k==="diesel") sRef.sources.diesel.on=v;
                                    else sRef.sources[src.k].enabled=v;
                                    if(!v){
                                      sRef.sources[src.k].availableKW=0;
                                      const h=sRef.sources[src.k].history; h.push(0); if(h.length>HISTORY) h.shift();
                                    }
                                    setVer(x=>x+1)
                                  }}
                                  label={`Enable ${src.label}`}
                                  hint={sRef.sources[src.k].enabled ?? sRef.sources[src.k].on ? "ON • feeding grid" : "OFF • idle"}
                                />
                              </div>
                            )}
                            {src.k==="diesel" && (
                              <div className="mt-3 space-y-3">
                                <PillToggle checked={sRef.sources.diesel.on} onChange={v=>{sRef.sources.diesel.on=v; sRef.sources.diesel.availableKW=v?50:0; if(!v){ const h=sRef.sources.diesel.history; h.push(0); if(h.length>HISTORY) h.shift(); } setVer(x=>x+1)}} label="Enable Diesel" hint={sRef.sources.diesel.on ? "ON • backup active" : "OFF • standby"} />
                                <div>
                                  <label className="mono text-[10px] tracking-widest uppercase text-[#666]">Send to Output</label>
                                  <input type="range" min="0" max="100" value={pct} onChange={e=>{sRef.sources.diesel.toOutPct=parseInt(e.target.value); setVer(v=>v+1)}} className="w-full accent-white mt-1"/>
                                  <div className="mono text-xs">{pct}%</div>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}

              {tab==="destinations" && (
                <>
                  {/* top summary */}
                  <div className="grid grid-cols-12 gap-4">
                    <Card title="System Efficiency" kicker={`${destEfficiency.toFixed(1)}%`} className="col-span-12 lg:col-span-5">
                      <NotchGauge value={destEfficiency} label={`Efficiency — ${destTotalsAgg.consumingKW.toFixed(1)} / ${destTotalsAgg.incomingKW.toFixed(1)} kW`} sub={destEfficiency>85?"Healthy":destEfficiency>60?"Nominal":"Lossy — check wasting"}/>
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        <div className="bg-black border border-[#1f1f1f] rounded-lg p-3 text-center"><div className="mono text-[9px] tracking-widest text-[#555]">INCOMING</div><div className="mono text-sm font-semibold">{destTotalsAgg.incomingKW.toFixed(1)} kW</div><div className="mono text-[10px] text-[#444]">{destTotalsAgg.incoming.toFixed(2)} kWh cum</div></div>
                        <div className="bg-black border border-[#1f1f1f] rounded-lg p-3 text-center"><div className="mono text-[9px] tracking-widest text-emerald-400">CONSUMING</div><div className="mono text-sm font-semibold text-emerald-400">{destTotalsAgg.consumingKW.toFixed(1)} kW</div><div className="mono text-[10px] text-[#444]">{destTotalsAgg.consuming.toFixed(2)} kWh</div></div>
                        <div className="bg-black border border-[#1f1f1f] rounded-lg p-3 text-center"><div className="mono text-[9px] tracking-widest text-amber-400">WASTING</div><div className="mono text-sm font-semibold text-amber-400">{destTotalsAgg.wastingKW.toFixed(1)} kW</div><div className="mono text-[10px] text-[#444]">{destTotalsAgg.wasting.toFixed(2)} kWh</div></div>
                      </div>
                    </Card>
                    <Card title="Destination Trends — Incoming / Consuming / Wasting" kicker="live" className="col-span-12 lg:col-span-7">
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={destTrendData}>
                            <defs>
                              <linearGradient id="gDestInc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity={0.28}/><stop offset="100%" stopColor="#fff" stopOpacity={0}/></linearGradient>
                              <linearGradient id="gDestCon" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.28}/><stop offset="100%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                              <linearGradient id="gDestWst" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28}/><stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                            </defs>
                            <CartesianGrid stroke={gridC2} vertical={false} strokeDasharray="3 3"/>
                            <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:axisC, fontSize:10}} axisLine={false} tickLine={false} width={36}/>
                            <Tooltip content={<Tip/>}/>
                            <Area type="monotone" dataKey="incoming" name="Incoming" stroke="#fff" fill="url(#gDestInc)" strokeWidth={1.6} dot={false}/>
                            <Area type="monotone" dataKey="consuming" name="Consuming" stroke="#10b981" fill="url(#gDestCon)" strokeWidth={1.6} dot={false}/>
                            <Area type="monotone" dataKey="wasting" name="Wasting" stroke="#f59e0b" fill="url(#gDestWst)" strokeWidth={1.6} dot={false}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex gap-4 mono text-[10px] mt-2 text-[#666]">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white"/> Incoming</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"/> Consuming</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"/> Wasting</span>
                      </div>
                    </Card>
                  </div>

                  {/* per-destination cards — mirrors sources layout */}
                  <div className="grid grid-cols-12 gap-4">
                    {filteredDest.map(d=>{
                      const dem=d.demandKW||0
                      const inc=d.incoming||0
                      const con=d.consuming||0
                      const wst=d.wasting||0
                      const eff=(d.efficiency??0.85)*100
                      const chartData = (d.history?.incoming||[]).map((v,i)=>({t:i, incoming:v, consuming:d.history.consuming[i]||0, wasting:d.history.wasting[i]||0}))
                      const shed = d.shedKW>0.1
                      return (
                        <Card key={d.id} title={d.name} kicker={shed?`SHED ${d.shedKW.toFixed(0)} kW`:`${inc.toFixed(0)} kW → ${con.toFixed(0)} kW`} className="col-span-12 md:col-span-6 xl:col-span-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`mono text-[9px] px-2 py-1 rounded-full border font-semibold ${shed?"bg-red-500/10 border-red-500/20 text-red-400":"bg-emerald-500/10 border-emerald-500/20 text-emerald-400"}`}>{shed?"SHED":"OK"}</span>
                            <span className="mono text-[11px] text-[#666]">P{d.priority} • Eff {eff.toFixed(0)}% • Demand {dem} kW</span>
                            <motion.button whileHover={{scale:1.08}} whileTap={{scale:0.94}} onClick={()=> setConfirm({type:"destination", id:d.id, title:`Remove destination "${d.name}"?`, desc:`Demand ${d.demandKW} kW • ${d.incoming.toFixed(1)} kW incoming will be deallocated. This cannot be undone.`})} className="ml-auto w-7 h-7 rounded-lg bg-black border border-[#1f1f1f] flex items-center justify-center text-[#555] hover:text-white"><i className="fa-solid fa-xmark text-[10px]"/></motion.button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="bg-black border border-[#1f1f1f] rounded-lg p-2 text-center"><div className="mono text-[8px] tracking-widest text-[#555]">IN</div><div className="mono text-xs font-semibold">{inc.toFixed(1)} kW</div></div>
                            <div className="bg-black border border-emerald-500/20 rounded-lg p-2 text-center"><div className="mono text-[8px] tracking-widest text-emerald-400">USE</div><div className="mono text-xs font-semibold text-emerald-400">{con.toFixed(1)} kW</div></div>
                            <div className="bg-black border border-amber-500/20 rounded-lg p-2 text-center"><div className="mono text-[8px] tracking-widest text-amber-400">WASTE</div><div className="mono text-xs font-semibold text-amber-400">{wst.toFixed(1)} kW</div></div>
                          </div>
                          <div className="h-[86px] -mx-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={chartData}>
                                <Tooltip content={<Tip/>}/>
                                <Area type="monotone" dataKey="incoming" stroke="#fff" strokeWidth={1.2} fill="rgba(255,255,255,0.08)" dot={false}/>
                                <Area type="monotone" dataKey="consuming" stroke="#10b981" strokeWidth={1.2} fill="rgba(16,185,129,0.12)" dot={false}/>
                                <Area type="monotone" dataKey="wasting" stroke="#f59e0b" strokeWidth={1.2} fill="rgba(245,158,11,0.14)" dot={false}/>
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-3 mt-3">
                            <div>
                              <label className="mono text-[10px] tracking-widest uppercase text-[#666]">Demand (kW)</label>
                              {(() => { const sliderMax = Math.max(500, Math.ceil((dem+500)/100)*100); return (
                                <input type="range" min="0" max={sliderMax} value={Math.min(dem, sliderMax)} onChange={e=>{d.demandKW=parseInt(e.target.value); setVer(v=>v+1)}} className="w-full accent-white mt-1"/>
                              )})()}
                              <div className="mono text-xs text-white flex items-center gap-2">{dem} kW <input type="number" value={dem} onChange={e=>{const v=parseInt(e.target.value)||0; d.demandKW=v; setVer(vv=>vv+1)}} className="ml-auto w-20 bg-black border border-[#1f1f1f] rounded px-2 py-1 mono text-xs outline-none"/> {shed && <span className="text-red-400">• shed {d.shedKW.toFixed(1)} kW</span>}</div>
                            </div>
                            <div>
                              <label className="mono text-[10px] tracking-widest uppercase text-[#666]">Efficiency — Consume % of Incoming</label>
                              <input type="range" min="50" max="98" value={Math.round(eff)} onChange={e=>{d.efficiency=parseInt(e.target.value)/100; setVer(v=>v+1)}} className="w-full accent-white mt-1"/>
                              <div className="mono text-xs flex justify-between"><span>{Math.round(eff)}% consuming</span><span className="text-amber-400">{(100-Math.round(eff))}% waste</span></div>
                            </div>
                            <div>
                              <label className="mono text-[10px] tracking-widest uppercase text-[#666]">Priority</label>
                              <select value={d.priority} onChange={e=>{d.priority=parseInt(e.target.value); setVer(v=>v+1)}} className="w-full bg-black border border-[#1f1f1f] rounded-lg px-2 py-2 mono text-xs outline-none mt-1">
                                <option value={1}>1 — Critical</option><option value={2}>2 — High</option><option value={3}>3 — Normal</option><option value={4}>4 — Low</option>
                              </select>
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                    {filteredDest.length===0 && <div className="col-span-12 mono text-xs text-[#555] py-10 text-center border border-dashed border-[#1f1f1f] rounded-xl">No destinations matching “{search}”</div>}
                  </div>

                  {/* add + analytics row */}
                  <div className="grid grid-cols-12 gap-4">
                    <Card title="Add Destination" kicker="guided" className="col-span-12 lg:col-span-4">
                      <div className="space-y-4">
                        <div>
                          <label className="mono text-[10px] tracking-[0.16em] uppercase text-[#888]">Destination name</label>
                          <div className="relative mt-1.5">
                            <i className="fa-solid fa-location-dot absolute left-3.5 top-1/2 -translate-y-1/2 text-[#333] text-xs"/>
                            <input value={newDst.name} onChange={e=> setNewDst({...newDst, name:e.target.value})} placeholder="Hospital, Data Center, Village…" className="w-full bg-black border border-[#1f1f1f] rounded-full pl-9 pr-3 py-3 mono text-sm outline-none placeholder:text-[#444] focus:border-[#2a2a2a]" />
                          </div>
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {["Hospital","Factory","Village","Grid"].map(p=>(
                              <button key={p} onClick={()=> setNewDst({...newDst, name:p})} className={`mono text-[10px] px-2.5 py-1 rounded-full border transition ${newDst.name===p ? "bg-white text-black border-white" : "bg-black border-[#1f1f1f] text-[#666] hover:border-[#2a2a2a] hover:text-white"}`}>{p}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="mono text-[10px] tracking-[0.16em] uppercase text-[#888]">Demand — kW</label>
                            <span className="mono text-xs font-semibold bg-black border border-[#1f1f1f] rounded-full px-2.5 py-1">{newDst.demand} kW</span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <motion.button whileTap={{scale:0.92}} onClick={()=> setNewDst(d=> ({...d, demand: Math.max(0, d.demand-10)}))} className="w-9 h-9 rounded-full bg-[#111] border border-[#1f1f1f] flex items-center justify-center text-white hover:border-[#2a2a2a]">−</motion.button>
                            <input type="range" min="0" max={Math.max(500, newDst.demand+500)} value={newDst.demand} onChange={e=> setNewDst({...newDst, demand: parseInt(e.target.value)||0})} className="flex-1 accent-white"/>
                            <motion.button whileTap={{scale:0.92}} onClick={()=> setNewDst(d=> ({...d, demand: d.demand+10}))} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center font-bold hover:bg-zinc-100">+</motion.button>
                          </div>
                          <div className="relative mt-2">
                            <input type="number" value={newDst.demand} onChange={e=> setNewDst({...newDst, demand: parseInt(e.target.value)||0})} className="w-full bg-black border border-[#1f1f1f] rounded-full px-4 py-2.5 mono text-sm outline-none focus:border-[#2a2a2a]" placeholder="80" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 mono text-[10px] text-[#555]">kW</span>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between mono text-[10px] tracking-[0.16em] uppercase text-[#888]">
                            <span>Efficiency — consuming</span><span className="text-white font-semibold">{newDst.eff}%</span>
                          </div>
                          <input type="range" min="50" max="98" value={newDst.eff} onChange={e=> setNewDst({...newDst, eff: parseInt(e.target.value)})} className="w-full accent-white mt-2"/>
                          <div className="h-2.5 rounded-full overflow-hidden flex mt-2 border border-[#1f1f1f]">
                            <div style={{width:`${newDst.eff}%`}} className="bg-[#10b981] transition-all" />
                            <div style={{width:`${100-newDst.eff}%`}} className="bg-[#f59e0b] transition-all" />
                          </div>
                          <div className="flex justify-between mono text-[10px] mt-1.5"><span className="text-[#10b981]">{Math.round(newDst.demand*newDst.eff/100)} kW use</span><span className="text-[#f59e0b]">{Math.round(newDst.demand*(100-newDst.eff)/100)} kW waste</span></div>
                        </div>
                        <div>
                          <label className="mono text-[10px] tracking-[0.16em] uppercase text-[#888]">Priority</label>
                          <div className="grid grid-cols-4 gap-1.5 mt-2">
                            {[{v:1,l:"Critical"},{v:2,l:"High"},{v:3,l:"Normal"},{v:4,l:"Low"}].map(p=>(
                              <button key={p.v} onClick={()=> setNewDst({...newDst, priority:p.v})} className={`mono text-[11px] py-2.5 rounded-full border font-medium transition ${newDst.priority===p.v ? "bg-white text-black border-white shadow" : "bg-black border-[#1f1f1f] text-[#888] hover:border-[#2a2a2a] hover:text-white"}`}>{p.v} • {p.l}</button>
                            ))}
                          </div>
                        </div>
                        <motion.button whileHover={{y:-1}} whileTap={{scale:0.98}} onClick={()=>{
                          const n=newDst.name.trim() || `Dest ${sRef.destinations.length+1}`;
                          const eff=Math.max(0.5,Math.min(0.98,newDst.eff/100));
                          sRef.destinations.push({id:uid("dst"), name:n, priority:newDst.priority, demandKW:newDst.demand, lastRecvKW:0, shedKW:0, efficiency:eff, incoming:0, consuming:0, wasting:0, history:{incoming:[], consuming:[], wasting:[]}, totals:{incoming_kwh:0, consuming_kwh:0, wasting_kwh:0}});
                          setVer(v=>v+1); setNewDst({name:"", demand:80, eff:85, priority:2});
                        }} className="w-full bg-white text-black mono text-xs font-semibold tracking-widest uppercase py-3.5 rounded-full shadow-[0_8px_24px_rgba(255,255,255,0.14)] hover:bg-zinc-100 transition">+ Add Destination</motion.button>
                        <div className="mono text-[10px] text-[#555] text-center leading-relaxed">Will request <span className="text-white">{newDst.demand}kW</span> at <span className="text-white">P{newDst.priority}</span> • {newDst.eff}% efficient</div>
                      </div>
                    </Card>
                    <Card title="Consuming Share — By Destination (kWh cum)" className="col-span-12 lg:col-span-4">
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={destConsumePie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} stroke="none">
                              {destConsumePie.map((_,i)=><Cell key={i} fill={palette.pie[i%4]}/>)}
                            </Pie>
                            <Tooltip content={<Tip/>}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 mono text-xs">
                        {destConsumePie.map((d,i)=><div key={d.name} className="flex items-center gap-2 bg-black border border-[#1f1f1f] rounded-lg px-2 py-1.5"><span className="w-2 h-2 rounded-full" style={{background:palette.pie[i%4]}}/> {d.name} <span className="ml-auto font-semibold">{d.value.toFixed(1)} kWh</span></div>)}
                        {destConsumePie.length===0 && <div className="text-[#555] py-4 text-center">No consumption yet</div>}
                      </div>
                    </Card>
                    <Card title="Wasting vs Consuming — Per Destination (Live kW)" className="col-span-12 lg:col-span-4">
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={destWasteData}>
                            <CartesianGrid stroke={gridC2} vertical={false} strokeDasharray="3 3"/>
                            <XAxis dataKey="name" tick={{fill:axisC, fontSize:10, fontFamily:"JetBrains Mono"}} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={36}/>
                            <YAxis tick={{fill:axisC, fontSize:10}} axisLine={false} tickLine={false} width={32}/>
                            <Tooltip content={<Tip/>} cursor={{fill:"#0a0a0a"}}/>
                            <Bar dataKey="consuming" name="Consuming" stackId="a" fill="#10b981" radius={[0,0,0,0]} barSize={18}/>
                            <Bar dataKey="waste" name="Wasting" stackId="a" fill="#f59e0b" radius={[6,6,0,0]} barSize={18}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </div>
                  <Card title="Destination Leaderboard — Efficiency">
                    <div className="overflow-auto">
                      <table className="w-full mono text-xs">
                        <thead><tr className="text-[#555] text-[10px] tracking-widest uppercase border-b border-[#1f1f1f]"><th className="text-left py-2 px-2">Destination</th><th className="text-right px-2">Incoming</th><th className="text-right px-2">Consuming</th><th className="text-right px-2">Wasting</th><th className="text-right px-2">Eff</th><th className="text-right px-2">Status</th></tr></thead>
                        <tbody>
                          {[...sRef.destinations].sort((a,b)=>(b.efficiency||0)-(a.efficiency||0)).map(d=>(
                            <tr key={d.id} className="border-b border-[#111]">
                              <td className="py-2 px-2 font-medium text-white">{d.name}</td>
                              <td className="text-right px-2">{(d.incoming||0).toFixed(1)} kW</td>
                              <td className="text-right px-2 text-emerald-400">{(d.consuming||0).toFixed(1)} kW</td>
                              <td className="text-right px-2 text-amber-400">{(d.wasting||0).toFixed(1)} kW</td>
                              <td className="text-right px-2">{Math.round((d.efficiency||0)*100)}%</td>
                              <td className="text-right px-2"><span className={`px-2 py-0.5 rounded-full border text-[10px] ${d.shedKW>0.1?"border-red-500/30 text-red-400 bg-red-500/10":"border-emerald-500/30 text-emerald-400 bg-emerald-500/10"}`}>{d.shedKW>0.1?`SHED ${d.shedKW.toFixed(0)}`:"OK"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}

              {tab==="grid" && (
                <>
                  <div className="grid grid-cols-12 gap-4">
                    <Card title="GRID" kicker={sRef.grid.mode.toUpperCase()} className="col-span-12 md:col-span-6">
                      <select value={sRef.grid.mode} onChange={e=>{sRef.grid.mode=e.target.value; setVer(v=>v+1)}} className="w-full bg-black border border-[#1f1f1f] rounded-lg px-3 py-2.5 mono text-sm outline-none">
                        <option value="grid">GRID-CONNECTED</option><option value="island">ISLANDED</option><option value="hybrid">HYBRID</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="bg-black border border-[#1f1f1f] rounded-xl p-3 text-center"><div className="mono text-[9px] tracking-widest text-[#555]">IMPORT</div><div className="mono text-sm font-semibold">{sRef.grid.importKW.toFixed(1)} kW</div></div>
                        <div className="bg-black border border-emerald-500/20 rounded-xl p-3 text-center"><div className="mono text-[9px] tracking-widest text-emerald-500">EXPORT</div><div className="mono text-sm font-semibold text-emerald-500">{sRef.grid.exportKW.toFixed(1)} kW</div></div>
                      </div>
                      <div className="mono text-[10px] text-[#666] mt-3">Hybrid topbar toggle for quick excess → battery</div>
                    </Card>
                    <Card title="Hybrid — Topbar" className="col-span-12 md:col-span-6 border-emerald-500/20">
                      <p className="mono text-[11px] text-[#666] mb-3">Use topbar Hybrid ON/OFF. Excess output charges battery while destinations run.</p>
                      <div className="mono text-xs flex gap-2 flex-wrap">
                        <span className="bg-black border border-[#1f1f1f] rounded-full px-2 py-1">Gen {totalGen.toFixed(0)} kW</span>
                        <span className="bg-black border border-[#1f1f1f] rounded-full px-2 py-1">Out {totalOut.toFixed(0)} kW</span>
                        <span className="bg-black border border-emerald-500/20 rounded-full px-2 py-1 text-emerald-400">Bat {totalStored.toFixed(0)} kWh</span>
                      </div>
                      <div className="mono text-[10px] text-[#666] mt-3">Slider in <span className="text-white">Settings → Power & Routing</span></div>
                    </Card>
                  </div>
                </>
              )}

              {tab==="storage" && (
                <>
                  <div className="grid grid-cols-12 gap-4">
                    {sRef.batteries.map(b=>{
                      const pct=(b.stored_kwh/b.capacity_kwh)*100
                      return (
                        <Card key={b.id} title={`Battery ${b.id.slice(-4)}`} kicker={`${pct.toFixed(0)}%`} className="col-span-12 md:col-span-6 xl:col-span-4">
                          <div className="mono text-xs text-[#666]">Capacity {b.capacity_kwh} kWh • Stored {b.stored_kwh.toFixed(1)} kWh</div>
                          <div className="text-xs text-[#555] mt-1">{b.maxChargeKW} kW charge • {b.maxDischargeKW} kW discharge</div>
                          <div className="mt-4"><NotchGauge value={pct} label={`${b.stored_kwh.toFixed(0)} kWh`} sub={`${b.capacity_kwh} kWh capacity`}/></div>
                          <div className="w-full h-2 bg-black border border-[#1f1f1f] rounded-full overflow-hidden mt-4">
                            <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.6}} className="h-full bg-white"/>
                          </div>
                          <motion.button whileHover={{y:-1}} whileTap={{scale:0.98}} onClick={()=> setConfirm({type:"battery", id:b.id, title:`Remove battery ${b.id.slice(-4)}?`, desc:`${b.capacity_kwh} kWh • ${b.stored_kwh.toFixed(1)} kWh stored will be lost. This cannot be undone.`})} className="w-full mt-3 bg-[#111] border border-[#1f1f1f] mono text-[10px] tracking-widest uppercase py-2 rounded-full hover:border-[#333]">Remove</motion.button>
                        </Card>
                      )
                    })}
                  </div>
                  <Card title="Add Battery">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div><label className="mono text-[10px] uppercase tracking-widest text-[#666]">Capacity (kWh)</label><input id="cap" defaultValue={500} type="number" className="mt-1 w-full bg-black border border-[#1f1f1f] rounded-lg px-3 py-2 mono text-sm outline-none"/></div>
                      <div><label className="mono text-[10px] uppercase tracking-widest text-[#666]">Charge Rate (kW)</label><input id="cr" defaultValue={200} type="number" className="mt-1 w-full bg-black border border-[#1f1f1f] rounded-lg px-3 py-2 mono text-sm outline-none"/></div>
                      <div><label className="mono text-[10px] uppercase tracking-widest text-[#666]">Discharge Rate (kW)</label><input id="dr" defaultValue={200} type="number" className="mt-1 w-full bg-black border border-[#1f1f1f] rounded-lg px-3 py-2 mono text-sm outline-none"/></div>
                      <div className="flex items-end"><button onClick={()=>{
                        const cap=parseFloat(document.getElementById("cap").value)||500
                        const cr=parseFloat(document.getElementById("cr").value)||200
                        const dr=parseFloat(document.getElementById("dr").value)||200
                        sRef.batteries.push({id:uid("bat"), capacity_kwh:cap, stored_kwh:0, maxChargeKW:cr, maxDischargeKW:dr}); setVer(v=>v+1)
                      }} className="w-full bg-white text-black mono text-xs font-semibold tracking-widest uppercase py-2.5 rounded-lg">Add Battery</button></div>
                    </div>
                  </Card>
                  <Card title="Storage Trend — LiveLine (bklit)">
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={batteryTrend}>
                          <defs><linearGradient id="gBat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={palette.out} stopOpacity={0.35}/><stop offset="100%" stopColor={palette.out} stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid stroke={gridC2} vertical={false} strokeDasharray="3 3"/>
                          <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fill:axisC, fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                          <Tooltip content={<Tip/>}/>
                          <Area type="monotone" dataKey="stored" name="Stored kWh" stroke={palette.out} fill="url(#gBat)" strokeWidth={1.6} dot={false} isAnimationActive animationDuration={800} animationEasing="ease-out" activeDot={{r:3, fill:palette.out}}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </>
              )}

              {tab==="analytics" && (
                <>
                  <div className="grid grid-cols-12 gap-4">
                    <Card title="Source Contribution (kWh)" className="col-span-12 lg:col-span-4">
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} stroke="none">
                              {pieData.map((_,i)=><Cell key={i} fill={palette.pie[i%4]} />)}
                            </Pie>
                            <Tooltip content={<Tip/>}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mono text-xs">
                        {pieData.map((d,i)=><div key={d.name} className="flex items-center gap-2 bg-black border border-[#1f1f1f] rounded-lg px-2 py-1.5"><span className="w-2 h-2 rounded-full" style={{background:palette.pie[i%4]}}/> {d.name} <span className="ml-auto font-semibold">{d.value.toFixed(0)}</span></div>)}
                      </div>
                    </Card>
                    <Card title="Generation Trend — Actual vs AI Forecast" className="col-span-12 lg:col-span-4">
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={combinedData}>
                            <CartesianGrid stroke={gridC2} vertical={false} strokeDasharray="3 3"/>
                            <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:axisC, fontSize:10}} axisLine={false} tickLine={false} width={36}/>
                            <Tooltip content={<Tip/>}/>
                            <Line type="monotone" dataKey="gen" name="Actual" stroke={palette.gen} strokeWidth={1.6} dot={false} isAnimationActive animationDuration={700} animationEasing="ease-out"/>
                            <Line type="monotone" dataKey="forecast" name="AI Forecast" stroke={palette.forecast} strokeWidth={1.4} strokeDasharray="6 4" dot={false} isAnimationActive animationDuration={700} animationEasing="ease-out" connectNulls={false}/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mono text-[10px] mt-2 flex gap-2"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:palette.gen}}/> Actual</span><span className="flex items-center gap-1"><span className="w-3 h-[2px] rounded-full" style={{background:palette.forecast, borderTop:`1.5px dashed ${palette.forecast}`}}/> Forecast</span></div>
                    </Card>
                    <Card title="Battery Storage Trend" className="col-span-12 lg:col-span-4">
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={batteryTrend}>
                            <defs><linearGradient id="gBat2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={palette.out} stopOpacity={0.3}/><stop offset="100%" stopColor={palette.out} stopOpacity={0}/></linearGradient></defs>
                            <CartesianGrid stroke={gridC2} vertical={false} strokeDasharray="3 3"/>
                            <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:axisC, fontSize:10}} axisLine={false} tickLine={false} width={36}/>
                            <Tooltip content={<Tip/>}/>
                            <Area type="monotone" dataKey="stored" stroke={palette.out} fill="url(#gBat2)" strokeWidth={1.6} dot={false} isAnimationActive animationDuration={800} animationEasing="ease-out"/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </div>
                  <div className="grid grid-cols-12 gap-4">
                    <Card title="Destination Consumption (kW)" className="col-span-12 lg:col-span-7">
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sRef.destinations.map(d=>({name:d.name, kw:d.lastRecvKW}))}>
                            <CartesianGrid stroke={gridC2} vertical={false} strokeDasharray="3 3"/>
                            <XAxis dataKey="name" tick={{fill:axisC, fontSize:11, fontFamily:"JetBrains Mono"}} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:axisC, fontSize:10}} axisLine={false} tickLine={false} width={32}/>
                            <Tooltip content={<Tip/>} cursor={{fill:"#0a0a0a"}}/>
                            <Bar isAnimationActive animationDuration={600} animationEasing="ease-out" dataKey="kw" fill={palette.barDest} radius={[6,6,0,0]} barSize={28}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                    <Card title="Forecast — AI Grid (Next tick)" kicker="ML" className="col-span-12 lg:col-span-5">
                      <div className="space-y-3">
                        <div className="bg-white text-black rounded-xl p-4 flex justify-between items-center">
                          <span className="mono text-xs tracking-widest uppercase">AI Forecast Gen</span><span className="mono text-xl font-bold">{forecastVal!==null ? forecastVal.toFixed(1) : "—"} kW</span>
                        </div>
                        <div className="bg-black border border-[#1f1f1f] rounded-xl p-4 flex justify-between items-center">
                          <span className="mono text-xs text-[#666]">Actual Now</span><span className="mono text-lg font-semibold">{(combinedData.at(-1)?.gen || 0).toFixed(1)} kW</span>
                        </div>
                        <div className="bg-black border border-[#1f1f1f] rounded-xl p-4 flex justify-between items-center">
                          <span className="mono text-xs text-[#666]">Forecast Battery</span><span className="mono text-lg font-semibold">{totalStored.toFixed(0)} kWh</span>
                        </div>
                        <div className="mono text-[11px] text-[#555] leading-relaxed">Model: <span className="text-white">RandomForestRegressor</span> • inputs solar/wind/hydro + SOC → <span className="text-white">POST /forecast</span> • dashed white = AI prediction for next 2s tick. {forecastMeta.error && <span className="text-amber-400">fallback active</span>}</div>
                        <div className="h-[120px] -mx-1">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={combinedData.slice(-16)}>
                              <CartesianGrid stroke={gridC2} vertical={false} strokeDasharray="3 3"/>
                              <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fill:axisC, fontSize:9}} axisLine={false} tickLine={false} width={34}/>
                              <Tooltip content={<Tip/>}/>
                              <Line type="monotone" dataKey="gen" name="Actual" stroke={palette.gen} strokeWidth={1.6} dot={false} isAnimationActive animationDuration={700} animationEasing="ease-out"/>
                              <Line type="monotone" dataKey="forecast" name="Forecast" stroke={lineC} strokeWidth={1.4} strokeDasharray="6 4" dot={{r:2, fill:"#000", stroke:"#fff"}} connectNulls={false}/>
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <Heatmap data={sRef.historyBattery}/>
                      </div>
                    </Card>
                  </div>
                </>
              )}

              {tab==="settings" && (
                <div className="space-y-5">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div>
                      <h2 className="text-[22px] font-bold tracking-tight flex items-center gap-3"><span className="w-8 h-8 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-center text-[#888] text-sm"><i className="fa-solid fa-sliders"/></span> Settings</h2>
                      <p className="mono text-[11px] text-[#666] mt-1 max-w-[520px]">Tune simulation, power routing and appearance. Changes apply live to both <span className="text-white">Real & Simulation</span>.</p>
                    </div>
                    <div className="flex items-center gap-2 mono text-[10px]">
                      <span className="flex items-center gap-1.5 border border-[#1f1f1f] bg-[#0a0a0a] rounded-full px-3 py-1.5 text-[#888]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"/> Live</span>
                      <span className="text-[#333]">Hybrid in topbar • ON/OFF</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* 01 Appearance */}
                    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f1f1f] bg-white/[0.02]">
                        <div className="w-9 h-9 rounded-xl bg-black border border-[#1f1f1f] flex items-center justify-center text-[#888]"><i className="fa-solid fa-palette"/></div>
                        <div className="flex-1">
                          <div className="mono text-[11px] tracking-[0.12em] uppercase font-bold">Appearance</div>
                          <div className="mono text-[10px] text-[#666]">Theme & display — light / dark</div>
                        </div>
                        <span className="mono text-[9px] tracking-[0.12em] uppercase text-[#333] border border-[#1f1f1f] rounded-full px-2 py-1">01</span>
                      </div>
                      <div className="p-4 grid grid-cols-12 gap-4">
                        <Card title="Theme" className="col-span-12 md:col-span-6">
                          <div className="flex items-center justify-between bg-black border border-[#1f1f1f] rounded-xl p-3">
                            <span className="mono text-xs">Theme</span>
                            <button onClick={()=>setTheme(theme==="dark"?"light":"dark")} className={`relative w-[56px] h-[28px] rounded-full p-1 transition ${theme==="light"?"bg-white":"bg-[#1a1a1a] border border-[#2a2a2a]"}`}>
                              <span className={`absolute top-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all ${theme==="light"?"left-7 bg-black text-white":"left-1 bg-white text-black"}`}><i className={`fa-solid ${theme==="light"?"fa-sun":"fa-moon"}`}/></span>
                            </button>
                          </div>
                          <div className="mono text-[10px] text-[#666] mt-2">{theme==="dark"?"ElevenLabs dark — true black":"Light — warm paper"}</div>
                        </Card>
                        <Card title="Dashboard Mode" kicker={mode==='real' ? "REAL" : "SIM"} className="col-span-12 md:col-span-6">
                          <div className={`flex items-center gap-3 px-4 py-3 rounded-full border ${mode==='real' ? "bg-[#0f1a14] border-[#10b981]/30" : "bg-black border-[#1f1f1f]"}`}>
                            <span className={`w-2.5 h-2.5 rounded-full ${mode==='real' ? "bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-white animate-pulse"}`}/>
                            <span className={`mono text-xs font-semibold tracking-widest uppercase ${mode==='real' ? "text-[#10b981]" : "text-white"}`}>{mode==='real' ? "REAL — hardware" : "SIMULATION — synthetic"}</span>
                            <span className="ml-auto mono text-[10px] text-[#666]">locked at login</span>
                          </div>
                          <div className="mono text-[10px] text-[#666] mt-2">{mode==='real' ? "0 kW, intensity locked" : "Sliders & forecast active"}</div>
                        </Card>
                      </div>
                    </div>

                    {/* 02 Simulation */}
                    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f1f1f] bg-white/[0.02]">
                        <div className="w-9 h-9 rounded-xl bg-black border border-[#1f1f1f] flex items-center justify-center text-[#888]"><i className="fa-solid fa-flask"/></div>
                        <div className="flex-1">
                          <div className="mono text-[11px] tracking-[0.12em] uppercase font-bold">Simulation</div>
                          <div className="mono text-[10px] text-[#666]">Speed, presets — synthetic generation</div>
                        </div>
                        <span className="mono text-[9px] tracking-[0.12em] uppercase text-[#333] border border-[#1f1f1f] rounded-full px-2 py-1">02</span>
                      </div>
                      <div className="p-4 grid grid-cols-12 gap-4">
                        <Card title="Simulation Speed" className="col-span-12 md:col-span-6">
                          <div className="grid grid-cols-4 gap-2">
                            {[1,2,5,10].map(s=>(
                              <button key={s} onClick={()=>setSpeed(s)} className={`mono text-xs py-2.5 rounded-lg border font-semibold ${speed===s?"bg-white text-black border-white":"bg-black border-[#1f1f1f] text-[#888] hover:border-[#333] hover:text-white"}`}>{s}x</button>
                            ))}
                          </div>
                          <div className="mono text-[10px] text-[#666] mt-2">Scale time for faster demo</div>
                        </Card>
                        <Card title="Demo Presets" className="col-span-12 md:col-span-6">
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              {id:"sunny", label:"Sunny Day", icon:"fa-sun"},
                              {id:"windy", label:"High Wind", icon:"fa-wind"},
                              {id:"hydro", label:"Hydro", icon:"fa-water"},
                              {id:"diesel", label:"Diesel", icon:"fa-gas-pump"},
                            ].map(p=>(
                              <button key={p.id} onClick={()=>{
                                const s=sRef.sources
                                if(p.id==="sunny"){ s.solar.light=100; s.wind.speed=5; s.hydro.flow=40; s.diesel.on=false }
                                if(p.id==="windy"){ s.solar.light=30; s.wind.speed=18; s.hydro.flow=50; s.diesel.on=false }
                                if(p.id==="hydro"){ s.solar.light=40; s.wind.speed=8; s.hydro.flow=100; s.diesel.on=false }
                                if(p.id==="diesel"){ s.solar.light=0; s.wind.speed=0; s.hydro.flow=0; s.diesel.on=true }
                                setVer(v=>v+1)
                              }} className="bg-black border border-[#1f1f1f] mono text-xs py-3 rounded-lg hover:border-[#333] hover:bg-[#0a0a0a] transition flex items-center justify-center gap-2"><i className={`fa-solid ${p.icon} text-[#666]`}/>{p.label}</button>
                            ))}
                          </div>
                        </Card>
                      </div>
                    </div>

                    {/* 03 Power & Routing */}
                    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f1f1f] bg-white/[0.02]">
                        <div className="w-9 h-9 rounded-xl bg-black border border-[#1f1f1f] flex items-center justify-center text-emerald-500"><i className="fa-solid fa-bolt"/></div>
                        <div className="flex-1">
                          <div className="mono text-[11px] tracking-[0.12em] uppercase font-bold">Power & Routing</div>
                          <div className="mono text-[10px] text-[#666]">Grid, hybrid & flows</div>
                        </div>
                        <span className="mono text-[9px] tracking-[0.12em] uppercase text-[#333] border border-[#1f1f1f] rounded-full px-2 py-1">03</span>
                      </div>
                      <div className="p-4 grid grid-cols-12 gap-4">
                        <Card title="Grid Mode" className="col-span-12 md:col-span-6">
                          <select value={sRef.grid.mode} onChange={e=>{sRef.grid.mode=e.target.value; setVer(v=>v+1)}} className="w-full bg-black border border-[#1f1f1f] rounded-lg px-3 py-2.5 mono text-sm outline-none">
                            <option value="grid">GRID-CONNECTED</option><option value="island">ISLANDED</option><option value="hybrid">HYBRID</option>
                          </select>
                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <div className="bg-black border border-[#1f1f1f] rounded-xl p-3 text-center"><div className="mono text-[9px] tracking-widest text-[#555]">IMPORT</div><div className="mono text-sm font-semibold">{sRef.grid.importKW.toFixed(1)} kW</div></div>
                            <div className="bg-black border border-emerald-500/20 rounded-xl p-3 text-center"><div className="mono text-[9px] tracking-widest text-emerald-500">EXPORT</div><div className="mono text-sm font-semibold text-emerald-500">{sRef.grid.exportKW.toFixed(1)} kW</div></div>
                          </div>
                        </Card>
                        <Card title="Hybrid Charge — Battery + Output" kicker={sRef.hybrid.enabled ? "ON" : "OFF"} className="col-span-12 md:col-span-6 border-emerald-500/20">
                          <p className="mono text-[11px] text-[#666] mb-3">When output &gt; demand, charge battery from excess while destinations run.</p>
                          <PillToggle checked={!!sRef.hybrid.enabled} onChange={v=>{sRef.hybrid.enabled=v; setVer(x=>x+1)}} label="Hybrid Mode" hint={sRef.hybrid.enabled ? "ON • excess → battery" : "OFF • output only"} />
                          {sRef.hybrid.enabled && (
                            <div className="mt-3">
                              <label className="mono text-[10px] tracking-widest uppercase text-[#666]">Excess to Battery — controllable</label>
                              <input type="range" min="0" max="100" value={sRef.hybrid.chargePct} onChange={e=>{sRef.hybrid.chargePct=parseInt(e.target.value); setVer(x=>x+1)}} className="w-full accent-white mt-2" />
                              <div className="flex justify-between mono text-[10px] mt-1"><span className="text-[#666]">0% → grid</span><span className="text-white font-bold">{sRef.hybrid.chargePct}%</span><span className="text-emerald-400">100% → batt</span></div>
                              <div className="mono text-[10px] text-[#555] mt-2">Works in <span className="text-white">both Real & Simulation</span> • Topbar toggle for quick access</div>
                            </div>
                          )}
                          <div className="mono text-[10px] text-[#666] mt-3 flex gap-2 flex-wrap"><span className="bg-black border border-[#1f1f1f] rounded-full px-2 py-1">Gen {totalGen.toFixed(0)} kW</span><span className="bg-black border border-emerald-500/20 rounded-full px-2 py-1 text-emerald-400">Bat {totalStored.toFixed(0)} kWh</span></div>
                        </Card>
                      </div>
                    </div>

                    {/* 04 System */}
                    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f1f1f] bg-white/[0.02]">
                        <div className="w-9 h-9 rounded-xl bg-black border border-[#1f1f1f] flex items-center justify-center text-red-400"><i className="fa-solid fa-rotate"/></div>
                        <div className="flex-1">
                          <div className="mono text-[11px] tracking-[0.12em] uppercase font-bold">System</div>
                          <div className="mono text-[10px] text-[#666]">Reset & maintenance</div>
                        </div>
                        <span className="mono text-[9px] tracking-[0.12em] uppercase text-[#333] border border-[#1f1f1f] rounded-full px-2 py-1">04</span>
                      </div>
                      <div className="p-4 grid grid-cols-12 gap-4">
                        <Card title="Reset Options" className="col-span-12">
                          <div className="grid grid-cols-3 gap-2">
                            <button onClick={()=>{sRef.batteries.forEach(b=>b.stored_kwh=0); setVer(v=>v+1)}} className="bg-[#111] border border-[#1f1f1f] mono text-[10px] tracking-widest uppercase py-3 rounded-lg hover:border-[#333]">Reset Batteries</button>
                            <button onClick={()=>{sRef.destinations=[]; setVer(v=>v+1)}} className="bg-[#111] border border-[#1f1f1f] mono text-[10px] tracking-widest uppercase py-3 rounded-lg hover:border-[#333]">Reset Dests</button>
                            <button onClick={()=>{sRef.totals.gen_kwh=0; sRef.totals.out_kwh=0; sRef.totals.saved_kwh=0; sRef.batteries.forEach(b=>b.stored_kwh=0); setVer(v=>v+1)}} className="bg-white text-black mono text-[10px] tracking-widest uppercase py-3 rounded-lg font-bold shadow">Reset All</button>
                          </div>
                          <div className="mono text-[10px] text-[#666] mt-2">Does not affect topbar Hybrid toggle</div>
                        </Card>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>
        <ConfirmModal
          open={!!confirm}
          title={confirm?.title}
          desc={confirm?.desc}
          confirmLabel={confirm?.type==="battery" ? "Remove Battery" : "Remove Destination"}
          onCancel={()=> setConfirm(null)}
          onConfirm={()=>{
            if(confirm?.type==="battery"){ sRef.batteries=sRef.batteries.filter(x=>x.id!==confirm.id) }
            if(confirm?.type==="destination"){ sRef.destinations=sRef.destinations.filter(x=>x.id!==confirm.id) }
            setConfirm(null); setVer(v=>v+1)
          }}
        />
      </AnimatePresence>
    </div>
  )
}
