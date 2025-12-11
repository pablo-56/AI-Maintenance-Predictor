import os
import joblib
import numpy as np

from .schemas import MaintenanceRequest


# Paths to the trained model and scaler
# Make sure you copied maintenance_model.pkl and scaler.pkl into backend/models/
MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "models",
    "maintenance_model.pkl",
)

SCALER_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "models",
    "scaler.pkl",
)


def load_model_and_scaler():
    """
    Load the trained scikit-learn model and the fitted scaler.

    You should have created them in your notebook with something like:

        joblib.dump(gb_tuned, "maintenance_model.pkl")
        joblib.dump(scaler, "scaler.pkl")

    and then copied those files into backend/models/.
    """
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(
            f"Model file not found at {MODEL_PATH}. "
            "Please copy your trained maintenance_model.pkl into backend/models/."
        )
    if not os.path.exists(SCALER_PATH):
        raise RuntimeError(
            f"Scaler file not found at {SCALER_PATH}. "
            "Please copy your fitted scaler.pkl into backend/models/."
        )

    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    return model, scaler


def risk_bucket(p: float) -> str:
    """
    Map failure probability to a Green / Yellow / Red risk level.
    Adjust thresholds if needed.
    """
    if p < 0.10:
        return "Green"
    elif p < 0.50:
        return "Yellow"
    else:
        return "Red"


def predict_failure(model, scaler, request: MaintenanceRequest):
    """
    Build the feature vector in the EXACT same order as during training,
    scale it using the loaded scaler, and get failure probability from the model.
    """

    power = request.rotational_speed_rpm * request.torque_nm
    temp_diff = request.process_temperature_k - request.air_temperature_k
    power_wear = power * request.tool_wear_min
    temp_power = temp_diff / power

    if request.type == "L":
        type_l, type_m = 1, 0
    elif request.type == "M":
        type_l, type_m = 0, 1
    else:  # "H"
        type_l, type_m = 0, 0

    X = np.array([[
        request.air_temperature_k,
        request.process_temperature_k,
        request.rotational_speed_rpm,
        request.torque_nm,
        request.tool_wear_min,
        power,
        power_wear,
        temp_diff,
        temp_power,
        type_l,
        type_m,
    ]])

    # Scale input
    X_scaled = scaler.transform(X)

    # Predict probability of class 1 (failure)
    probas = model.predict_proba(X_scaled)

    # Handle normal case (two classes) and edge case (single class)
    if probas.shape[1] == 2:
        # Find index of class 1 in model.classes_
        classes = list(model.classes_)
        if 1 in classes:
            idx_pos = classes.index(1)
        else:
            # If somehow 1 is not in classes (weird case), fallback to last column
            idx_pos = -1
        failure_probability = float(probas[0, idx_pos])
    else:
        # Degenerate case: model only knows one class
        only_class = model.classes_[0]
        failure_probability = 1.0 if only_class == 1 else 0.0

    risk_level = risk_bucket(failure_probability)
    return failure_probability, risk_level



# app/predict.py

def generate_recommendations(features: dict, failure_prob: float) -> list[dict]:
    """
    features: the same dict you use to build X (air_temperature_k, torque_nm, etc.)
    failure_prob: model predicted probability of failure (0..1)

    Returns a list of recommended maintenance actions.
    """
    # assumes risk_level_from_prob(failure_prob) -> "Green" | "Yellow" | "Red"
    risk = risk_bucket(failure_prob)
    recs: list[dict] = []

    # Baseline recommendation by risk band
    if risk == "Green":
        recs.append({
            "id": "routine_monitoring",
            "title": "Continue routine monitoring",
            "severity": "Low",
            "description": (
                "Machine is healthy. Keep current inspection schedule and "
                "log anomalies if any sensor drifts."
            ),
        })
    elif risk == "Yellow":
        recs.append({
            "id": "plan_inspection",
            "title": "Plan inspection in the next maintenance window",
            "severity": "Medium",
            "description": (
                "Moderate failure risk. Schedule a targeted inspection and "
                "review torque, temperature and tool wear."
            ),
        })
        recs.append({
            "id": "increase_sampling",
            "title": "Increase sensor sampling & logging",
            "severity": "Medium",
            "description": (
                "Increase sampling frequency to capture more signal before the "
                "next run and refine the prediction."
            ),
        })
    else:  # Red
        recs.append({
            "id": "urgent_shutdown",
            "title": "Create urgent work order / consider shutdown",
            "severity": "High",
            "description": (
                "High failure risk. Escalate to maintenance lead, evaluate "
                "safe shutdown or immediate repair."
            ),
        })
        recs.append({
            "id": "check_spare_parts",
            "title": "Verify spare parts availability",
            "severity": "High",
            "description": (
                "Ensure critical spare parts are available (tooling, bearings, "
                "critical components) before next run."
            ),
        })

    # Optional: add sensor-specific hints
    torque = float(features.get("torque_nm", 0))
    wear = float(features.get("tool_wear_min", 0))
    temp_diff = float(features.get("temperature_difference", 0))

    if wear > 200:
        recs.append({
            "id": "replace_tool",
            "title": "Inspect / replace tool",
            "severity": "Medium",
            "description": (
                f"Tool wear is high ({wear:.1f} min). "
                "Consider replacement or recalibration."
            ),
        })

    if torque > 60:
        recs.append({
            "id": "review_load",
            "title": "Review load & torque limits",
            "severity": "Medium",
            "description": (
                f"Torque is elevated ({torque:.1f} Nm). "
                "Verify load settings and mechanical constraints."
            ),
        })

    if temp_diff > 12:
        recs.append({
            "id": "cooling_check",
            "title": "Check cooling / lubrication",
            "severity": "Medium",
            "description": (
                f"Temperature difference is high ({temp_diff:.1f} K). "
                "Inspect cooling and lubrication systems."
            ),
        })

    return recs
