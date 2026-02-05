🌱 Renewable Energy Management Dashboard with ML Forecasting

A full-stack renewable energy management system that simulates solar, wind, and hydro power generation, manages battery storage and load distribution, and integrates a machine learning model to forecast future power generation.



This project combines:

Frontend dashboard (HTML, CSS, JavaScript, Chart.js)

Backend API (Python, Flask)

Machine Learning (Scikit-learn, Random Forest Regressor)




📌 Features

🔆 Real-time simulation of renewable energy sources

🔋 Battery charging & discharging logic

⚡ Load allocation & grid interaction

📊 Live charts for generation, output, and storage

🤖 Machine Learning–based power generation forecast

📈 Forecast vs actual visualization

🔄 Fully modular frontend + backend architecture

☁️ Cloud deployable via GitHub + Render



⚙️ Requirements

Software

Python 3.10 or 3.11

Node.js (optional, only for local frontend tooling)

Git

Python Libraries

Installed automatically via requirements.txt:

Flask

Flask-CORS

NumPy

Pandas

Scikit-learn

Joblib



🚀 How to Run the Project (Local)

1️⃣ Clone the Repository

git clone https://github.com/your-username/renewable-energy-dashboard.git
cd renewable-energy-dashboard

2️⃣ Backend Setup

Install dependencies

cd backend

pip install -r requirements.txt

3️⃣ Generate Training Data (One-Time)

python ml/generate_data.py


This creates:

backend/ml/training_data.csv

4️⃣ Train the Machine Learning Model
python ml/train_model.py


This produces:

backend/ml/model.pkl


You should see evaluation metrics like:

RMSE, MAE, R²

5️⃣ Start the Backend Server
python app.py


Expected output:

✅ ML model loaded
Running on http://127.0.0.1:5000



6️⃣ Run the Frontend

Open frontend/index.html or frontend/dashboard.html in your browser.

The dashboard will:

Fetch live simulation data

Call backend /forecast endpoint

Display forecast vs actual generation



🤖 Machine Learning Details
Model Type

RandomForestRegressor

Input Features

Solar generation (kW)

Wind generation (kW)

Hydro generation (kW)

Battery state of charge (SOC)


Output

Predicted next-step power generation (kW)


Evaluation Metrics

RMSE – Root Mean Squared Error

MAE – Mean Absolute Error

R² Score – Model fit quality

This is a regression problem, not classification. Accuracy is intentionally not used.



☁️ Deployment (Render + GitHub)

1️⃣ Push to GitHub

Ensure these files exist:

backend/requirements.txt

backend/app.py

backend/ml/model.pkl

2️⃣ Deploy Backend on Render

Go to https://render.com

New → Web Service

Connect GitHub repository

Configure:

Root directory: backend

Build command:

pip install -r requirements.txt


Start command:

python app.py


Runtime: Python 3.11

Deploy.

3️⃣ Update Frontend API URL

In frontend/js/main.js:

const BACKEND_URL = "https://your-app-name.onrender.com";


Replace all localhost calls with BACKEND_URL.

🧪 How to Retrain the Model

If you want to retrain later:

python ml/generate_data.py
python ml/train_model.py
python app.py


This project is for educational and academic use.
