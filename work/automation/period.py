from datetime import date

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MONTHS_PER_YEAR = 12


def parse_month(value):
    parts = value.split()
    if len(parts) != 2 or parts[0] not in MONTHS or not parts[1].isdigit():
        raise ValueError(f"Invalid BOCSAR month: {value!r}")
    return date(int(parts[1]), MONTHS.index(parts[0]) + 1, 1)


def select_period(columns):
    if len(columns) < MONTHS_PER_YEAR:
        raise ValueError("BOCSAR data must contain at least twelve months")
    months = [parse_month(column) for column in columns]
    ordinals = [month.year * MONTHS_PER_YEAR + month.month for month in months]
    if any(right != left + 1 for left, right in zip(ordinals, ordinals[1:])):
        raise ValueError("BOCSAR monthly columns are missing, duplicated, or out of order")
    selected = months[-MONTHS_PER_YEAR:]
    return {"start": selected[0].strftime("%Y-%m"), "end": selected[-1].strftime("%Y-%m")}
