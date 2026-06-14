"""
Cargofy — Facilities Router
POST /api/v1/facilities/nearby — find cold-storage / mandi facilities
near a GPS coordinate using Google Places API.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Any, Dict, List

from app.services.maps_service import find_nearby_facilities

router = APIRouter()


# ── Request / Response schemas (local — simple enough not to need schemas.py) ──

class NearbyRequest(BaseModel):
    lat:       float = Field(..., examples=[22.3072], description="Latitude of current location")
    lng:       float = Field(..., examples=[73.1812], description="Longitude of current location")
    radius_km: int   = Field(20, ge=1, le=50, description="Search radius in km (max 50)")


class NearbyResponse(BaseModel):
    facilities: List[Dict[str, Any]]
    count:      int


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/nearby",
    response_model=NearbyResponse,
    summary="Find nearby cold-storage facilities and mandis",
    description="""
Uses Google Places API Nearby Search to locate:
- **Cold storage / food warehouses** near the given coordinate
- **Mandi / sabzi markets** near the given coordinate

Results are merged, deduplicated, and sorted by Haversine distance.
Returns the **top 3** closest facilities.

Falls back to an empty list if the API key is missing or the call fails
(never crashes the caller).
""",
)
async def nearby_facilities(body: NearbyRequest) -> NearbyResponse:
    """
    POST /api/v1/facilities/nearby
    Returns up to 3 nearby cold-chain facilities sorted by distance.
    """
    facilities = await find_nearby_facilities(
        lat=body.lat,
        lng=body.lng,
        radius_km=body.radius_km,
    )
    return NearbyResponse(facilities=facilities, count=len(facilities))
