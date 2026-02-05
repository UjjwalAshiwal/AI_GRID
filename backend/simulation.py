# simulation.py
# Backend simulation logic (single source of truth)

MAX_SOLAR_KW = 1000
MAX_WIND_KW = 1000
MAX_HYDRO_KW = 1000


def simulate_power(sunlight, wind, hydro):
    """
    sunlight: 0–100 (%)
    wind: 0–100 (%)
    hydro: 0–100 (%)
    """

    # --- Solar ---
    solar_kw = (sunlight / 100.0) * MAX_SOLAR_KW

    # --- Wind ---
    # cubic relation (basic wind physics)
    wind_norm = min(wind / 100.0, 1.0)
    wind_kw = (wind_norm ** 3) * MAX_WIND_KW

    # --- Hydro ---
    hydro_kw = (hydro / 100.0) * MAX_HYDRO_KW * 0.9

    return {
        "solar_kw": round(solar_kw, 2),
        "wind_kw": round(wind_kw, 2),
        "hydro_kw": round(hydro_kw, 2)
    }
