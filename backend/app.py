from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import csv
import os

from simulation import simulate_power
from forecast import predict_next

app = Flask(__name__)
CORS(app)  # allow JS to talk to Python



DATA_FILE = os.path.join("data", "solar_data.csv")


@app.route("/simulate", methods=["POST"])
def simulate():
    data = request.json

    sunlight = float(data.get("sunlight", 0))
    wind = float(data.get("wind", 0))
    hydro = float(data.get("hydro", 0))

    # Run simulation (real logic lives here, not JS)
    result = simulate_power(sunlight, wind, hydro)

    # Save to CSV
    # with open(DATA_FILE, "a", newline="") as f:
    #     writer = csv.writer(f)
    #     writer.writerow([
    #         datetime.now().isoformat(),
    #         sunlight,
    #         wind,
    #         hydro,
    #         result["solar_kw"],
    #         result["wind_kw"],
    #         result["hydro_kw"]
    #     ])

    return jsonify(result)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "backend running"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)

    







@app.route("/forecast", methods=["POST"])
def forecast():
    data = request.json

    pred = predict_next(
        data["solar_kw"],
        data["wind_kw"],
        data["hydro_kw"],
        data.get("battery_soc", 0.5)
    )

    return jsonify({"gen_kw": pred})
