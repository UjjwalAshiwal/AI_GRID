import os
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split

BASE_DIR = os.path.dirname(__file__)
DATA_PATH = os.path.join(BASE_DIR, "training_data.csv")
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")

df = pd.read_csv(DATA_PATH)

X = df[["solar_kw", "wind_kw", "hydro_kw", "battery_soc"]]
y = df["next_gen_kw"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = RandomForestRegressor(n_estimators=200, random_state=42)
model.fit(X_train, y_train)

from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import numpy as np

# evaluate
y_pred = model.predict(X_test)

rmse = np.sqrt(mean_squared_error(y_test, y_pred))
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print("📊 MODEL EVALUATION")
print(f"RMSE : {rmse:.2f} kW")
print(f"MAE  : {mae:.2f} kW")
print(f"R²   : {r2:.3f}")

error_pct = (rmse / y_test.mean()) * 100
print(f"Error % ≈ {error_pct:.2f}%")



joblib.dump(model, MODEL_PATH)
print(f"✅ model.pkl saved at: {MODEL_PATH}")
