def test_app_imports():
    from app.main import app
    assert app is not None

def test_health_shape():
    from app.main import health
    assert health() == {"status": "ok"}
