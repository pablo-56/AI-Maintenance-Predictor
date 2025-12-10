from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .schemas import MaintenanceRequest, MaintenanceResponse
from .predict import load_model_and_scaler, predict_failure

app = FastAPI(title="AI Maintenance Predictor API")

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model, scaler = load_model_and_scaler()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/predict", response_model=MaintenanceResponse)
def predict(request: MaintenanceRequest):
    failure_probability, risk_level = predict_failure(model, scaler, request)
    return MaintenanceResponse(
        failure_probability=failure_probability,
        risk_level=risk_level,
    )
