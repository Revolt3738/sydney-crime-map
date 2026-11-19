import json
import hashlib
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path

JOURNAL = ".crime-update-pending.json"


@contextmanager
def update_lock(work):
    key = hashlib.sha256(os.path.normcase(str(work.resolve())).encode("utf-8")).hexdigest()
    path = Path(tempfile.gettempdir()) / f"crime-update-{key}.lock"
    with path.open("a+b") as lock:
        lock.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def atomic_write(path, contents):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=f".{path.name}.", delete=False) as target:
            temporary = Path(target.name)
            target.write(contents)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def read_snapshot(work):
    journal = work / JOURNAL
    files = [work / "crime_data.json", work / "crime_period.json"]
    if journal.exists():
        raise RuntimeError("Crime data update is incomplete; rerun the updater to recover")
    first = [path.read_text(encoding="utf-8") for path in files]
    second = [path.read_text(encoding="utf-8") for path in files]
    if journal.exists() or first != second:
        raise RuntimeError("Crime data changed during reading; rerun after the update")
    return [json.loads(value) for value in first]


def finish_transaction(work, transaction):
    if set(transaction) != {"snapshot", "period"}:
        raise ValueError("Invalid pending crime data transaction")
    snapshot = json.loads(transaction["snapshot"])
    period = json.loads(transaction["period"])
    if not isinstance(snapshot, dict) or not isinstance(period, dict):
        raise ValueError("Invalid pending crime data transaction contents")
    atomic_write(work / "crime_data.json", transaction["snapshot"])
    atomic_write(work / "crime_period.json", transaction["period"])
    (work / JOURNAL).unlink()


def recover_transaction(work, dry_run):
    journal = work / JOURNAL
    if not journal.exists():
        return
    if dry_run:
        raise RuntimeError("An interrupted crime data update requires a normal update to recover")
    print("Recovering interrupted crime data update")
    finish_transaction(work, json.loads(journal.read_text(encoding="utf-8")))


def commit_transaction(work, snapshot, period):
    transaction = {
        "snapshot": json.dumps(snapshot, ensure_ascii=False),
        "period": json.dumps(period, indent=2) + "\n",
    }
    atomic_write(work / JOURNAL, json.dumps(transaction, ensure_ascii=False))
    finish_transaction(work, transaction)
