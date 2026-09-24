# backend/tests/test_access_control_purge.py
"""Ensure access_control module is fully purged from runtime imports."""
import subprocess, pathlib

BACKEND = pathlib.Path(__file__).resolve().parent.parent

def test_no_access_control_imports():
    """No .py file under backend/ should import access_control."""
    result = subprocess.run(
        ["grep", "-rn", "--exclude-dir=venv", "import access_control", str(BACKEND)],
        capture_output=True, text=True
    )
    # Exclude this test file itself and __pycache__
    lines = [l for l in result.stdout.strip().splitlines()
             if "__pycache__" not in l and "test_access_control_purge" not in l and "/venv/" not in l]
    assert lines == [], f"Stale access_control imports:\n" + "\n".join(lines)

def test_no_access_control_module():
    """access_control.py should not exist."""
    assert not (BACKEND / "access_control.py").exists(), "access_control.py still exists"
