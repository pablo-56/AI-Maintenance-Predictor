
# AI Maintenance Predictor Dashboard

Tech stack: **FastAPI**, **Python**, **scikit-learn**, **React**, **Recharts**, and **Docker**.

This repo is a minimal end-to-end template for your predictive maintenance project:

- `backend/` – FastAPI service exposing `/predict` and `/health`
- `frontend/` – React dashboard (Vite) that calls the API and shows Green/Yellow/Red risk
- `docker-compose.yml` – Run both with one command

## 1. Prerequisites

- Docker + Docker Compose
- Your trained `maintenance_model.pkl` and `scaler.pkl` from your notebook

## 2. Plug in your trained model

1. From your training notebook, save the model and scaler:

   ```python
   import joblib
   joblib.dump(model, "maintenance_model.pkl")
   joblib.dump(scaler, "scaler.pkl")
   ```

2. Copy those files into:

   ```bash
   backend/models/maintenance_model.pkl
   backend/models/scaler.pkl
   ```

3. Make sure the **feature order** in `app/predict.py` matches how you trained the model:

   ```python
   X = np.array([[
       request.air_temperature_k,
       request.process_temperature_k,
       request.rotational_speed_rpm,
       request.torque_nm,
       request.tool_wear_min,
   ]])
   ```

   Adjust fields and order if your model uses different features.

## 3. Run with Docker Compose

From the repo root:

```bash
docker compose up --build
```

- Backend (FastAPI): http://localhost:8000
  - Health check: `GET /health`
  - Prediction: `POST /predict`
- Frontend (React): http://localhost:3000

The React app is configured to call the API at `http://localhost:8000` by default.  
To change, set `VITE_API_BASE` in a `.env` file in `frontend/`.

## 4. API Example

Request:

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "air_temperature_k": 300,
    "process_temperature_k": 310,
    "rotational_speed_rpm": 1500,
    "torque_nm": 40,
    "tool_wear_min": 10
  }'
```

Response:

```json
{
  "failure_probability": 0.37,
  "risk_level": "Yellow"
}
```

Risk thresholds are defined in `app/predict.py`:

- `< 0.10` → Green
- `0.10 – < 0.50` → Yellow
- `>= 0.50` → Red

## 5. Frontend overview

- Simple form to input sensor readings
- On submit, calls `/predict` and displays:
  - Failure probability (%)
  - Risk level (Green/Yellow/Red)
  - A small pie chart (Recharts) showing failure vs no-failure probability

You can extend this to:

- Show a table of multiple assets
- Upload CSVs and batch predict
- Add trend charts, KPIs, etc.

## 6. Local dev (optional, without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

---

This is a starting template; you can now plug in your real AI4I model, expand the schema, and build a richer predictive maintenance dashboard.
