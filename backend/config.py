"""Central backend settings. Everything environment-specific lives here and comes from env vars
(Railway Variables in production, backend/.env locally). See docs/DEPLOYMENT.md for the full list."""
import os

from dotenv import load_dotenv

load_dotenv()


def _csv(name: str, default: str = "") -> list[str]:
    return [item.strip().rstrip("/") for item in os.getenv(name, default).split(",") if item.strip()]


APP_ENV = os.getenv("APP_ENV", "development")          # "production" on Railway
IS_PRODUCTION = APP_ENV == "production"

# Browser origins allowed to call this API (comma-separated). Must be https:// in production.
ALLOWED_ORIGINS = _csv("ALLOWED_ORIGINS", "http://localhost:3000")

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# One model can serve both jobs. Set OPENROUTER_VLM_MODEL (must accept image input); text explanations use
# OPENROUTER_TEXT_MODEL if set, otherwise the same model. Free models are retired from time to time, so
# list backups in the *_FALLBACKS vars (comma-separated); OpenRouter tries them if the primary is unavailable.
OPENROUTER_VLM_MODEL = os.getenv("OPENROUTER_VLM_MODEL") or "google/gemma-4-31b-it:free"
OPENROUTER_TEXT_MODEL = os.getenv("OPENROUTER_TEXT_MODEL") or OPENROUTER_VLM_MODEL
OPENROUTER_VLM_FALLBACKS = _csv("OPENROUTER_VLM_FALLBACKS")
OPENROUTER_TEXT_FALLBACKS = _csv("OPENROUTER_TEXT_FALLBACKS")

# Require a valid, approved Supabase login on analysis/explain endpoints. Only set to "false" for local dev.
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() != "false"

# Analyses run one at a time by default: peak memory is ~450 MB on a 512 MB service.
MAX_CONCURRENT_ANALYSES = int(os.getenv("MAX_CONCURRENT_ANALYSES", "1"))

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()   # set LOG_LEVEL=DEBUG locally if you need it


def validate_for_production():
    """Fail fast on unsafe production config rather than serving it."""
    if not IS_PRODUCTION:
        return
    problems = []
    insecure = [o for o in ALLOWED_ORIGINS if not o.startswith("https://")]
    if insecure:
        problems.append(f"ALLOWED_ORIGINS must be https:// in production (got {insecure})")
    if "*" in ALLOWED_ORIGINS:
        problems.append("ALLOWED_ORIGINS must not contain '*'")
    if not REQUIRE_AUTH:
        problems.append("REQUIRE_AUTH must not be false in production")
    for name, value in (("SUPABASE_URL", SUPABASE_URL), ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
                        ("OPENROUTER_API_KEY", OPENROUTER_API_KEY)):
        if not value:
            problems.append(f"{name} is not set")
    if problems:
        raise RuntimeError("Invalid production configuration: " + "; ".join(problems))
