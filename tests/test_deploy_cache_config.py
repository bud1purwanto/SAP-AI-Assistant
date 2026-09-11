from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NGINX_CONFIG = ROOT / "deploy" / "nginx-sap-ai.conf"
DEPLOY_SCRIPT = ROOT / "deploy" / "deploy.sh"
UPDATE_SCRIPT = ROOT / "deploy" / "update.sh"


def _assert_service_worker_no_store(config: str) -> None:
    marker = "location = /sw.js {"
    assert marker in config
    block = config.split(marker, 1)[1].split("}", 1)[0]
    assert 'Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;' in block
    assert 'CDN-Cache-Control "no-store" always;' in block
    assert "immutable" not in block


def test_nginx_template_never_caches_service_worker():
    config = NGINX_CONFIG.read_text()
    _assert_service_worker_no_store(config)
    assert "listen 8085;" in config


def test_initial_deploy_never_caches_service_worker():
    script = DEPLOY_SCRIPT.read_text()
    _assert_service_worker_no_store(script)
    assert "listen 8085;" in script


def test_update_does_not_hide_nginx_sync_failures():
    script = UPDATE_SCRIPT.read_text()
    nginx_section = script.split('echo "🌐 [5/5]', 1)[1]

    assert 'cp "${PROJECT_DIR}/deploy/nginx-sap-ai.conf" /etc/nginx/sites-available/sap-ai 2>/dev/null || true' not in nginx_section
    assert "systemctl reload nginx 2>/dev/null || true" not in nginx_section
