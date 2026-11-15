import copy
import csv
import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "work"))

from automation.period import select_period
from automation.source import read_archive
from automation.statistics import FOCUS, update_snapshot

MONTHS = [f"{month} 2026" for month in
          "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()]
OFFENCES = tuple(dict.fromkeys(offence for group in FOCUS.values() for offence in group))


def make_archive(path, *, missing=None, months=MONTHS, counts=(("Alpha", 1), ("Beta", 2))):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["Suburb", "Offence category", "Subcategory", *months])
    for suburb, count in counts:
        for offence in OFFENCES:
            if offence != missing:
                writer.writerow([suburb, "Category", offence, *([count] * len(months))])
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("SuburbData.csv", stream.getvalue())


def snapshot():
    rows = [{"code": "1", "name": "Alpha", "source": "Alpha", "pop": 100},
            {"code": "2", "name": "Beta", "source": "Beta", "pop": 200}]
    return {"rows": rows, "labels": {offence: "Category" for offence in OFFENCES}}


class CrimeAutomationTests(unittest.TestCase):
    def test_realistic_archive_updates_counts_rates_and_tied_ranks(self):
        original = snapshot()
        before = copy.deepcopy(original)
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            archive = Path(directory) / "data.zip"
            make_archive(archive)
            source = read_archive(archive, original["rows"])
        result = update_snapshot(original, source)
        self.assertEqual(source["period"], {"start": "2026-01", "end": "2026-12"})
        self.assertEqual(result["rows"][0]["burglary"], [12, 12000.0, 1])
        self.assertEqual(result["rows"][1]["burglary"], [24, 12000.0, 1])
        self.assertEqual(result["rows"][0]["assault"][0], 24)
        self.assertEqual(original, before)

    def test_missing_month_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing, duplicated, or out of order"):
            select_period(MONTHS[:5] + MONTHS[6:] + ["Jan 2027"])

    def test_missing_offence_is_rejected(self):
        data = snapshot()
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            archive = Path(directory) / "data.zip"
            make_archive(archive, missing=OFFENCES[0])
            source = read_archive(archive, data["rows"])
        with self.assertRaisesRegex(ValueError, "offence categories changed"):
            update_snapshot(data, source)

    def test_previously_matched_suburb_cannot_silently_disappear(self):
        data = snapshot()
        source = {"labels": data["labels"], "counts": {"Alpha": {}}}
        with self.assertRaisesRegex(ValueError, "Previously matched suburb"):
            update_snapshot(data, source)


if __name__ == "__main__":
    unittest.main()
