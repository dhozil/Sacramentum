"""Integration tests: Sacramentum executed through real consensus.

Direct-mode tests pin the logic down in-process. These prove the same paths settle
when a real validator committee re-derives each decision, and that adjudication
converges with real web fetches and a real model call. They are excluded from the
default pytest run:

    gltest tests/integration -v -s --network studionet

    # including the ones that call real models, which take minutes each
    gltest tests/integration -v -s -m slow --network studionet

The guard rails live in this module rather than in a tests/integration/conftest.py
on purpose: this repository already has a tests/conftest.py, and two conftest files
in the same pytest run both import under the module name ``conftest``, which raises
an import-file-mismatch. One conftest, one set of rails.
"""

import itertools
import json
import os
import pathlib
import shutil
import sys
import time
from pathlib import Path

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT_SOURCE = REPO_ROOT / "contracts" / "sacramentum.py"
# Beside the real contract, because gltest resolves a contract path relative to its
# configured contracts directory and a file elsewhere is invisible to it.
STAGING = REPO_ROOT / "contracts" / ".integration"

_counter = itertools.count(1)

GEN = 10 ** 18
ESCROW = GEN // 100
TITLE = "Publish a versioned status page"
DELIVERY_URL = "https://example.com"
SOURCES = ["https://example.com"]
TERMS = json.dumps({
    "deliverable": "A public web page reachable over HTTPS that states a version number.",
    "criteria": [
        {"id": "C1", "text": "The deliverable URL is reachable over HTTPS."},
        {"id": "C2", "text": "The page contains readable text."},
    ],
})


# --------------------------------------------------------------- guard rails


def _rpc_url() -> str:
    override = os.environ.get("GENLAYER_RPC")
    if override:
        return override
    try:
        from gltest_cli.config.general import get_general_config

        url = get_general_config().get_rpc_url()
        if url:
            return str(url)
    except Exception:
        pass
    return "https://studio.genlayer.com/api"


def _post(url: str, method: str, params: list, timeout: float = 20.0):
    import requests

    response = requests.post(
        url,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def _reachable(url: str, timeout: float = 15.0) -> bool:
    try:
        payload = _post(url, "eth_chainId", [], timeout=timeout)
    except Exception:
        return False
    return "result" in payload


def staged_contract() -> str:
    """A fresh copy of the contract per deploy, relative to the contracts dir.

    A local simulator's engine only honours ``@allow_storage`` on a module it has
    not already loaded, so a repeated deploy of one file fails for reasons that have
    nothing to do with the contract. On Studionet the extra comment is harmless.
    """
    tag = next(_counter)
    STAGING.mkdir(parents=True, exist_ok=True)
    target = STAGING / f"sacramentum_{tag}.py"
    shutil.copyfile(CONTRACT_SOURCE, target)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(f"\n# integration deploy {tag}: a unique source, so the engine loads a fresh module\n")
    return str(target.relative_to(REPO_ROOT / "contracts"))


@pytest.fixture(scope="session", autouse=True)
def require_genlayer_network():
    # genlayer-test reaches Studionet through `requests`; a hand-rolled urllib probe
    # hits Cloudflare error 1010 in front of studio.genlayer.com. This uses requests.
    if pathlib.Path(sys.argv[0]).stem.lower() != "gltest":
        pytest.skip(
            "These run through the gltest CLI, which loads gltest.config.yaml and picks"
            " the network. Plain pytest cannot deploy in Studio mode:\n\n"
            "  gltest tests/integration -v -s --network studionet\n"
        )
    url = _rpc_url()
    if not _reachable(url):
        pytest.skip(
            f"No GenLayer node answered at {url}. Point the suite at one:\n"
            "  gltest tests/integration -v -s --network studionet\n"
            "Or a local node with GENLAYER_RPC=http://127.0.0.1:4000/api"
        )
    yield
    shutil.rmtree(STAGING, ignore_errors=True)


# ------------------------------------------------------------------- helpers


def deadline_unix(days: int = 7) -> int:
    return int(time.time()) + days * 86400


def deploy_sacramentum(account):
    """Deploy and return a handle that really has methods on it.

    genlayer-test builds the handle's methods from a schema it fetches over RPC
    through a fallback chain; against some nodes that fetch comes back empty and the
    handle has no methods. Building from the factory's schema directly is the same
    construction without the fallback chain, and the assertion turns a schema
    problem into a clear message rather than a confusing missing attribute later.
    """
    from gltest.contracts.contract import Contract
    from gltest.utils import extract_contract_address

    factory = get_contract_factory(contract_file_path=staged_contract())
    receipt = factory.deploy_contract_tx(args=[], account=account)
    schema = factory._get_schema_with_fallback()
    if not isinstance(schema, dict) or not schema.get("methods"):
        raise AssertionError("gltest produced no contract schema, so no method can be called")
    contract = Contract.new(address=extract_contract_address(receipt), schema=schema, account=account)
    assert hasattr(contract, "open_deal"), "the deployed contract has no open_deal"
    return contract


def as_account(contract, account):
    """The same contract reached from a different sender.

    genlayer-test binds the account to the handle instead of taking it per call, so a
    write from a second party needs a second handle. Reusing the schema the handle
    already carries avoids another RPC round trip against a rate-limited node.
    """
    from gltest.contracts.contract import Contract

    return Contract.new(address=contract.address, schema=contract._schema, account=account)


def open_and_fund(buyer, seller_address, escrow=ESCROW):
    """Open deal d1 and fund it. Deal ids are deterministic (d1, d2, ...)."""
    opened = buyer.open_deal(args=[seller_address, TITLE, TERMS, deadline_unix(), SOURCES]).transact()
    assert tx_execution_succeeded(opened)
    funded = buyer.fund_deal(args=["d1"]).transact(value=escrow)
    assert tx_execution_succeeded(funded)
    return "d1"


def stats(contract):
    return json.loads(contract.get_stats().call())


def deal(contract, deal_id="d1"):
    return json.loads(contract.get_deal(args=[deal_id]).call())


# -------------------------------------------------------------------- no LLM


def test_deploy_open_and_fund(default_account, accounts):
    buyer = deploy_sacramentum(default_account)
    seller = accounts[1]
    deal_id = open_and_fund(buyer, seller.address)

    view = deal(buyer, deal_id)
    assert view["status"] == "FUNDED"
    assert view["escrow_atto"] == str(ESCROW)
    assert view["buyer"].lower() == default_account.address.lower()
    assert view["seller"].lower() == seller.address.lower()
    assert buyer.get_deal_count().call() == 1
    assert stats(buyer)["conserved"] is True


def test_invalid_terms_are_rejected(default_account, accounts):
    buyer = deploy_sacramentum(default_account)
    rejected = buyer.open_deal(
        args=[accounts[1].address, TITLE, '{"criteria": []}', deadline_unix(), SOURCES]
    ).transact()
    assert not tx_execution_succeeded(rejected)
    assert buyer.get_deal_count().call() == 0


def test_happy_path_releases_the_escrow(default_account, accounts):
    buyer = deploy_sacramentum(default_account)
    seller = as_account(buyer, accounts[1])
    deal_id = open_and_fund(buyer, accounts[1].address)

    assert tx_execution_succeeded(seller.accept_deal(args=[deal_id]).transact())
    assert tx_execution_succeeded(seller.submit_delivery(args=[deal_id, DELIVERY_URL, "v1 is live"]).transact())
    assert tx_execution_succeeded(buyer.confirm_delivery(args=[deal_id]).transact())

    view = deal(buyer, deal_id)
    assert view["status"] == "RELEASED"
    assert view["outcome"] == "COMPLIANT"
    report = stats(buyer)
    assert report["held_atto"] == "0"
    assert report["total_released_atto"] == str(ESCROW)
    assert report["conserved"] is True


def test_cancel_refunds_the_buyer(default_account, accounts):
    buyer = deploy_sacramentum(default_account)
    deal_id = open_and_fund(buyer, accounts[1].address)
    assert tx_execution_succeeded(buyer.cancel_deal(args=[deal_id]).transact())

    view = deal(buyer, deal_id)
    assert view["status"] == "REFUNDED"
    report = stats(buyer)
    assert report["held_atto"] == "0"
    assert report["total_refunded_atto"] == str(ESCROW)
    assert report["conserved"] is True


def test_dispute_and_two_party_evidence(default_account, accounts):
    buyer = deploy_sacramentum(default_account)
    seller = as_account(buyer, accounts[1])
    deal_id = open_and_fund(buyer, accounts[1].address)

    assert tx_execution_succeeded(seller.accept_deal(args=[deal_id]).transact())
    assert tx_execution_succeeded(seller.submit_delivery(args=[deal_id, DELIVERY_URL, "v1 is live"]).transact())
    assert tx_execution_succeeded(buyer.raise_dispute(args=[deal_id, "the version number is missing"]).transact())
    assert tx_execution_succeeded(buyer.submit_evidence(args=[deal_id, DELIVERY_URL, "I cannot see a version"]).transact())
    assert tx_execution_succeeded(seller.submit_evidence(args=[deal_id, DELIVERY_URL, "the version is in the footer"]).transact())

    view = deal(buyer, deal_id)
    assert view["status"] == "DISPUTED"
    audit = json.loads(buyer.get_deal_audit(args=[deal_id]).call())
    assert len(audit["evidence"]) == 2
    assert audit["sources"] == SOURCES


# ------------------------------------------------------------------ consensus


@pytest.mark.slow
def test_resolve_settles_by_real_consensus(default_account, accounts):
    """The load-bearing integration test: real web fetch, real model call, and a real
    leader/validator round. If the committee disagrees, the transaction fails."""
    buyer = deploy_sacramentum(default_account)
    seller = as_account(buyer, accounts[1])
    deal_id = open_and_fund(buyer, accounts[1].address)

    assert tx_execution_succeeded(seller.accept_deal(args=[deal_id]).transact())
    assert tx_execution_succeeded(seller.submit_delivery(args=[deal_id, DELIVERY_URL, "v1 is live"]).transact())
    assert tx_execution_succeeded(buyer.raise_dispute(args=[deal_id, "does this satisfy the terms?"]).transact())
    assert tx_execution_succeeded(buyer.submit_evidence(args=[deal_id, DELIVERY_URL, "buyer notes"]).transact())
    assert tx_execution_succeeded(seller.submit_evidence(args=[deal_id, DELIVERY_URL, "seller notes"]).transact())

    resolved = buyer.resolve(args=[deal_id]).transact()
    assert tx_execution_succeeded(resolved)

    view = deal(buyer, deal_id)
    # Either a verdict was reached (RESOLVED) or the committee could read the page
    # but not commit to one (UNDETERMINED keeps the dispute open).
    assert view["status"] in ("RESOLVED", "DISPUTED")
    assert view["outcome"] in ("COMPLIANT", "NON_COMPLIANT", "PARTIAL", "UNDETERMINED")
    assert stats(buyer)["conserved"] is True
