import argparse
import json
import shutil
import tempfile
import urllib.request
from pathlib import Path

from automation.source import read_archive
from automation.statistics import update_snapshot
from automation.transaction import commit_transaction, recover_transaction, update_lock

WORK = Path(__file__).resolve().parent
SOURCE_URL = "https://bocsarblob.blob.core.windows.net/bocsar-open-data/SuburbData.zip"


def parse_args():
    parser = argparse.ArgumentParser(description="Update the crime map from BOCSAR suburb data")
    parser.add_argument("--archive", type=Path, help="Use a local official SuburbData ZIP")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without writing")
    return parser.parse_args()


def download_archive(path):
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "SydneyCrimeMap/1.0"})
    with urllib.request.urlopen(request) as response, path.open("wb") as target:
        shutil.copyfileobj(response, target)


def update(path, dry_run):
    with update_lock(WORK):
        update_locked(path, dry_run)


def update_locked(path, dry_run):
    recover_transaction(WORK, dry_run)
    snapshot_path = WORK / "crime_data.json"
    period_path = WORK / "crime_period.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    previous_period = json.loads(period_path.read_text(encoding="utf-8"))
    source = read_archive(path, snapshot["rows"])
    updated = update_snapshot(snapshot, source)
    if source["period"]["end"] < previous_period["end"]:
        raise ValueError(f"Source period regressed: {source['period']} < {previous_period}")
    changed = updated != snapshot or source["period"] != previous_period
    print(f"BOCSAR period: {source['period']['start']} to {source['period']['end']}; changed: {changed}")
    if changed and not dry_run:
        commit_transaction(WORK, updated, source["period"])


def main():
    args = parse_args()
    if args.archive:
        update(args.archive, args.dry_run)
        return
    with tempfile.TemporaryDirectory(prefix=".crime-download-", dir=WORK) as directory:
        archive = Path(directory) / "SuburbData.zip"
        download_archive(archive)
        update(archive, args.dry_run)


if __name__ == "__main__":
    main()
