"""Pruebas de updater/wiki_tours.py y updater/wikitable.py (sin red): python -m unittest tools.test_wiki_tours  (o python tools/test_wiki_tours.py)"""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "updater"))
sys.path.insert(0, str(ROOT / "tools"))
import wiki_tours as W  # noqa: E402
import wikitable  # noqa: E402

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
TABLE = """{| class="wikitable plainrowheaders"
|+ List of concert dates
! scope="col" | Date
! scope="col" | City
! scope="col" | Country
! scope="col" | Venue
! scope="col" | Attendance
|-
! scope="row" | October 1, 2026
| [[Seoul]]
| South Korea
| [[KSPO Dome]]
| 10,000
|-
! scope="row" | November 19, 2026
| rowspan="2" | [[Kaohsiung]]{{Efn|nota}}
| rowspan="2" | Taiwan
| rowspan="2" | [[Kaohsiung National Stadium]]
| —
|-
! scope="row" | November 21, 2026<ref name="x">algo</ref>
| —
|-
! scope="row" | December 17, 2026
| colspan="2" | [[Singapore]]
| [[Singapore National Stadium|National Stadium]]
| —
|-
! scope="row" | January 9, 2027 {{small|(cancelled)}}
| [[Tokyo]]
| Japan
| [[Tokyo Dome]]
| —
|}"""


def group(events):
    return {"id": "bts", "name": "BTS", "events": events}


def ev(date, city, lat, lon, source=None, tz="+09:00", **extra):
    e = {"id": f"bts-{date}-{city}", "local_date": date, "start": f"{date}T18:00:00{tz}", "city": city, "country": "X", "venue": None,
         "lat": lat, "lon": lon, "status": "confirmado"}
    if source:
        e["source"] = source
    e.update(extra)
    return e


def geo_tokyo_kao(r):
    return {"Kaohsiung": {"city": "Kaohsiung", "country": "Taiwán", "lat": 22.62, "lon": 120.3, "tz": "Asia/Taipei", "venue": r.get("venue")},
            "Singapore": {"city": "Singapur", "country": "Singapur", "lat": 1.3, "lon": 103.87, "tz": "Asia/Singapore", "venue": r.get("venue")},
            "Tokyo": {"city": "Tokio", "country": "Japón", "lat": 35.7, "lon": 139.7, "tz": "Asia/Tokyo", "venue": r.get("venue")}}.get(r["city"])


class Parser(unittest.TestCase):
    def test_rows_rowspan_colspan_and_notes(self):
        rows = wikitable.parse_tables(TABLE)
        self.assertEqual([r["date"] for r in rows], ["2026-10-01", "2026-11-19", "2026-11-21", "2026-12-17", "2027-01-09"])
        self.assertEqual(rows[2]["city"], "Kaohsiung")          # rowspan: la ciudad sirve para las dos fechas
        self.assertEqual(rows[2]["venue"], "Kaohsiung National Stadium")
        self.assertEqual(rows[3]["city"], "Singapore")          # colspan: "Singapore" es ciudad y país
        self.assertEqual(rows[3]["country"], "Singapore")
        self.assertEqual(rows[3]["venue"], "National Stadium")
        self.assertTrue(rows[4]["cancelled"])
        self.assertFalse(rows[1]["cancelled"])

    def test_table_without_date_and_city_columns_is_ignored(self):
        self.assertEqual(wikitable.parse_tables('{| class="wikitable"\n! Year\n! Award\n|-\n| 2026\n| Best\n|}'), [])


class Reconcile(unittest.TestCase):
    def rows(self):
        return [r for r in wikitable.parse_tables(TABLE) if r["date"] >= "2026-11-03"]

    def run_rec(self, g, rows=None, ignore=()):
        return W.reconcile(g, self.rows() if rows is None else rows, geo_tokyo_kao, lambda r: "Arirang World Tour", NOW, set(ignore))

    def test_adds_missing_verifies_existing_and_skips_cancelled(self):
        g = group([ev("2026-11-19", "Kaohsiung", 22.62, 120.3, tz="+08:00")])
        res = self.run_rec(g)
        self.assertEqual(sorted(e["local_date"] for e in g["events"]), ["2026-11-19", "2026-11-21", "2026-12-17"])
        new = [e for e in g["events"] if e.get("source") == "wiki"]
        self.assertEqual({e["local_date"] for e in new}, {"2026-11-21", "2026-12-17"})
        self.assertTrue(all(e["status"] == "anunciado" and e["time_tbd"] and e["src_kind"] == "wiki" and e["src"].startswith("https://en.wikipedia.org/") for e in new))
        self.assertEqual(g["events"][0]["verified_by"], "wiki")  # el existente solo recibe la marca
        self.assertNotIn("source", g["events"][0])
        self.assertEqual(res["verified"], 1)
        self.assertFalse(any(e["local_date"] == "2027-01-09" for e in g["events"]))  # cancelado: no se agrega

    def test_new_show_takes_the_name_of_the_same_city(self):
        g = group([ev("2026-11-19", "Kaohsiung (Taiwán)", 22.62, 120.3, tz="+08:00")])
        self.run_rec(g)
        self.assertEqual([e["city"] for e in g["events"] if e["local_date"] == "2026-11-21"], ["Kaohsiung (Taiwán)"])

    def test_manual_dates_are_never_removed_but_drift_is_reported(self):
        g = group([ev("2026-11-19", "Kaohsiung", 22.62, 120.3, tz="+08:00"),
                   ev("2026-11-20", "Kaohsiung", 22.62, 120.3, tz="+08:00"),       # misma ciudad y Wikipedia no la lista: ¿se movió?
                   ev("2026-12-05", "Bangkok", 13.75, 100.5, tz="+07:00"),          # dentro de la gira y no listada: ¿se canceló?
                   ev("2027-06-01", "París", 48.8, 2.3, tz="+02:00")])              # fuera del rango de Wikipedia: normal, sin aviso
        res = self.run_rec(g)
        ids = {e["local_date"] for e in g["events"]}
        self.assertTrue({"2026-11-20", "2026-12-05", "2027-06-01"} <= ids)
        text = " ".join(res["drift"])
        self.assertIn("2026-11-20", text)
        self.assertIn("2026-12-05", text)
        self.assertNotIn("2027-06-01", text)

    def test_other_city_the_same_day_is_a_conflict_not_an_overwrite(self):
        g = group([ev("2026-11-19", "Tokio", 35.7, 139.7)])
        res = self.run_rec(g)
        self.assertEqual([e["city"] for e in g["events"] if e["local_date"] == "2026-11-19"], ["Tokio"])
        self.assertTrue(any("2026-11-19" in d for d in res["drift"]))

    def test_cancelled_in_wikipedia_flags_the_manual_date(self):
        g = group([ev("2027-01-09", "Tokio", 35.7, 139.7)])
        res = self.run_rec(g)
        self.assertTrue(any("cancelado" in d for d in res["drift"]))
        self.assertEqual(len(g["events"]) >= 1, True)

    def test_wiki_dates_that_disappear_are_removed(self):
        g = group([W.make_event("bts", {"date": "2026-11-25", "city": "Kaohsiung", "venue": None}, geo_tokyo_kao({"city": "Kaohsiung"}), "Arirang World Tour", NOW)])
        res = self.run_rec(g)
        self.assertFalse(any(e["local_date"] == "2026-11-25" for e in g["events"]))
        self.assertEqual(len(res["removed"]), 1)

    def test_mass_disappearance_is_not_applied(self):
        evs = [W.make_event("bts", {"date": f"2026-12-{d:02d}", "city": "Tokyo", "venue": None}, geo_tokyo_kao({"city": "Tokyo"}), "P", NOW) for d in range(10, 16)]
        g = group(evs)
        res = self.run_rec(g, rows=[])  # Wikipedia devolvió una tabla vacía
        self.assertEqual(len(g["events"]), 6)
        res = self.run_rec(g, rows=[r for r in self.rows() if r["city"] == "Kaohsiung"])
        self.assertEqual(len([e for e in g["events"] if e["id"].startswith("bts-wiki-202612")]), 6)
        self.assertTrue(any("no se quitó ninguna" in d for d in res["drift"]))

    def test_ignored_ids_are_not_added(self):
        g = group([])
        W.reconcile(g, self.rows(), geo_tokyo_kao, lambda r: "P", NOW, {"bts-wiki-20261117-kaohsiung", "bts-wiki-20261121-kaohsiung"})
        self.assertFalse(any(e["local_date"] == "2026-11-21" for e in g["events"]))

    def test_unplaced_city_is_reported_not_guessed(self):
        g = group([])
        res = W.reconcile(g, [{"date": "2026-12-01", "city": "Nowhere", "venue": None, "cancelled": False, "country": "X"}], lambda r: None, lambda r: "P", NOW, set())
        self.assertEqual(g["events"], [])
        self.assertEqual(len(res["unplaced"]), 1)

    def test_idempotent(self):
        g = group([ev("2026-11-19", "Kaohsiung", 22.62, 120.3, tz="+08:00")])
        self.run_rec(g)
        snap = json.dumps(g, sort_keys=True)
        for e in g["events"]:
            e.pop("verified_at", None)
        res = self.run_rec(g)
        self.assertEqual(res["added"], [])
        self.assertEqual(res["removed"], [])
        self.assertEqual(len(g["events"]), 3, snap)


class Discovery(unittest.TestCase):
    def test_candidates_are_tours_not_known_and_newest_first(self):
        text = "[[Old World Tour]] [[Album]] [[List of X tours]] [[New World Tour|new]] [[Known Tour]] [[Tour]]"
        self.assertEqual(W.candidate_titles(text, {W.norm("Known Tour")}), ["Tour", "New World Tour", "Old World Tour"])

    def test_about_group(self):
        self.assertTrue(W.about_group("'''Arirang''' is a tour by BTS.", ["BTS"]))
        self.assertFalse(W.about_group("A tour by somebody else about BTSX", ["BTS"]))


class FakeWiki:
    errors = 0

    def __init__(self, pages):
        self.pages = pages

    def revisions(self, titles, content):
        return {t: {"title": t, "revid": 7, **({"text": self.pages[t]} if content else {})} for t in titles if t in self.pages}

    def coords(self, titles):
        return {t: None for t in titles}


class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        events = {"updated_at": "x", "groups": [{"id": "bts", "name": "BTS", "tour": "T", "events": []}], "sources": []}
        (self.dir / "events.json").write_text(json.dumps(events), encoding="utf-8")
        (self.dir / "reg.json").write_text(json.dumps({"groups": {"bts": {"names": ["BTS"], "pages": [], "index": ["List of BTS live performances"]}}}), encoding="utf-8")
        self.old = (W.EVENTS, W.STATE, W.REGISTRY, W.OVERRIDES)
        W.EVENTS, W.STATE, W.REGISTRY, W.OVERRIDES = self.dir / "events.json", self.dir / "wiki.json", self.dir / "reg.json", self.dir / "none.json"
        self.status = W.report
        W.report = lambda *a, **k: None

    def tearDown(self):
        W.EVENTS, W.STATE, W.REGISTRY, W.OVERRIDES = self.old
        W.report = self.status
        self.tmp.cleanup()

    def test_discovers_a_new_tour_from_the_index_and_adds_its_dates(self):
        tour = "'''Arirang World Tour''' is a concert tour by BTS.\n" + TABLE.replace("Kaohsiung", "Taipei")
        pages = {"List of BTS live performances": "== Tours ==\n[[Arirang World Tour]]\n[[Other Band Tour]]", "Arirang World Tour": tour,
                 "Other Band Tour": "A tour by someone else.\n" + TABLE}
        W.run(NOW, FakeWiki(pages), force=True)
        state = json.loads((self.dir / "wiki.json").read_text(encoding="utf-8"))
        self.assertEqual(state["discovered"], {"bts": ["Arirang World Tour"]})
        self.assertIn("Other Band Tour", state["rejected"])
        data = json.loads((self.dir / "events.json").read_text(encoding="utf-8"))
        wiki = [e for g in data["groups"] for e in g["events"] if e.get("source") == "wiki"]
        self.assertEqual(sorted(e["local_date"] for e in wiki), ["2026-11-19", "2026-11-21", "2026-12-17"])
        self.assertTrue(any("Arirang" in s["name"] for s in data["sources"]))

    def test_queue_evaluates_a_few_candidates_per_run(self):
        names = [f"Old {i} World Tour" for i in range(6)]
        pages = {"List of BTS live performances": " ".join(f"[[{n}]]" for n in names)}
        pages.update({n: "A tour by BTS.\n" + TABLE.replace("Kaohsiung", "Taipei") if n == names[0] else "A tour by BTS in the past." for n in names})
        calls = []
        fw = FakeWiki(pages)
        orig = fw.revisions
        fw.revisions = lambda titles, content: calls.append(len(titles)) or orig(titles, content)
        W.run(NOW, fw, force=True)
        st = json.loads((self.dir / "wiki.json").read_text(encoding="utf-8"))
        self.assertEqual(len(st["rejected"]) + len(st.get("discovered", {}).get("bts", [])), W.MAX_CANDIDATES)
        self.assertEqual(sum(len(v) for v in st["pending"].values()), 2)
        W.run(NOW.replace(hour=15), fw)  # sin forzar: la cola sigue sola, el índice no se vuelve a leer
        st = json.loads((self.dir / "wiki.json").read_text(encoding="utf-8"))
        self.assertEqual(st["pending"], {})
        self.assertEqual(len(st["rejected"]) + len(st["discovered"]["bts"]), 6)

    def test_is_throttled(self):
        pages = {"List of BTS live performances": "x"}
        W.run(NOW, FakeWiki(pages), force=True)
        calls = []
        fw = FakeWiki(pages)
        fw.revisions = lambda *a, **k: calls.append(1) or {}
        W.run(NOW.replace(hour=13), fw)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
