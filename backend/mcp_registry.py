"""Resolve MCP control-plane endpoints from the enabled server registry."""

from urllib.parse import urlsplit, urlunsplit


def mcp_control_plane_base(server: str = "sap") -> str:
    from database import get_mcp_server

    row = get_mcp_server(server)
    if not row or not row.get("enabled") or not row.get("url"):
        raise RuntimeError(f"MCP server '{server}' belum aktif di registry.")
    parts = urlsplit(row["url"])
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise RuntimeError(f"URL MCP server '{server}' tidak valid.")
    prefix = parts.path.split("/v1/gateway", 1)[0].rstrip("/")
    return urlunsplit((parts.scheme, parts.netloc, prefix, "", "")).rstrip("/")
