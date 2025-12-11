from pydantic import BaseModel
from typing import List, Literal

class MaintenanceRequest(BaseModel):
    air_temperature_k: float
    process_temperature_k: float
    rotational_speed_rpm: float
    torque_nm: float
    tool_wear_min: float
    type: str  # "H" | "L" | "M"

class Recommendation(BaseModel):
    id: str
    title: str
    severity: Literal["Low", "Medium", "High"]
    description: str


class MaintenanceResponse(BaseModel):
    """
    Output payload with failure probability and risk bucket.
    """
    failure_probability: float  # P(Machine failure = 1)
    risk_level: str             # "Green" | "Yellow" | "Red"
    recommendations: List[Recommendation]