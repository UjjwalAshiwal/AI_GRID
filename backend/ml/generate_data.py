import os
import random
import pandas as pd

BASE_DIR = os.path.dirname(__file__)
DATA_PATH = os.path.join(BASE_DIR, "training_data.csv")

rows = []

for _ in range(5000):
    solar = random.uniform(0, 100)
    wind = random.uniform(0, 100)
    hydro = random.uniform(0, 100)
    battery_soc = random.uniform(0, 1)
    noise = random.uniform(-5, 5)

    next_gen = solar + wind + hydro + noise
    rows.append([solar, wind, hydro, battery_soc, next_gen])

df = pd.DataFrame(rows, columns=[
    "solar_kw", "wind_kw", "hydro_kw", "battery_soc", "next_gen_kw"
])

df.to_csv(DATA_PATH, index=False)
print(f"✅ training_data.csv saved at: {DATA_PATH}")
