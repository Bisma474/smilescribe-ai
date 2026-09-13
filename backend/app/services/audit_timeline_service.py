from datetime import datetime, timezone
from typing import Any


def append_audit_event(session: Any, event: str, detail: str) -> None:
    timeline = list(session.audit_timeline or [])
    timeline.append({
        "event": event,
        "detail": detail,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    })
    session.audit_timeline = timeline[-100:]