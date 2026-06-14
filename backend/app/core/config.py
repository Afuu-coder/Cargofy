"""
Cargofy — Application Configuration
AI-Powered Cold Chain Intelligence Platform
Reads from environment variables / .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    BACKEND_PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL:  str = ""  # Cloud Run URL for Cloud Tasks callbacks

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:Afjali786%40%40@db.yxlopjyyrukfutqhbwls.supabase.co:5432/postgres"

    # ── Supabase Auth ─────────────────────────────────────────────────────────
    SUPABASE_URL: str = "https://yxlopjyyrukfutqhbwls.supabase.co"
    SUPABASE_ANON_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4bG9wanl5cnVrZnV0cWhid2xzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjI2OTksImV4cCI6MjA5NjkzODY5OX0.FdAe1NbBoe3PUmnOs-4kmc1zUds81vVM1r0dFQ-S2Nk"
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # ── Security ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # ── Google / GCP ──────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    VERTEX_AI_PROJECT: str = ""
    VERTEX_AI_LOCATION: str = "asia-south1"
    GOOGLE_MAPS_API_KEY: str = ""

    # ── BigQuery ─────────────────────────────────────────────────────────────
    BIGQUERY_DATASET: str = "cargofy_ops"

    # ── Pub/Sub ──────────────────────────────────────────────────────────────
    PUBSUB_PROJECT: str = ""  # GCP project ID for Pub/Sub
    PUBSUB_TELEMETRY_TOPIC: str        = "telemetry-stream"
    PUBSUB_NETWORK_EVENTS_TOPIC: str   = "ops-events"
    PUBSUB_SHIPMENT_CREATED_TOPIC: str = "shipment-created"
    PUBSUB_RISK_STATE_TOPIC: str       = "risk-state-changed"
    PUBSUB_ALERT_EVENTS_TOPIC: str     = "alert-events"
    PUBSUB_STAGE_CHANGED_TOPIC: str    = "stage-changed"
    PUBSUB_VEHICLE_HEALTH_TOPIC: str   = "vehicle-health-alerts"
    PUBSUB_INTERVENTION_TOPIC: str     = "intervention-taken"

    # ── Mapbox (public token for frontend 3D map) ──────────────────────────────
    MAPBOX_API_KEY: str = ""  # pk.eyJ1... get free key at mapbox.com

    # ── CallMeBot (Free WhatsApp Alerts) ─────────────────────────────────────
    CALLMEBOT_API_KEY: str = ""   # From callmebot.com — free, no credit card
    CALLMEBOT_PHONE: str  = ""    # Your WhatsApp number e.g. +919876543210

    # ── Firebase ─────────────────────────────────────────────────────────────
    FIREBASE_DB_URL: str = ""

    # ── Redis / Memorystore ──────────────────────────────────────────────────
    REDIS_URL: str = ""  # redis://10.x.x.x:6379  (Cloud Memorystore)

    # ── Cloud Storage ────────────────────────────────────────────────────────
    GCS_EXPORTS_BUCKET: str = "cargofy-exports"
    GCS_MEDIA_BUCKET: str   = "cargofy-media"

    # ── Cloud Tasks ──────────────────────────────────────────────────────────
    CLOUD_TASKS_QUEUE: str    = "cargofy-tasks"
    CLOUD_TASKS_LOCATION: str = "asia-south1"

    # ── External APIs ─────────────────────────────────────────────────────────
    OPENWEATHER_API_KEY: str = ""

    # ── Blockchain — Ethereum Sepolia Testnet ────────────────────────────
    # Get free RPC from https://www.alchemy.com (free tier)
    # Get free Sepolia ETH from https://sepoliafaucet.com
    BLOCKCHAIN_RPC_URL: str           = ""  # https://eth-sepolia.g.alchemy.com/v2/KEY
    BLOCKCHAIN_PRIVATE_KEY: str       = ""  # 0x... (Sepolia TEST wallet only!)
    BLOCKCHAIN_CONTRACT_ADDRESS: str  = ""  # 0x... (deployed CargofyShipmentAudit.sol)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
