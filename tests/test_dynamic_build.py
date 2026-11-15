import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "work"))

from automation.statistics import update_snapshot

TEST_TIMEOUT_SECONDS = 60
NEW_PERIOD = {"start": "2026-04", "end": "2027-03"}
BREAK_IN = "Break and enter dwelling"


def updated_snapshot():
    snapshot = json.loads((ROOT / "work" / "crime_data.json").read_text(encoding="utf-8"))
    counts = {row["source"]: dict(row["counts"]) for row in snapshot["rows"] if row["source"]}
    counts["Blacktown"][BREAK_IN] += 1
    return update_snapshot(snapshot, {"labels": snapshot["labels"], "counts": counts})


def run_build(root):
    commands = (("node", "work/build_suburb_view.mjs"), ("node", "work/build-seo.mjs"),
                ("node", "work/test-seo-language.mjs"), (sys.executable, "work/validate-seo.py"))
    for command in commands:
        subprocess.run(command, cwd=root, check=True, timeout=TEST_TIMEOUT_SECONDS, capture_output=True)


class DynamicBuildTests(unittest.TestCase):
    def test_new_period_and_changed_counts_flow_through_bilingual_site(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            shutil.copytree(ROOT / "work", root / "work")
            (root / "outputs").mkdir()
            data = updated_snapshot()
            expected_count = next(row for row in data["rows"] if row["name"] == "Blacktown")["counts"][BREAK_IN]
            (root / "work" / "crime_data.json").write_text(
                json.dumps(data, ensure_ascii=False), encoding="utf-8")
            (root / "work" / "crime_period.json").write_text(json.dumps(NEW_PERIOD), encoding="utf-8")
            run_build(root)
            site = root / "outputs" / "sydney-crime-seo"
            chinese = (site / "suburbs" / "blacktown" / "index.html").read_text(encoding="utf-8")
            english = (site / "en" / "suburbs" / "blacktown" / "index.html").read_text(encoding="utf-8")
            self.assertIn("2026 年 4 月至 2027 年 3 月", chinese)
            self.assertIn("April 2026 to March 2027", english)
            self.assertIn(f"{expected_count:,} residential break-ins", english)


if __name__ == "__main__":
    unittest.main()
