"""Direct-mode tests for the Sacramentum escrow tribunal contract.

These run the contract in-process with mocked web and LLM calls. They cover
business logic, validation, money conservation and the leader function. The
validator comparison logic is exercised through direct_vm.run_validator().
"""

import json
import sys

import pytest

from conftest import (
    CONTRACT,
    GEN,
    bring_to_dispute,
    deadline,
    hx,
    mock_adjudication,
    mock_source,
    open_deal,
    terms_json,
    ts,
)
from datetime import timedelta

from conftest import BASE_DT


def stats(contract):
    return json.loads(contract.get_stats())


def deal(contract, deal_id):
    return json.loads(contract.get_deal(deal_id))


def audit(contract, deal_id):
    return json.loads(contract.get_deal_audit(deal_id))


def verdict(contract, deal_id):
    return json.loads(contract.get_verdict(deal_id))


# ---------------------------------------------------------------- deal open


def test_open_deal_records_terms_and_sources(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = contract.open_deal(hx(direct_bob), "Build the widget API", terms_json(), deadline(), ["https://example.org/spec"])

    view = deal(contract, deal_id)
    assert view["status"] == "OPEN"
    assert view["buyer"].lower() == hx(direct_alice).lower()
    assert view["seller"].lower() == hx(direct_bob).lower()
    assert len(view["terms_digest"]) == 64
    canonical = json.dumps(json.loads(terms_json()), sort_keys=True, separators=(",", ":"))
    assert contract.get_terms(deal_id) == canonical
    assert audit(contract, deal_id)["sources"] == ["https://example.org/spec"]
    assert contract.get_deal_ids() == json.dumps([deal_id])
    assert contract.get_deal_count() == 1


def test_open_deal_rejects_invalid_terms(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("terms_json must be a JSON object"):
        contract.open_deal(hx(direct_bob), "t", "[1,2,3]", deadline(), ["https://example.org/a"])
    with direct_vm.expect_revert("terms must name a deliverable"):
        contract.open_deal(hx(direct_bob), "t", json.dumps({"criteria": [{"id": "C1", "text": "x"}]}), deadline(), ["https://example.org/a"])
    with direct_vm.expect_revert("at least one criterion"):
        contract.open_deal(hx(direct_bob), "t", json.dumps({"deliverable": "d", "criteria": []}), deadline(), ["https://example.org/a"])
    with direct_vm.expect_revert("duplicate criterion id"):
        contract.open_deal(
            hx(direct_bob), "t",
            json.dumps({"deliverable": "d", "criteria": [{"id": "C1", "text": "a"}, {"id": "C1", "text": "b"}]}),
            deadline(), ["https://example.org/a"],
        )


def test_open_deal_rejects_bad_sources(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("must start with https://"):
        contract.open_deal(hx(direct_bob), "t", terms_json(), deadline(), ["http://insecure.example.org"])
    with direct_vm.expect_revert("at most 3 evidence sources"):
        contract.open_deal(
            hx(direct_bob), "t", terms_json(), deadline(),
            ["https://a.example.org", "https://b.example.org", "https://c.example.org", "https://d.example.org"],
        )


def test_open_deal_rejects_past_deadline_and_self_dealing(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("deadline must be in the future"):
        contract.open_deal(hx(direct_bob), "t", terms_json(), ts(BASE_DT), ["https://example.org/a"])
    with direct_vm.expect_revert("buyer and seller must differ"):
        contract.open_deal(hx(direct_alice), "t", terms_json(), deadline(), ["https://example.org/a"])


# ---------------------------------------------------------------- funding


def test_fund_requires_buyer_and_value(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = contract.open_deal(hx(direct_bob), "t", terms_json(), deadline(), ["https://example.org/a"])

    with direct_vm.expect_revert("must be called with GEN value"):
        contract.fund_deal(deal_id)

    with direct_vm.prank(direct_bob):
        direct_vm.value = GEN
        with direct_vm.expect_revert("only the buyer may fund"):
            contract.fund_deal(deal_id)
        direct_vm.value = 0

    direct_vm.value = 10 * GEN
    contract.fund_deal(deal_id)
    direct_vm.value = 0
    assert deal(contract, deal_id)["status"] == "FUNDED"
    assert deal(contract, deal_id)["escrow_atto"] == str(10 * GEN)

    direct_vm.value = GEN
    with direct_vm.expect_revert("is not open"):
        contract.fund_deal(deal_id)
    direct_vm.value = 0


# ---------------------------------------------------------------- delivery


def test_accept_and_delivery_guards(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))

    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("only the seller may accept"):
            contract.accept_deal(deal_id)

    direct_vm.sender = direct_bob
    contract.accept_deal(deal_id)
    assert deal(contract, deal_id)["status"] == "ACCEPTED"

    with direct_vm.expect_revert("delivery_url must start with https://"):
        contract.submit_delivery(deal_id, "http://x.example.org", "note")

    contract.submit_delivery(deal_id, "https://example.org/delivery", "shipped v1")
    assert deal(contract, deal_id)["status"] == "DELIVERED"


def test_confirm_delivery_releases_full_to_seller(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    direct_vm.sender = direct_bob
    contract.accept_deal(deal_id)
    contract.submit_delivery(deal_id, "https://example.org/delivery", "shipped")

    direct_vm.sender = direct_alice
    contract.confirm_delivery(deal_id)
    view = deal(contract, deal_id)
    assert view["status"] == "RELEASED"
    assert view["outcome"] == "COMPLIANT"
    assert view["release_bps"] == 10000
    report = stats(contract)
    assert report["held_atto"] == "0"
    assert report["total_released_atto"] == str(10 * GEN)
    assert report["conserved"] is True


def test_cancel_refunds_buyer(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    contract.cancel_deal(deal_id)
    view = deal(contract, deal_id)
    assert view["status"] == "REFUNDED"
    report = stats(contract)
    assert report["total_refunded_atto"] == str(10 * GEN)
    assert report["conserved"] is True
    with direct_vm.expect_revert("cannot be cancelled"):
        contract.cancel_deal(deal_id)


# ---------------------------------------------------------------- dispute


def test_only_a_party_may_dispute_and_window_closes(warp, direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    direct_vm.sender = direct_bob
    contract.accept_deal(deal_id)
    contract.submit_delivery(deal_id, "https://example.org/delivery", "shipped")

    with direct_vm.prank(direct_charlie):
        with direct_vm.expect_revert("only a party to the deal"):
            contract.raise_dispute(deal_id, "not mine")

    direct_vm.warp((BASE_DT + timedelta(seconds=4000)).isoformat())
    with direct_vm.expect_revert("dispute window for"):
        contract.raise_dispute(deal_id, "too late")


def test_resolve_requires_evidence_window_to_close(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob, both_evidence=False)
    with direct_vm.expect_revert("evidence window is still open"):
        contract.resolve(deal_id)

    direct_vm.warp((BASE_DT + timedelta(seconds=1900)).isoformat())
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "COMPLIANT", 10000, satisfied=["C1", "C2", "C3"])
    contract.resolve(deal_id)
    assert deal(contract, deal_id)["status"] == "RESOLVED"


def test_resolve_compliant_releases_on_finalize(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "COMPLIANT", 10000, satisfied=["C1", "C2", "C3"], rationale="all criteria met")
    contract.resolve(deal_id)

    view = deal(contract, deal_id)
    assert view["outcome"] == "COMPLIANT"
    assert view["release_bps"] == 10000
    assert audit(contract, deal_id)["rationale"] == "all criteria met"

    with direct_vm.expect_revert("appeal window for"):
        contract.finalize(deal_id)

    direct_vm.warp((BASE_DT + timedelta(seconds=4000)).isoformat())
    contract.finalize(deal_id)
    report = stats(contract)
    assert report["held_atto"] == "0"
    assert report["total_released_atto"] == str(10 * GEN)
    assert report["conserved"] is True


def test_resolve_non_compliant_refunds_buyer(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "NON_COMPLIANT", 0, unsatisfied=["C1", "C2", "C3"])
    contract.resolve(deal_id)
    direct_vm.warp((BASE_DT + timedelta(seconds=4000)).isoformat())
    contract.finalize(deal_id)
    report = stats(contract)
    assert report["total_refunded_atto"] == str(10 * GEN)
    assert report["held_atto"] == "0"
    assert report["conserved"] is True


def test_resolve_partial_splits_the_escrow(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "PARTIAL", 5000, satisfied=["C1"], unsatisfied=["C2", "C3"])
    contract.resolve(deal_id)
    view = deal(contract, deal_id)
    assert view["outcome"] == "PARTIAL"
    assert view["release_bps"] == 5000

    direct_vm.warp((BASE_DT + timedelta(seconds=4000)).isoformat())
    contract.finalize(deal_id)
    report = stats(contract)
    assert report["total_released_atto"] == str(5 * GEN)
    assert report["total_refunded_atto"] == str(5 * GEN)
    assert report["held_atto"] == "0"
    assert report["conserved"] is True


def test_partial_landing_on_an_endpoint_is_normalised(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    # A model that says PARTIAL with 10000 bps is really saying COMPLIANT.
    mock_adjudication(direct_vm, "PARTIAL", 10000)
    contract.resolve(deal_id)
    assert deal(contract, deal_id)["outcome"] == "COMPLIANT"
    assert deal(contract, deal_id)["release_bps"] == 10000


def test_model_numeric_fields_are_coerced_to_int(warp, direct_vm, direct_deploy):
    """A model may hand release_bps/confidence back as floats, and GenVM rejects a
    float operand in an integer op. The helpers must coerce to int first, so the
    result is an int and not a float. In native Python the float//int still runs, so
    the return *type* is what catches a missing coercion."""
    direct_deploy(CONTRACT)
    module = sys.modules["_contract_sacramentum"]
    assert type(module._quantize_bps(5500.7)) is int
    assert module._quantize_bps(5500.7) == 5500
    assert type(module._confidence_bucket(83.2)) is int
    assert module._confidence_bucket(83.2) == 4


def test_resolve_undetermined_keeps_the_dispute_open(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm, body="the page exists but says nothing useful")
    mock_adjudication(direct_vm, "UNDETERMINED", 0, rationale="could not tell from the evidence")
    contract.resolve(deal_id)
    view = deal(contract, deal_id)
    assert view["status"] == "DISPUTED"
    assert view["outcome"] == "UNDETERMINED"

    # A later resolve can still judge, once the source is reachable.
    direct_vm.clear_mocks()
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "COMPLIANT", 10000)
    contract.resolve(deal_id)
    assert deal(contract, deal_id)["status"] == "RESOLVED"


# ---------------------------------------------------------------- validator


def test_validator_agrees_on_the_same_decision(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "COMPLIANT", 10000, satisfied=["C1"])
    contract.resolve(deal_id)
    assert direct_vm.run_validator() is True


def test_validator_rejects_a_different_outcome(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "COMPLIANT", 10000)
    contract.resolve(deal_id)
    direct_vm.clear_mocks()
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "NON_COMPLIANT", 0)
    assert direct_vm.run_validator() is False


def test_validator_tolerates_a_release_bps_bucket(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "PARTIAL", 5000, confidence=90)
    contract.resolve(deal_id)
    direct_vm.clear_mocks()
    mock_source(direct_vm)
    # Same outcome, one bucket away and a different confidence bucket: still acceptable.
    mock_adjudication(direct_vm, "PARTIAL", 5500, confidence=70, rationale="different wording entirely")
    assert direct_vm.run_validator() is True


def test_validator_rejects_garbage_model_output(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "COMPLIANT", 10000)
    contract.resolve(deal_id)
    direct_vm.clear_mocks()
    mock_source(direct_vm)
    direct_vm.mock_llm(r"You are the neutral adjudication panel", "I am not JSON at all")
    assert direct_vm.run_validator() is False


def test_validator_agrees_when_both_fail_transiently(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "COMPLIANT", 10000)
    contract.resolve(deal_id)
    direct_vm.clear_mocks()
    mock_source(direct_vm, status=503)
    verdict = direct_vm.run_validator(
        leader_error=Exception("[TRANSIENT] source returned 503: https://example.org/spec")
    )
    assert verdict is True


def test_validator_rejects_when_it_cannot_verify_the_leader(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    bring_to_dispute(direct_vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "COMPLIANT", 10000)
    contract.resolve(deal_id)
    direct_vm.clear_mocks()
    mock_source(direct_vm, status=503)
    assert direct_vm.run_validator() is False


# ---------------------------------------------------------------- appeal


def _resolved(vm, contract, direct_alice, direct_bob, outcome="COMPLIANT", bps=10000):
    vm.sender = direct_alice
    deal_id = open_deal(vm, contract, hx(direct_bob))
    bring_to_dispute(vm, contract, deal_id, direct_alice, direct_bob)
    mock_source(vm)
    mock_adjudication(vm, outcome, bps)
    contract.resolve(deal_id)
    return deal_id


def test_get_verdict_exposes_the_first_round(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    deal_id = _resolved(direct_vm, contract, direct_alice, direct_bob, "PARTIAL", 5000)

    report = verdict(contract, deal_id)
    assert report["outcome"] == "PARTIAL"
    assert report["equivalence"]["principle"].startswith("Optimistic Democracy")
    assert report["equivalence"]["release_bps"]["bucket_width_bps"] == 500
    assert len(report["rounds"]) == 1
    first = report["rounds"][0]
    assert first["round"] == "first"
    assert first["outcome"] == "PARTIAL"
    assert first["release_bps"] == 5000
    assert first["release_bucket"] == 5000
    assert first["confidence"] == 90
    assert first["confidence_bucket"] == 4
    assert first["evidence_chars"] > 0
    assert len(first["evidence_digest"]) == 64
    assert first["model_output"]


def test_get_verdict_records_both_rounds_after_an_appeal(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    deal_id = _resolved(direct_vm, contract, direct_alice, direct_bob, "COMPLIANT", 10000)

    required = 10 * GEN * 2500 // 10000
    direct_vm.sender = direct_alice
    direct_vm.value = required
    contract.appeal(deal_id)
    direct_vm.value = 0

    direct_vm.clear_mocks()
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "NON_COMPLIANT", 0)
    contract.resolve_appeal(deal_id)

    report = verdict(contract, deal_id)
    assert report["final"] is True
    assert report["appeal_decided"] is True
    assert [entry["round"] for entry in report["rounds"]] == ["first", "appeal"]
    assert report["rounds"][0]["outcome"] == "COMPLIANT"
    assert report["rounds"][1]["outcome"] == "NON_COMPLIANT"


def test_appeal_requires_a_bond(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    deal_id = _resolved(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob  # the seller lost a COMPLIANT? no: buyer won full release, so seller appeals
    with direct_vm.expect_revert("appeal bond must be at least"):
        direct_vm.value = 1
        contract.appeal(deal_id)
        direct_vm.value = 0


def test_appeal_bond_returned_when_appellant_wins(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    # First verdict: seller fully paid. Buyer appeals, wins a full refund.
    deal_id = _resolved(direct_vm, contract, direct_alice, direct_bob, "COMPLIANT", 10000)
    required = 10 * GEN * 2500 // 10000

    direct_vm.sender = direct_alice
    direct_vm.value = required
    contract.appeal(deal_id)
    direct_vm.value = 0
    assert deal(contract, deal_id)["status"] == "APPEALED"
    assert deal(contract, deal_id)["appeal_bond_atto"] == str(required)

    direct_vm.clear_mocks()
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "NON_COMPLIANT", 0)
    contract.resolve_appeal(deal_id)
    view = deal(contract, deal_id)
    assert view["final"] is True
    assert view["outcome"] == "NON_COMPLIANT"

    contract.finalize(deal_id)
    report = stats(contract)
    assert report["held_atto"] == "0"
    assert report["total_refunded_atto"] == str(10 * GEN)  # escrow back to buyer
    assert report["conserved"] is True


def test_appeal_bond_forfeited_when_appellant_loses(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    # First verdict: buyer refunded. Seller appeals and loses again.
    deal_id = _resolved(direct_vm, contract, direct_alice, direct_bob, "NON_COMPLIANT", 0)
    required = 10 * GEN * 2500 // 10000

    direct_vm.sender = direct_bob
    direct_vm.value = required
    contract.appeal(deal_id)
    direct_vm.value = 0

    direct_vm.clear_mocks()
    mock_source(direct_vm)
    mock_adjudication(direct_vm, "NON_COMPLIANT", 0)
    contract.resolve_appeal(deal_id)
    contract.finalize(deal_id)
    report = stats(contract)
    # Escrow refunded to the buyer; the forfeited bond also lands on the buyer.
    assert report["held_atto"] == "0"
    assert report["total_refunded_atto"] == str(10 * GEN)
    assert report["lifetime_outflow_atto"] == str(10 * GEN + required)
    assert report["conserved"] is True


def test_appeal_window_closes(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    deal_id = _resolved(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.warp((BASE_DT + timedelta(seconds=4000)).isoformat())
    direct_vm.sender = direct_bob
    direct_vm.value = 10 * GEN
    with direct_vm.expect_revert("appeal window for"):
        contract.appeal(deal_id)
    direct_vm.value = 0


def test_finalize_runs_without_an_appeal(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    deal_id = _resolved(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.warp((BASE_DT + timedelta(seconds=4000)).isoformat())
    contract.finalize(deal_id)
    assert deal(contract, deal_id)["status"] == "FINALIZED"
    with direct_vm.expect_revert("no standing verdict"):
        contract.finalize(deal_id)


# ---------------------------------------------------------------- timeout


def test_claim_timeout_refunds_when_the_deadline_is_missed(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    with direct_vm.expect_revert("deadline for"):
        contract.claim_timeout(deal_id)
    direct_vm.warp((BASE_DT + timedelta(days=8)).isoformat())
    contract.claim_timeout(deal_id)
    assert deal(contract, deal_id)["status"] == "REFUNDED"
    assert stats(contract)["conserved"] is True


def test_claim_timeout_releases_an_undisputed_delivery(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    deal_id = open_deal(direct_vm, contract, hx(direct_bob))
    direct_vm.sender = direct_bob
    contract.accept_deal(deal_id)
    contract.submit_delivery(deal_id, "https://example.org/delivery", "shipped")

    with direct_vm.expect_revert("dispute window for"):
        contract.claim_timeout(deal_id)
    direct_vm.warp((BASE_DT + timedelta(seconds=4000)).isoformat())
    contract.claim_timeout(deal_id)
    view = deal(contract, deal_id)
    assert view["status"] == "RELEASED"
    assert view["outcome"] == "COMPLIANT"
    assert stats(contract)["conserved"] is True


def test_claim_timeout_cannot_be_used_from_a_resolved_deal(warp, direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    deal_id = _resolved(direct_vm, contract, direct_alice, direct_bob)
    with direct_vm.expect_revert("cannot be claimed from RESOLVED"):
        contract.claim_timeout(deal_id)
