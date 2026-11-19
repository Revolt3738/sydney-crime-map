from collections import defaultdict
from fractions import Fraction

from .source import name_key

RATE_UNIT = 100_000
VIOLENT = (
    "Domestic violence related assault", "Non-domestic violence related assault", "Assault Police",
    "Murder *", "Attempted murder", "Manslaughter *", "Robbery without a weapon",
    "Robbery with a firearm", "Robbery with a weapon not a firearm", "Sexual assault",
    "Sexual touching, sexual act and other sexual offences",
)
FOCUS = {
    "violent": VIOLENT,
    "assault": ("Domestic violence related assault", "Non-domestic violence related assault"),
    "non_dv": ("Non-domestic violence related assault",),
    "burglary": ("Break and enter dwelling",),
}


def source_matches(rows, counts):
    by_key = defaultdict(list)
    for name in counts:
        by_key[name_key(name)].append(name)
    matches = {}
    for row in rows:
        name = row["name"]
        candidates = by_key[name_key(name)]
        match = name if name in counts else candidates[0] if len(candidates) == 1 else None
        if row["source"] and not match:
            raise ValueError(f"Previously matched suburb is missing or ambiguous: {name!r}")
        matches[row["code"]] = match
    matched = [name for name in matches.values() if name]
    if len(matched) != len(set(matched)):
        raise ValueError("Multiple suburbs match the same BOCSAR locality")
    return matches


def update_row(row, source_name, source):
    counts = source["counts"][source_name] if source_name else {}
    if source_name and set(counts) != set(source["labels"]):
        raise ValueError(f"Missing or unexpected offences for {source_name!r}")
    metrics = {key: sum(counts[offence] for offence in group) if source_name else None
               for key, group in FOCUS.items()}
    return {**row, "source": source_name, "metrics": metrics, "counts": counts}


def rank_metric(rows, metric):
    rates = {row["code"]: Fraction(row["metrics"][metric] * RATE_UNIT, row["pop"])
             for row in rows if row["source"] and row["pop"]}
    ranks = {}
    for rank, rate in enumerate(sorted(rates.values(), reverse=True), start=1):
        ranks.setdefault(rate, rank)
    return [{**row, metric: [row["metrics"][metric],
                            float(rates[row["code"]]) if row["code"] in rates else None,
                            ranks.get(rates.get(row["code"]))]} for row in rows]


def update_snapshot(snapshot, source):
    if snapshot["labels"] != source["labels"]:
        raise ValueError("BOCSAR offence categories changed; update mappings and translations")
    matches = source_matches(snapshot["rows"], source["counts"])
    rows = [update_row(row, matches[row["code"]], source)
            for row in snapshot["rows"]]
    for metric in FOCUS:
        rows = rank_metric(rows, metric)
    rows = sorted(rows, key=lambda row: (row["violent"][2] is None, row["violent"][2] or 0, row["name"]))
    return {**snapshot, "rows": rows, "labels": source["labels"]}
