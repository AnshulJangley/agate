import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
load_dotenv()

# Primary database URL (Cloud Supabase or local postgres)
DATABASE_URL = os.environ.get(
    "DATABASE_URL", 
    "postgresql://postgres:YOUR_PASSWORD_HERE@localhost:5432/agate_nwis"
).strip()

LOCAL_FALLBACK_URL = os.environ.get(
    "LOCAL_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/agate_nwis"
).strip()

# Resilient engine configuration with short connection timeout so network dropouts fail over quickly
engine_kwargs = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
}

if "postgresql" in DATABASE_URL:
    engine_kwargs["connect_args"] = {"connect_timeout": 4}

engine = create_engine(DATABASE_URL, **engine_kwargs)

# Create a configured "Session" class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create a Base class for declarative models
Base = declarative_base()

# Dependency function to yield database sessions for FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.warning(f"Database session error: {e}")
        db.rollback()
        raise e
    finally:
        db.close()
