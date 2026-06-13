"""
Cargofy — Blockchain Router

Endpoints to issue and verify shipment integrity certificates on Ethereum Sepolia.

Endpoints:
    POST /api/v1/blockchain/certify        → Issue certificate at end of trip
    GET  /api/v1/blockchain/verify/{code}  → Verify certificate (public)
    GET  /api/v1/blockchain/status         → Contract status + total certificates
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.blockchain_service import (
    issue_certificate,
    verify_certificate,
    compute_verdict,
)
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CertifyRequest(BaseModel):
    shipment_code: str          = Field(..., example="SHP-MH-001")
    product_type: str           = Field("milk", example="milk")
    departure_time: Optional[int] = Field(None, description="Unix timestamp. Defaults to now-6h")
    arrival_time: Optional[int]   = Field(None, description="Unix timestamp. Defaults to now")
    min_temp: float             = Field(2.0, example=2.0)
    max_temp: float             = Field(8.5, example=8.5)
    max_risk_score: float       = Field(0.45, ge=0, le=1, example=0.45)
    reroute_count: int          = Field(0, example=1)
    whatsapp_sent: bool         = Field(False, example=True)
    verdict: Optional[str]      = Field(None, description="SAFE|SPOILED|PARTIAL. Auto-computed if None")
    ipfs_hash: str              = Field("", example="Qm...")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/certify",
    summary="Issue Shipment Integrity Certificate (Sepolia Testnet)",
    response_description="Transaction hash, Etherscan URL, verdict",
)
async def certify_shipment(body: CertifyRequest):
    """
    Mint an immutable shipment integrity certificate on Ethereum Sepolia Testnet.

    This permanently records the cold-chain outcome on the blockchain:
    - Final temperature range
    - Peak AI risk score
    - Number of autonomous reroutes
    - Whether driver received WhatsApp alert
    - SAFE / SPOILED / PARTIAL verdict

    Once issued, the certificate **cannot be altered** — providing tamper-proof
    audit trail for FSSAI compliance, WHO GDP (pharma), and insurance claims.

    **Demo mode:** Returns a mock certificate if blockchain not configured.
    Set `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, `BLOCKCHAIN_CONTRACT_ADDRESS` in .env.
    """
    now = int(datetime.now(timezone.utc).timestamp())
    departure = body.departure_time or (now - 6 * 3600)
    arrival   = body.arrival_time   or now

    # Auto-compute verdict if not provided
    verdict = body.verdict or compute_verdict(body.max_risk_score, body.product_type)

    logger.info(
        "[BlockchainAPI] Certifying %s — verdict=%s risk=%.0f%%",
        body.shipment_code, verdict, body.max_risk_score * 100
    )

    result = await issue_certificate(
        shipment_code=body.shipment_code,
        product_type=body.product_type,
        departure_time=departure,
        arrival_time=arrival,
        min_temp=body.min_temp,
        max_temp=body.max_temp,
        max_risk_score=body.max_risk_score,
        reroute_count=body.reroute_count,
        whatsapp_sent=body.whatsapp_sent,
        verdict=verdict,
        ipfs_hash=body.ipfs_hash,
    )

    if not result.get("success"):
        raise HTTPException(500, detail=result.get("error", "Certificate minting failed"))

    return result


@router.get(
    "/verify/{shipment_code}",
    summary="Verify Shipment Certificate (Public)",
    response_description="On-chain certificate details + Etherscan link",
)
async def verify_shipment_certificate(shipment_code: str):
    """
    Publicly verify a shipment's integrity certificate on Ethereum Sepolia.

    Anyone — buyers, regulators, auditors — can verify the cold-chain outcome
    without needing a Cargofy account. Just the shipment code.

    The Etherscan link in the response lets anyone independently verify
    the certificate was minted by an authorized Cargofy backend wallet.

    Example: GET /api/v1/blockchain/verify/SHP-MH-001
    """
    result = await verify_certificate(shipment_code)
    return result


@router.get(
    "/status",
    summary="Blockchain Integration Status",
    response_description="Contract address, total certificates, network info",
)
async def blockchain_status():
    """
    Check Cargofy's blockchain integration status.

    Returns whether the system is connected to Sepolia Testnet,
    the contract address, and total certificates issued.
    """
    return {
        "network":           "Ethereum Sepolia Testnet",
        "contract_address":  settings.BLOCKCHAIN_CONTRACT_ADDRESS or "NOT_CONFIGURED",
        "rpc_configured":    bool(settings.BLOCKCHAIN_RPC_URL),
        "wallet_configured": bool(settings.BLOCKCHAIN_PRIVATE_KEY),
        "etherscan_base":    "https://sepolia.etherscan.io",
        "contract_source":   "blockchain/contracts/CargofyShipmentAudit.sol",
        "features": [
            "Immutable shipment integrity certificates",
            "FSSAI compliance audit trail",
            "WHO GDP pharmaceutical cold-chain proof",
            "Insurance claim evidence",
            "B2B trust: buyer-verifiable on Etherscan",
        ],
        "demo_mode": not bool(settings.BLOCKCHAIN_RPC_URL),
        "note": "In demo mode, mock certificates are returned. "
                "Set BLOCKCHAIN_RPC_URL + BLOCKCHAIN_PRIVATE_KEY + BLOCKCHAIN_CONTRACT_ADDRESS to go live.",
    }
