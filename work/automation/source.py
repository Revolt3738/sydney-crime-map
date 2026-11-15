import csv
import io
import re
import zipfile
from collections import defaultdict

from .period import MONTHS_PER_YEAR, select_period

CSV_NAME = "SuburbData.csv"
FIXED_COLUMNS = ("Suburb", "Offence category", "Subcategory")


def name_key(name):
    name = name.removesuffix(" (NSW)")
    if name.endswith(" - NSW)"):
        name = name.removesuffix(" - NSW)") + ")"
    return re.sub(r"[^a-z0-9]", "", name.casefold())


def candidate_keys(rows):
    keys = {name_key(row["name"]) for row in rows}
    keys.update(name_key(row["source"]) for row in rows if row["source"])
    return keys


def read_header(reader):
    header = next(reader)
    if tuple(header[:len(FIXED_COLUMNS)]) != FIXED_COLUMNS:
        raise ValueError(f"Unexpected BOCSAR columns: {header[:len(FIXED_COLUMNS)]!r}")
    period = select_period(header[len(FIXED_COLUMNS):])
    return header, period


def add_candidate(counts, row):
    suburb, _, offence = row[:len(FIXED_COLUMNS)]
    if offence in counts[suburb]:
        raise ValueError(f"Duplicate offence for {suburb!r}: {offence!r}")
    values = [int(value) for value in row[-MONTHS_PER_YEAR:]]
    if any(value < 0 for value in values):
        raise ValueError(f"Negative incident count for {suburb!r}: {offence!r}")
    counts[suburb][offence] = sum(values)


def read_rows(reader, header, keys):
    counts = defaultdict(dict)
    labels = {}
    for row in reader:
        if len(row) != len(header):
            raise ValueError(f"Invalid CSV row length at line {reader.line_num}")
        suburb, group, offence = row[:len(FIXED_COLUMNS)]
        if not suburb or not group or not offence:
            raise ValueError(f"Missing locality or offence at line {reader.line_num}")
        previous = labels.setdefault(offence, group)
        if previous != group:
            raise ValueError(f"Inconsistent offence category for {offence!r}")
        if name_key(suburb) in keys:
            add_candidate(counts, row)
    return dict(counts), labels


def read_archive(path, rows):
    with zipfile.ZipFile(path) as archive:
        if sum(item.filename == CSV_NAME for item in archive.infolist()) != 1:
            raise ValueError(f"The archive must contain exactly one {CSV_NAME}")
        with archive.open(CSV_NAME) as raw:
            with io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as source:
                reader = csv.reader(source)
                header, period = read_header(reader)
                counts, labels = read_rows(reader, header, candidate_keys(rows))
    return {"counts": counts, "labels": labels, "period": period}
