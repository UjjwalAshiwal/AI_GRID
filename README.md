# 🌱 Renewable Energy Management Dashboard — AI_GRID

Full-stack renewable energy management system with **Real & Simulation** modes, **Hybrid Charge**, **GRID** routing, **Viewer view-only**, live Chart.js/Recharts dashboards and ML forecasting (Random Forest).

> **Live modes:** Login → pick **Simulation** (synthetic generation, sliders & forecast) or **Real** (0 kW static, hardware-ready). Both share the same dashboard, linked from login. Hybrid works in both.

---

## ✨ What’s new in this build

- **Real vs Simulation** — `dashboardMode` in `localStorage`, badge `SIMULATION/REAL`, banner in Real, static `0` line (no drop animation when switching)
- **Hybrid Charge (topbar)** — `Hybrid ON/OFF` in topbar (replaces search) + full slider in `Settings → Power & Routing`. When `output > demand`, excess `→ battery` while destinations keep running. Controllable `Excess to Battery %` (0%→grid, 100%→battery), works in Real & Simulation
- **GRID nav** — new sidebar tab `GRID` (`fa-network-wired`) with `GRID-CONNECTED / ISLANDED / HYBRID` + Import/Export + Hybrid hint. Dashboard stays clean (Hybrid not in cards)
- **Viewer view-only** — `viewer/viewer123` can view all tabs/charts in both modes but cannot change sliders, buttons, selects, hybrid or grid (topbar + `main` disabled, banner `View Only`)
- **Rebuilt Settings** — 4 sections `01 Appearance | 02 Simulation | 03 Power & Routing | 04 System` with icons, `Live` pill, grouped cards
- **Backend fix** — `simulation.py` handles `wind 0–25 m/s` (rated 12³) vs legacy `%`, fallback to local `simulation.js` if Flask down, CORS `*`
- **Charts** — `Chart.js` (frontend) + `Recharts` (web) with correct `wind 296kW @ 8m/s`, no `forecastGenKW` crash

---

## 📂 Project structure

```
AI_GRID/
├── backend/
│   ├── app.py              # Flask: /simulate, /health, /forecast
│   ├── simulation.py       # solar/wind/hydro physics (m/s aware)
│   ├── forecast.py         # joblib model
│   └── ml/
│       ├── generate_data.py
│       ├── train.py
│       ├── training_data.csv
│       └── model.pkl
├── frontend/               # Vanilla HTML/CSS/JS + Chart.js (main dashboard)
│   ├── index.html          # Login (Simulation/Real toggle)
│   ├── dashboard.html      # App (topbar Hybrid, GRID nav)
│   ├── login.html
│   ├── css/style.css
│   └── js/
│       ├── app.js
│       ├── auth.js
│       ├── main.js         # tick, hybrid, grid, viewer, charts
│       └── simulation.js
└── web/                    # Vite + React + Recharts (ElevenLabs edition)
    ├── src/App.jsx         # same logic, Tailwind, Framer Motion
    └── dist/               # built (ignored in git, run npm run build)
```

---

## 🔐 Roles & Login

- `admin / admin123` — full control
- `viewer / viewer123` — **view-only** (both Real & Simulation) — all controls disabled, banner shown, charts visible

Pick **Dashboard type** on login: `Simulation` (sliders live) or `Real` (0 kW, intensity locked, hybrid still toggleable but 0).

---

## ⚡ Hybrid Charge — how it works

- **Without hybrid:** `battery ← genSurplus (totalGen - totalOut)` via `toOutPct`
- **With hybrid ON:** `battery ← genSurplus + hybridExcess` where `hybridExcess = remaining (totalOut - totalSupplied) * chargePct` — destinations get priority, excess charges battery without shifting all sources to battery
- **Control:** Topbar `Hybrid ON/OFF` (quick), `Settings → Power → Hybrid → Excess to Battery %` slider controls split
- **Grid export** auto-reduced: `export = remaining - hybridExcess + leftover`

---

## 🚀 Run locally

### 1. Clone

```bash
git clone https://github.com/UjjwalAshiwal/AI_GRID.git
cd AI_GRID
# old main is saved as branch backup-main-old
# new build is on feature/new-dashboard
git checkout feature/new-dashboard
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
python ml/generate_data.py   # one-time
python ml/train.py           # → ml/model.pkl
python app.py
# → ✅ ML model loaded — http://127.0.0.1:5000
# /health, /simulate, /forecast (CORS *)
```

### 3. Frontend (vanilla)

```bash
# serve frontend
python -m http.server 8001 --directory frontend
# → http://127.0.0.1:8001/index.html → dashboard.html
# or open frontend/index.html directly (Chart.js CDN required)
```

### 4. Web (Vite)

```bash
cd web
npm install
npm run dev    # → http://localhost:5173
npm run build  # → web/dist
python -m http.server 8002 --directory dist
```

---

## 🤖 ML Details

- **Model:** `RandomForestRegressor` (`ml/train.py`)
- **Inputs:** `solar_kw, wind_kw, hydro_kw, battery_soc`
- **Output:** next-step `gen_kw`
- **Metrics:** RMSE, MAE, R² (regression, not classification)

Retrain:

```bash
cd backend
python ml/generate_data.py
python ml/train.py
python app.py
```

---

## ☁️ Deploy (Render + GitHub)

- **Backend:** Render → New Web Service → Root `backend`, Build `pip install -r requirements.txt`, Start `python app.py`, Python 3.11
- **Frontend:** Update `frontend/js/main.js` + `web/src/App.jsx` `fetch("http://127.0.0.1:5000/...")` → `https://your-app.onrender.com/...`
- **Web:** `npm run build` → deploy `web/dist`

---

## 🌿 Branches

- `main` — old code (untouched)
- `backup-main-old` — backup of old main (created locally, push when auth ready)
- `feature/new-dashboard` — **this build** (hybrid topbar, GRID nav, rebuilt settings, viewer lock, real static 0)

To push (needs GitHub auth):

```bash
git push origin backup-main-old
git push -u origin feature/new-dashboard
# → open PR feature/new-dashboard → main on GitHub
```

To completely replace main later:

```bash
git checkout main
git merge feature/new-dashboard
git push origin main
```

---

## 📝 License

Educational / academic use.
