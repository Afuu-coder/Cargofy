"""
Axon — Contact / Demo Booking Router
POST /api/v1/contact — submit a demo booking or contact form
"""

import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class ContactRequest(BaseModel):
    name:           str             = Field(..., description="Contact full name")
    business_name:  str             = Field(..., description="Business name")
    phone:          str             = Field(..., description="WhatsApp / phone in E.164 format")
    email:          Optional[str]   = Field(None, description="Email address")
    business_type:  Optional[str]   = Field(None, description="dairy / produce / frozen / pharma / fpo / other")
    num_vehicles:   Optional[str]   = Field(None, description="1-5 / 6-20 / 20+ / 100+")
    message:        Optional[str]   = Field(None, description="Optional message")
    form_type:      Optional[str]   = Field("demo", description="demo | contact | partner")


@router.post(
    "",
    summary="Submit demo booking or contact form",
    description="Accepts form submissions from the marketing website contact page. "
                "In production this would trigger a CRM entry and confirmation email.",
)
async def submit_contact(body: ContactRequest):
    """Store contact form submission and return confirmation."""
    logger.info(
        "New %s request from %s (%s) — phone: %s",
        body.form_type, body.name, body.business_name, body.phone,
    )

    # In production: insert into CRM, send confirmation email/WhatsApp, notify team
    # For hackathon: just acknowledge
    return {
        "success":  True,
        "message":  f"Thank you {body.name}! We'll reach you on {body.phone} within 4 hours.",
        "form_type": body.form_type,
        "ref":      f"DEMO-{body.phone[-4:].upper()}",
    }
