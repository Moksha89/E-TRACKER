from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import db as app_db
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    # Redirect the lifespan create_all call so the production sqlite file is
    # never touched during tests.
    original_engine = app_db.engine
    app_db.engine = engine

    def _get_db() -> Iterator:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    app_db.engine = original_engine
