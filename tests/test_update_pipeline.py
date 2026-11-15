import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_crime_automation import MONTHS, ROOT, make_archive, snapshot

TEST_TIMEOUT_SECONDS = 60
BREAK_IN = "Break and enter dwelling"


def run_update(workspace, archive, *options):
    command = [sys.executable, "work/update_crime_data.py", "--archive", str(archive), *options]
    return subprocess.run(command, cwd=workspace, text=True, capture_output=True,
                          timeout=TEST_TIMEOUT_SECONDS)


def create_workspace(root):
    work = root / "work"
    work.mkdir()
    shutil.copytree(ROOT / "work" / "automation", work / "automation")
    shutil.copyfile(ROOT / "work" / "update_crime_data.py", work / "update_crime_data.py")
    (work / "crime_data.json").write_text(json.dumps(snapshot()), encoding="utf-8")
    (work / "crime_period.json").write_text(
        json.dumps({"start": "2025-01", "end": "2025-12"}), encoding="utf-8")
    return work


class UpdatePipelineTests(unittest.TestCase):
    def test_cli_updates_only_after_validation_and_is_idempotent(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            work = create_workspace(root)
            archive = root / "suburb.zip"
            make_archive(archive)
            original = (work / "crime_data.json").read_bytes()
            dry_run = run_update(root, archive, "--dry-run")
            self.assertEqual(dry_run.returncode, 0, dry_run.stderr)
            self.assertIn("changed: True", dry_run.stdout)
            self.assertEqual((work / "crime_data.json").read_bytes(), original)
            first = run_update(root, archive)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertIn("changed: True", first.stdout)
            after = (work / "crime_data.json").read_bytes()
            second = run_update(root, archive)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertIn("changed: False", second.stdout)
            self.assertEqual((work / "crime_data.json").read_bytes(), after)
            self.assertEqual(json.loads((work / "crime_period.json").read_text())["end"], "2026-12")

    def test_revision_is_processed_and_older_source_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            work = create_workspace(root)
            archive = root / "suburb.zip"
            make_archive(archive)
            first = run_update(root, archive)
            self.assertEqual(first.returncode, 0, first.stderr)
            make_archive(archive, counts=(("Alpha", 3), ("Beta", 2)))
            revised = run_update(root, archive)
            self.assertEqual(revised.returncode, 0, revised.stderr)
            rows = json.loads((work / "crime_data.json").read_text())["rows"]
            self.assertEqual(next(row for row in rows if row["name"] == "Alpha")["counts"][BREAK_IN], 36)
            after = (work / "crime_data.json").read_bytes()
            make_archive(archive, months=[month.replace("2026", "2025") for month in MONTHS])
            older = run_update(root, archive)
            self.assertNotEqual(older.returncode, 0)
            self.assertIn("Source period regressed", older.stderr)
            self.assertEqual((work / "crime_data.json").read_bytes(), after)


if __name__ == "__main__":
    unittest.main()
