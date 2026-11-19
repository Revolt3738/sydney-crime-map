import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "work"))

from automation import transaction


class TransactionTests(unittest.TestCase):
    def test_concurrent_updates_cannot_share_the_same_workspace(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            work = Path(directory)
            with transaction.update_lock(work):
                with self.assertRaises(OSError):
                    with transaction.update_lock(work):
                        self.fail("The second update acquired the same lock")
            with transaction.update_lock(work):
                pass

    def test_interrupted_update_blocks_reading_and_recovers_on_retry(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            work = Path(directory)
            (work / "crime_data.json").write_text('{"value":"old"}', encoding="utf-8")
            (work / "crime_period.json").write_text('{"end":"2025-12"}', encoding="utf-8")
            write = transaction.atomic_write

            def fail_period(path, contents):
                if path.name == "crime_period.json":
                    raise OSError("simulated period write failure")
                write(path, contents)

            with patch.object(transaction, "atomic_write", side_effect=fail_period):
                with self.assertRaisesRegex(OSError, "simulated"):
                    transaction.commit_transaction(work, {"value": "new"}, {"end": "2026-12"})
            self.assertTrue((work / transaction.JOURNAL).exists())
            with self.assertRaisesRegex(RuntimeError, "incomplete"):
                transaction.read_snapshot(work)
            with self.assertRaisesRegex(RuntimeError, "requires a normal update"):
                transaction.recover_transaction(work, dry_run=True)
            transaction.recover_transaction(work, dry_run=False)
            self.assertEqual(transaction.read_snapshot(work), [{"value": "new"}, {"end": "2026-12"}])
            self.assertFalse((work / transaction.JOURNAL).exists())

    def test_successful_commit_keeps_existing_json_contract(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            work = Path(directory)
            transaction.commit_transaction(work, {"rows": []}, {"start": "2025-01", "end": "2025-12"})
            self.assertEqual(json.loads((work / "crime_data.json").read_text(encoding="utf-8")), {"rows": []})
            self.assertEqual(transaction.read_snapshot(work)[1]["end"], "2025-12")


if __name__ == "__main__":
    unittest.main()
