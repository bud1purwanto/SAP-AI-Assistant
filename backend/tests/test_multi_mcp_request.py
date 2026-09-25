from models import ChatRequest


def test_chat_request_accepts_multi_connectors():
    req = ChatRequest(
        message="bandingkan",
        enabled_connectors=["sap", "sql", "rag"],
        sap_target="sandbox-new",
        sql_target="dev-223",
    )
    assert req.enabled_connectors == ["sap", "sql", "rag"]
    assert req.sap_target == "sandbox-new"
    assert req.sql_target == "dev-223"


def test_chat_request_defaults_to_none():
    req = ChatRequest(message="hello")
    assert req.enabled_connectors is None
    assert req.sap_target is None
    assert req.sql_target is None
