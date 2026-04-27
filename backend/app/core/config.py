"""
Application configuration using pydantic-settings.
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
    DATABASE_URL: str = "postgresql://axon:axon_dev_password@localhost:5432/axon_db"

    # ── Security ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # ── Google / GCP ──────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    VERTEX_AI_PROJECT: str = ""
    VERTEX_AI_LOCATION: str = "asia-south1"
    GOOGLE_MAPS_API_KEY: str = ""

    # ── Firebase ─────────────────────────────────────────────────────────────
    FIREBASE_SERVICE_ACCOUNT_PATH: str = "./secrets/firebase_service_account.json"
    FIREBASE_DB_URL: str = ""  # e.g. https://axon-493411-default-rtdb.firebaseio.com

    # ── BigQuery ─────────────────────────────────────────────────────────────
    BIGQUERY_DATASET: str = "axon_ops"

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

    # ── Twilio ────────────────────────────────────────────────────────────────
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = "whatsapp:+14155238886"
    # If set, ALL WhatsApp alerts go to this number (free Twilio sandbox demo mode)
    DEMO_PHONE_OVERRIDE: str = ""

    # ── Mapbox ───────────────────────────────────────────────────────────────
    MAPBOX_API_KEY: str          = ""  # pk.eyJ1... public token
    MAPBOX_SECRET_TOKEN: str     = ""  # sk.eyJ1... private token (server-side)

    # ── Meta / WhatsApp Business ─────────────────────────────────────────────
    META_WA_PHONE_NUMBER_ID: str = ""
    META_WA_ACCESS_TOKEN: str    = ""
    META_WA_WEBHOOK_VERIFY_TOKEN: str = "axon-wh-verify"

    # ── Redis / Memorystore ──────────────────────────────────────────────────
    REDIS_URL: str = ""  # redis://10.x.x.x:6379  (Cloud Memorystore)

    # ── Cloud Storage ────────────────────────────────────────────────────────
    GCS_EXPORTS_BUCKET: str = "axon-exports"
    GCS_MEDIA_BUCKET: str   = "axon-media"

    # ── Cloud Tasks ──────────────────────────────────────────────────────────
    CLOUD_TASKS_QUEUE: str    = "axon-tasks"
    CLOUD_TASKS_LOCATION: str = "asia-south1"

    # ── External APIs ─────────────────────────────────────────────────────────
    OPENWEATHER_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
