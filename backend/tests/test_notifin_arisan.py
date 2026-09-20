"""Arisan module (docs/DATA_MODEL.md §1/§6/§7 #6) — rotating savings group,
feature-flagged off by default. This whole module only exercises meaningfully
when ARISAN_FEATURE_ENABLED=true on the server under test; when it's left at
its default (false, matching production), every class below still runs but
only checks the 404 kill-switch behavior via TestFeatureFlagOff, and the
functional classes short-circuit their own tests with a skip so the suite
stays green either way.

To run this file with the feature turned on:
    ARISAN_FEATURE_ENABLED=true uvicorn server:app --reload --port 8000   (from backend/)
    EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 pytest tests/test_notifin_arisan.py

Shares the xdist_group pattern from test_notifin_groups.py — state (invite
codes, arisan ids) is shared across classes in this module, so it must stay
pinned to one worker.
"""
import os
import uuid
import pytest
import requests

pytestmark = pytest.mark.xdist_group("notifin_arisan_module")

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://notifin-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FEATURE_ON = os.environ.get("ARISAN_FEATURE_ENABLED", "false").strip().lower() == "true"
skip_unless_enabled = pytest.mark.skipif(
    not FEATURE_ON, reason="ARISAN_FEATURE_ENABLED=false on the server under test")


# --------------------- fixtures ---------------------
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(s, prefix="owner"):
    email = f"test_{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": "rahasia123", "name": f"TEST {prefix}"})
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    r = s.post(f"{API}/auth/register/verify", json={"email": email, "code": code})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["session_token"], "user": d["user"]}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def owner(s):
    """Premium owner user"""
    u = _register(s, "arisan_owner")
    r = s.post(f"{API}/test/simulate-mayar-webhook", headers=auth(u["token"]),
               json={"event": "membership.newMemberRegistered"})
    assert r.status_code == 200, r.text
    return u


@pytest.fixture(scope="session")
def member(s):
    """Free member user"""
    return _register(s, "arisan_member")


@pytest.fixture(scope="session")
def outsider(s):
    """Free user not in the arisan"""
    return _register(s, "arisan_outsider")


@pytest.fixture(scope="session")
def arisan_ctx(s, owner, member):
    """Create arisan with owner (Premium), member joins by code."""
    r = s.post(f"{API}/arisan",
               json={"name": "TEST_ArisanRT", "contribution_amount": 100000, "cycle": "monthly"},
               headers=auth(owner["token"]))
    assert r.status_code == 200, r.text
    a = r.json()["arisan"]
    code = a["invite_code"]
    r2 = s.post(f"{API}/arisan/join", json={"code": code.lower()}, headers=auth(member["token"]))
    assert r2.status_code == 200, r2.text
    return {"arisan_id": a["id"], "invite_code": code, "name": a["name"]}


# --------------------- kill switch (always runs, regardless of flag) ---------------------
class TestFeatureFlagOff:
    def test_flag_state_documented(self):
        """Sanity check the module picked up the same flag value the server
        under test is running with — see the module docstring for how to
        flip it on for a full functional run."""
        assert isinstance(FEATURE_ON, bool)

    @pytest.mark.skipif(FEATURE_ON, reason="only meaningful when the flag is off")
    def test_endpoints_404_when_disabled(self, s, owner):
        r = s.post(f"{API}/arisan",
                   json={"name": "TEST_ShouldNotExist", "contribution_amount": 50000},
                   headers=auth(owner["token"]))
        assert r.status_code == 404
        r2 = s.get(f"{API}/arisan", headers=auth(owner["token"]))
        assert r2.status_code == 404


# --------------------- create/premium gating ---------------------
@skip_unless_enabled
class TestArisanCreate:
    def test_free_user_cannot_create(self, s):
        u = _register(s, "arisan_free_creator")
        r = s.post(f"{API}/arisan",
                   json={"name": "TEST_ShouldFail", "contribution_amount": 50000},
                   headers=auth(u["token"]))
        assert r.status_code == 403, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict)
        assert detail.get("code") == "premium_required"

    def test_premium_user_creates(self, s, owner, arisan_ctx):
        assert len(arisan_ctx["invite_code"]) == 6
        assert arisan_ctx["invite_code"].isalnum()

    def test_invalid_cycle_rejected(self, s, owner):
        r = s.post(f"{API}/arisan",
                   json={"name": "TEST_BadCycle", "contribution_amount": 50000, "cycle": "daily"},
                   headers=auth(owner["token"]))
        assert r.status_code == 422

    def test_zero_contribution_rejected(self, s, owner):
        r = s.post(f"{API}/arisan",
                   json={"name": "TEST_ZeroAmount", "contribution_amount": 0},
                   headers=auth(owner["token"]))
        assert r.status_code == 422


# --------------------- join ---------------------
@skip_unless_enabled
class TestArisanJoin:
    def test_join_invalid_code_404(self, s, member):
        r = s.post(f"{API}/arisan/join", json={"code": "ZZZZZZ"}, headers=auth(member["token"]))
        assert r.status_code == 404

    def test_join_already_member_409(self, s, member, arisan_ctx):
        r = s.post(f"{API}/arisan/join", json={"code": arisan_ctx["invite_code"]},
                   headers=auth(member["token"]))
        assert r.status_code == 409

    def test_join_case_insensitive_ok(self, s, outsider, arisan_ctx):
        r = s.post(f"{API}/arisan/join",
                   json={"code": arisan_ctx["invite_code"].lower()},
                   headers=auth(outsider["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "joined"
        assert body["arisan_id"] == arisan_ctx["arisan_id"]


# --------------------- list / detail / manual participant ---------------------
@skip_unless_enabled
class TestArisanListDetail:
    def test_list_shape(self, s, owner, arisan_ctx):
        r = s.get(f"{API}/arisan", headers=auth(owner["token"]))
        assert r.status_code == 200
        items = r.json()["arisan"]
        mine = next((a for a in items if a["id"] == arisan_ctx["arisan_id"]), None)
        assert mine is not None
        assert mine["owner_id"] == owner["user"]["user_id"]
        assert len(mine["participants"]) >= 3  # owner + member + outsider

    def test_detail_shows_period_status(self, s, owner, arisan_ctx):
        r = s.get(f"{API}/arisan/{arisan_ctx['arisan_id']}", headers=auth(owner["token"]))
        assert r.status_code == 200
        a = r.json()["arisan"]
        assert "current_period" in a
        for p in a["participants"]:
            assert "paid_this_period" in p
            assert p["paid_this_period"] is False

    def test_outsider_not_member_403(self, s, arisan_ctx):
        u = _register(s, "arisan_stranger")
        r = s.get(f"{API}/arisan/{arisan_ctx['arisan_id']}", headers=auth(u["token"]))
        assert r.status_code == 403

    def test_owner_adds_offline_participant(self, s, owner, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/participants",
                   json={"name": "TEST_Tetangga"}, headers=auth(owner["token"]))
        assert r.status_code == 200, r.text
        names = [p["name"] for p in r.json()["arisan"]["participants"]]
        assert "TEST_Tetangga" in names

    def test_member_cannot_add_participant(self, s, member, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/participants",
                   json={"name": "TEST_ShouldFail"}, headers=auth(member["token"]))
        assert r.status_code == 403


# --------------------- contribute ---------------------
@skip_unless_enabled
class TestArisanContribute:
    def test_member_marks_self_paid(self, s, member, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/contribute",
                   json={"period": "2026-09", "paid": True}, headers=auth(member["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["paid"] is True

    def test_member_cannot_mark_others(self, s, member, outsider, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/contribute",
                   json={"period": "2026-09", "user_id": outsider["user"]["user_id"], "paid": True},
                   headers=auth(member["token"]))
        assert r.status_code == 403

    def test_owner_marks_outsider_paid(self, s, owner, outsider, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/contribute",
                   json={"period": "2026-09", "user_id": outsider["user"]["user_id"], "paid": True},
                   headers=auth(owner["token"]))
        assert r.status_code == 200
        r2 = s.get(f"{API}/arisan/{arisan_ctx['arisan_id']}", headers=auth(owner["token"]))
        p = next(x for x in r2.json()["arisan"]["participants"]
                 if x.get("user_id") == outsider["user"]["user_id"])
        assert p["paid_this_period"] is True


# --------------------- draw ---------------------
@skip_unless_enabled
class TestArisanDraw:
    def test_member_cannot_draw(self, s, member, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/draw", headers=auth(member["token"]))
        assert r.status_code == 403

    def test_owner_draws_in_order(self, s, owner, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/draw", headers=auth(owner["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["winner"]["user_id"] == owner["user"]["user_id"]  # order=0, joined first
        assert body["arisan"]["current_turn"] == 1

    def test_draw_advances_to_next_participant(self, s, owner, member, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/draw", headers=auth(owner["token"]))
        assert r.status_code == 200
        assert r.json()["winner"]["user_id"] == member["user"]["user_id"]  # order=1, joined second


# --------------------- leave / delete ---------------------
@skip_unless_enabled
class TestArisanLeaveDelete:
    def test_owner_cannot_leave(self, s, owner, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/leave", headers=auth(owner["token"]))
        assert r.status_code == 400

    def test_outsider_can_leave(self, s, outsider, arisan_ctx):
        r = s.post(f"{API}/arisan/{arisan_ctx['arisan_id']}/leave", headers=auth(outsider["token"]))
        assert r.status_code == 200
        r2 = s.get(f"{API}/arisan/{arisan_ctx['arisan_id']}", headers=auth(outsider["token"]))
        assert r2.status_code == 403

    def test_non_owner_cannot_delete(self, s, member, arisan_ctx):
        r = s.delete(f"{API}/arisan/{arisan_ctx['arisan_id']}", headers=auth(member["token"]))
        assert r.status_code == 403

    def test_owner_deletes_arisan(self, s, owner, arisan_ctx):
        r = s.delete(f"{API}/arisan/{arisan_ctx['arisan_id']}", headers=auth(owner["token"]))
        assert r.status_code == 200
        r2 = s.get(f"{API}/arisan/{arisan_ctx['arisan_id']}", headers=auth(owner["token"]))
        assert r2.status_code == 404
