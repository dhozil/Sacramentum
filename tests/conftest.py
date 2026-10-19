"""Shared fixtures and helpers for the direct-mode test suite."""

import json
from datetime import datetime, timedelta, timezone

import pytest

GEN = 10 ** 18
CONTRACT = "contracts/sacramentum.py"
BASE_DT = datetime(2031, 3, 1, 0, 0, 0, tzinfo=timezone.utc)
BASE_ISO = BASE_DT.isoformat()

# The contract's adjudication prompt opens with this marker; tests mock on it.
ADJUDICATION_PATTERN = r"You are the neutral adjudication panel"
SOURCE_PATTERN = r"example\.org"


def hx(address) -> str:
    """Normalise a fixture address (Address or bytes) to a 0x hex string."""
    if hasattr(address, "as_bytes"):
        return "0x" + address.as_bytes.hex()
    if isinstance(address, bytes):
        return "0x" + address.hex()
    return str(address)


def ts(dt: datetime) -> int:
    return int(dt.timestamp())


def deadline(days: int = 7) -> int:
    return ts(BASE_DT + timedelta(days=days))


def terms_json(criteria=None, deliverable="A working public API with docs.") -> str:
    criteria = criteria or [
        {"id": "C1", "text": "The deliverable is publicly reachable over HTTPS."},
        {"id": "C2", "text": "The deliverable matches the agreed specification."},
        {"id": "C3", "text": "Documentation is included."},
    ]
    return json.dumps({"deliverable": deliverable, "criteria": criteria}, sort_keys=True)


def mock_source(vm, body="published", status=200, pattern=SOURCE_PATTERN):
    vm.mock_web(pattern, {"status": status, "body": body})


def mock_adjudication(vm, outcome, release_bps=0, satisfied=None, unsatisfied=None,
                      rationale="judged against the terms", confidence=90, pattern=ADJUDICATION_PATTERN):
    vm.mock_llm(pattern, json.dumps({
        "outcome": outcome,
        "release_bps": release_bps,
        "satisfied_criteria": satisfied if satisfied is not None else [],
        "unsatisfied_criteria": unsatisfied if unsatisfied is not None else [],
        "rationale": rationale,
        "confidence": confidence,
    }))


@pytest.fixture
def warp(direct_vm):
    direct_vm.warp(BASE_ISO)
    return direct_vm


def open_deal(vm, contract, seller_hex, escrow=10 * GEN, sources=None, title="Build the widget API"):
    """Open and fund a deal. The current vm.sender must already be the buyer."""
    sources = sources or ["https://example.org/spec"]
    deal_id = contract.open_deal(seller_hex, title, terms_json(), deadline(), sources)
    vm.value = escrow
    contract.fund_deal(deal_id)
    vm.value = 0
    return deal_id


def bring_to_dispute(vm, contract, deal_id, buyer, seller, both_evidence=True):
    """Drive a funded deal through accept, deliver and dispute, filing evidence."""
    vm.sender = seller
    contract.accept_deal(deal_id)
    contract.submit_delivery(deal_id, "https://example.org/delivery", "shipped v1")
    vm.sender = buyer
    contract.raise_dispute(deal_id, "the API is not reachable")
    contract.submit_evidence(deal_id, "https://example.org/buyer-evidence", "I could not reach it")
    if both_evidence:
        vm.sender = seller
        contract.submit_evidence(deal_id, "https://example.org/seller-evidence", "it is reachable")
    vm.sender = buyer
