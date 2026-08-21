import joblib
import os

MODEL_PATH = "ml/model.pkl"
model = None

if os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)
    print("✅ ML model loaded")

def predict_next(solar, wind, hydro, battery_soc):
    if model is None:
        return solar + wind + hydro

    features = [[solar, wind, hydro, battery_soc]]
    return float(model.predict(features)[0])
