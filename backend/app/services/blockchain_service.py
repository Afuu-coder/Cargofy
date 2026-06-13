"""
Cargofy — Blockchain Audit Service (Ethereum Sepolia Testnet)

Mints immutable shipment integrity certificates on-chain at end of each trip.

Why blockchain matters for cold-chain:
  - Pharmaceutical shipments: regulators demand tamper-proof temp logs (WHO GDP)
  - FSSAI compliance: food safety audit trail
  - Insurance claims: immutable proof of cold-chain breach / safe delivery
  - B2B trust: buyer can verify on Etherscan — no middleman

Contract: CargofyShipmentAudit.sol (deployed on Sepolia Testnet)
Explorer: https://sepolia.etherscan.io/address/{CONTRACT_ADDRESS}

Usage:
    from app.services.blockchain_service import issue_certificate, verify_certificate
    tx = await issue_certificate(shipment_code="SHP-MH-001", verdict="SAFE", ...)
    cert = await verify_certificate("SHP-MH-001")
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Contract ABI (minimal — only functions we call) ───────────────────────────

CONTRACT_ABI = [
    {
        "inputs": [
            {"name": "shipmentCode",   "type": "string"},
            {"name": "productType",    "type": "string"},
            {"name": "departureTime",  "type": "uint256"},
            {"name": "arrivalTime",    "type": "uint256"},
            {"name": "minTempTenths",  "type": "int16"},
            {"name": "maxTempTenths",  "type": "int16"},
            {"name": "maxRiskScore",   "type": "uint8"},
            {"name": "rerouteCount",   "type": "uint8"},
            {"name": "whatsappSent",   "type": "bool"},
            {"name": "verdict",        "type": "uint8"},
            {"name": "ipfsHash",       "type": "string"},
        ],
        "name": "issueCertificate",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "shipmentCode", "type": "string"}],
        "name": "verifyCertificate",
        "outputs": [
            {"name": "exists",      "type": "bool"},
            {"name": "verdict",     "type": "uint8"},
            {"name": "maxRisk",     "type": "uint8"},
            {"name": "reroutes",    "type": "uint8"},
            {"name": "issuedAt",    "type": "uint256"},
            {"name": "certifiedBy", "type": "address"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "totalCertificates",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "name": "shipmentCode", "type": "string"},
            {"indexed": False, "name": "verdict",      "type": "uint8"},
            {"indexed": False, "name": "maxRiskScore", "type": "uint8"},
            {"indexed": False, "name": "rerouteCount", "type": "uint8"},
            {"indexed": False, "name": "certifiedBy",  "type": "address"},
            {"indexed": False, "name": "issuedAt",     "type": "uint256"},
        ],
        "name": "CertificateIssued",
        "type": "event",
    },
]

# Verdict enum (must match Solidity)
VERDICT = {"SAFE": 0, "SPOILED": 1, "PARTIAL": 2, "UNKNOWN": 3}
VERDICT_REVERSE = {v: k for k, v in VERDICT.items()}


# ── Web3 client factory ───────────────────────────────────────────────────────

def _get_web3():
    """Return a connected Web3 instance (Sepolia via Alchemy/Infura)."""
    try:
        from web3 import Web3
        rpc_url = settings.BLOCKCHAIN_RPC_URL
        if not rpc_url:
            logger.warning("[Blockchain] BLOCKCHAIN_RPC_URL not set — using mock mode")
            return None
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            logger.warning("[Blockchain] Cannot connect to Sepolia RPC: %s", rpc_url)
            return None
        return w3
    except ImportError:
        logger.warning("[Blockchain] web3 package not installed — pip install web3")
        return None
    except Exception as exc:
        logger.warning("[Blockchain] Web3 init failed: %s", exc)
        return None


def _get_contract(w3):
    """Return the CargofyShipmentAudit contract instance."""
    addr = settings.BLOCKCHAIN_CONTRACT_ADDRESS
    if not addr:
        return None
    try:
        from web3 import Web3
        checksum_addr = Web3.to_checksum_address(addr)
        return w3.eth.contract(address=checksum_addr, abi=CONTRACT_ABI)
    except Exception as exc:
        logger.warning("[Blockchain] Contract init failed: %s", exc)
        return None


# ── Mock response (when blockchain not configured) ────────────────────────────

def _mock_certificate(shipment_code: str, verdict: str, **kwargs) -> Dict[str, Any]:
    """Return a realistic mock certificate for demo/dev mode."""
    return {
        "success":         True,
        "mode":            "MOCK",
        "shipment_code":   shipment_code,
        "verdict":         verdict,
        "tx_hash":         f"0x{'a' * 64}",
        "block_number":    6_250_000,
        "etherscan_url":   f"https://sepolia.etherscan.io/tx/0x{'a' * 64}",
        "certified_at":    datetime.utcnow().isoformat(),
        "note":            "Set BLOCKCHAIN_RPC_URL + BLOCKCHAIN_PRIVATE_KEY + BLOCKCHAIN_CONTRACT_ADDRESS to enable real on-chain minting",
    }


# ── Issue Certificate ─────────────────────────────────────────────────────────

async def issue_certificate(
    shipment_code: str,
    product_type: str,
    departure_time: int,
    arrival_time: int,
    min_temp: float,
    max_temp: float,
    max_risk_score: float,
    reroute_count: int = 0,
    whatsapp_sent: bool = False,
    verdict: str = "SAFE",
    ipfs_hash: str = "",
) -> Dict[str, Any]:
    """
    Mint an immutable shipment integrity certificate on Ethereum Sepolia.

    Called at the end of each simulated or real trip to permanently record
    the cold-chain outcome on-chain.

    Args:
        shipment_code:   e.g. "SHP-MH-001"
        product_type:    e.g. "milk"
        departure_time:  Unix timestamp
        arrival_time:    Unix timestamp
        min_temp:        Minimum recorded temperature (°C)
        max_temp:        Maximum recorded temperature (°C)
        max_risk_score:  Peak risk (0-1 float, stored as 0-100 uint8)
        reroute_count:   AI rerouting interventions
        whatsapp_sent:   Whether driver received WhatsApp alert
        verdict:         "SAFE" | "SPOILED" | "PARTIAL"
        ipfs_hash:       IPFS CID of full telemetry JSON

    Returns:
        Dict with tx_hash, Etherscan URL, block number
    """
    w3 = _get_web3()
    if not w3:
        logger.info("[Blockchain] Mock mode — issuing mock certificate for %s", shipment_code)
        return _mock_certificate(shipment_code, verdict)

    contract = _get_contract(w3)
    if not contract:
        return _mock_certificate(shipment_code, verdict)

    private_key = settings.BLOCKCHAIN_PRIVATE_KEY
    if not private_key:
        logger.warning("[Blockchain] BLOCKCHAIN_PRIVATE_KEY not set")
        return _mock_certificate(shipment_code, verdict)

    try:
        from web3 import Web3
        account = w3.eth.account.from_key(private_key)
        nonce   = w3.eth.get_transaction_count(account.address)

        # Convert floats to int16 tenths (e.g. 4.2°C → 42)
        min_temp_tenths = int(min_temp * 10)
        max_temp_tenths = int(max_temp * 10)
        risk_uint8      = min(100, max(0, int(max_risk_score * 100)))
        verdict_uint8   = VERDICT.get(verdict.upper(), 3)

        tx = contract.functions.issueCertificate(
            shipment_code,
            product_type,
            departure_time,
            arrival_time,
            min_temp_tenths,
            max_temp_tenths,
            risk_uint8,
            reroute_count,
            whatsapp_sent,
            verdict_uint8,
            ipfs_hash or "",
        ).build_transaction({
            "from":     account.address,
            "nonce":    nonce,
            "gas":      200_000,
            "gasPrice": w3.eth.gas_price,
        })

        signed = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        result = {
            "success":       True,
            "mode":          "ON_CHAIN",
            "shipment_code": shipment_code,
            "verdict":       verdict,
            "tx_hash":       tx_hash.hex(),
            "block_number":  receipt.blockNumber,
            "gas_used":      receipt.gasUsed,
            "etherscan_url": f"https://sepolia.etherscan.io/tx/{tx_hash.hex()}",
            "certified_at":  datetime.utcnow().isoformat(),
        }

        logger.info(
            "[Blockchain] Certificate minted for %s: %s (%s) — tx: %s",
            shipment_code, verdict, result["etherscan_url"], tx_hash.hex()[:16]
        )
        return result

    except Exception as exc:
        logger.error("[Blockchain] Certificate minting failed for %s: %s", shipment_code, exc)
        return {
            "success": False,
            "mode":    "ERROR",
            "error":   str(exc),
            **_mock_certificate(shipment_code, verdict),
        }


# ── Verify Certificate ────────────────────────────────────────────────────────

async def verify_certificate(shipment_code: str) -> Dict[str, Any]:
    """
    Verify a shipment certificate on-chain.
    Anyone can call this — fully public, no auth needed.

    Returns:
        Dict with exists, verdict, risk score, reroute count, Etherscan link
    """
    w3 = _get_web3()
    if not w3:
        return {
            "exists":  True,
            "mode":    "MOCK",
            "verdict": "SAFE",
            "message": "Set BLOCKCHAIN_RPC_URL to verify real on-chain certificates",
        }

    contract = _get_contract(w3)
    if not contract:
        return {"exists": False, "error": "Contract not configured"}

    try:
        result = contract.functions.verifyCertificate(shipment_code).call()
        exists, verdict_uint8, max_risk, reroutes, issued_at, certified_by = result

        return {
            "exists":          exists,
            "mode":            "ON_CHAIN",
            "shipment_code":   shipment_code,
            "verdict":         VERDICT_REVERSE.get(verdict_uint8, "UNKNOWN"),
            "max_risk_score":  max_risk,
            "reroute_count":   reroutes,
            "issued_at":       datetime.utcfromtimestamp(issued_at).isoformat() if issued_at else None,
            "certified_by":    certified_by,
            "etherscan_url":   f"https://sepolia.etherscan.io/address/{settings.BLOCKCHAIN_CONTRACT_ADDRESS}",
        }

    except Exception as exc:
        logger.error("[Blockchain] Verify failed for %s: %s", shipment_code, exc)
        return {"exists": False, "error": str(exc)}


# ── Auto-verdict from risk score ──────────────────────────────────────────────

def compute_verdict(max_risk_score: float, product_type: str) -> str:
    """Determine certificate verdict from peak risk score."""
    if max_risk_score >= 0.90:
        return "SPOILED"
    elif max_risk_score >= 0.65:
        return "PARTIAL"
    else:
        return "SAFE"
