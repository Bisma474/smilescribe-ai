from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

raw_db_url = settings.DATABASE_URL
if raw_db_url and raw_db_url.startswith("postgres://"):
    raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)

# Supabase uses PostgreSQL — no sqlite check_same_thread needed.
# Use connection_args for SSL required by Supabase.
engine = create_engine(
    raw_db_url,
    pool_pre_ping=True,          # detect stale connections
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,            # recycle every 5 min (Supabase idles connections)
    connect_args={
        "sslmode": "require",    # Supabase requires SSL
        "connect_timeout": 10,
    },
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
