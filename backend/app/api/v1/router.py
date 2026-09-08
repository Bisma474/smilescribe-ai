import logging
from fastapi import APIRouter

logger = logging.getLogger(__name__)

api_router = APIRouter()


def _try_include(module_name: str, prefix: str, tags: list) -> None:
    """Import an endpoint module and include its router; skip on ImportError.

    POC mode intentionally excludes DB / auth modules so the app can run
    without bcrypt, jose, or a live Supabase connection.
    """
    try:
        mod = __import__(f"app.api.v1.endpoints.{module_name}", fromlist=["router"])
        api_router.include_router(mod.router, prefix=prefix, tags=tags)
        logger.info("Loaded endpoint module: %s", module_name)
    except ImportError as exc:
        logger.warning(
            "Skipping endpoint module '%s' (missing dependency: %s). "
            "POC endpoints will still work.",
            module_name,
            exc.name or exc,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Skipping endpoint module '%s' (error: %s)", module_name, exc)


# POC endpoints — always loaded
_try_include("poc", prefix="/poc", tags=["POC"])

# Auth / DB-backed endpoints — only loaded if their deps are present
_try_include("auth", prefix="/auth", tags=["Auth"])
_try_include("patients", prefix="/patients", tags=["Patients"])
_try_include("transcription", prefix="/transcription", tags=["Transcription"])
_try_include("notes", prefix="/notes", tags=["Notes"])
_try_include("audit_logs", prefix="/audit-logs", tags=["AuditLogs"])
