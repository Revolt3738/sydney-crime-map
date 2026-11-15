import assert from "node:assert/strict";

const MONTHS_PER_YEAR = 12;
const MONTH_NAMES = Object.freeze([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]);

function monthParts(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  assert.ok(match, `Invalid crime-data month: ${value}`);
  return {year: Number(match[1]), month: Number(match[2])};
}

export function periodCopy(period) {
  const start = monthParts(period.start);
  const end = monthParts(period.end);
  const length = (end.year - start.year) * MONTHS_PER_YEAR + end.month - start.month + 1;
  assert.equal(length, MONTHS_PER_YEAR, "Crime-data period must cover twelve months");
  const zh = value => `${value.year} 年 ${value.month} 月`;
  const en = value => `${MONTH_NAMES[value.month - 1]} ${value.year}`;
  return {zh: `${zh(start)}至 ${zh(end)}`, en: `${en(start)} to ${en(end)}`,
    endZh: zh(end), endEn: en(end)};
}

export function applyPeriod(text, period) {
  return text.replaceAll("__CRIME_PERIOD_ZH__", period.zh)
    .replaceAll("__CRIME_PERIOD_EN__", period.en)
    .replaceAll("__CRIME_END_ZH__", period.endZh)
    .replaceAll("__CRIME_END_EN__", period.endEn);
}

export function translatePeriod(copy, period) {
  return Object.fromEntries(Object.entries(copy).map(([key, value]) =>
    [applyPeriod(key, period), applyPeriod(value, period)]));
}
