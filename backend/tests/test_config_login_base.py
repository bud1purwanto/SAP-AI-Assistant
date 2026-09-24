from config import settings


def test_dashboard_oidc_issuer_strips_trailing_slash_for_login_base():
    """Login base URL must not double-slash when concatenated with /v1/auth/login."""
    base = settings.dashboard_oidc_issuer.rstrip("/")
    assert not base.endswith("/")
    url = f"{base}/v1/auth/login"
    assert "//v1/" not in url
