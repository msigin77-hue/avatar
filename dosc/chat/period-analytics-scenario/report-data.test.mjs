import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReports } from './report-data.mjs';

const fixedDate = new Date(2026, 9, 9, 12);

test('generates two deterministic slides and retains the selected product and chart type', () => {
  const settings = { product: 'СЛИТКИ', detail: 'month', splitTopics: 'all', chartType: 'line' };
  const reports = generateReports(settings, fixedDate);
  assert.equal(reports.length, 2);
  assert.deepEqual(reports.map(report => report.title), ['Жалобы', 'Консультации']);
  assert.ok(reports.every(report => report.product === 'СЛИТКИ' && report.chartType === 'line'));
  assert.deepEqual(generateReports(settings, fixedDate), reports);
});

test('monthly data ends at the last full month and uses all months from January', () => {
  const reports = generateReports({ product: 'ОМС', detail: 'month', splitTopics: 'all', chartType: 'histogram' }, fixedDate);
  assert.equal(reports[0].range, 'Январь — сентябрь 2026');
  assert.equal(reports[0].periods.length, 9);
  assert.equal(reports[0].monthName, 'сентябрь');
});

test('weekly data contains thirteen completed weeks ending before the current week', () => {
  const reports = generateReports({ product: 'СЛИТКИ', detail: 'week', splitTopics: 'split', chartType: 'histogram' }, fixedDate);
  assert.equal(reports[0].periods.length, 13);
  assert.match(reports[0].range, /04\.10\.2026 · 13 недель$/);
  assert.equal(reports[0].series.length, reports[0].topics.length);
});

test('daily data covers every day of the last full month and default no-split creates one series', () => {
  const reports = generateReports({ product: 'ОМС', detail: 'day', splitTopics: 'all', chartType: 'histogram' }, fixedDate);
  assert.equal(reports[0].periods.length, 30);
  assert.equal(reports[0].series.length, 1);
  assert.equal(reports[0].series[0].name, 'Все обращения');
  assert.equal(reports[0].range, '01.09.2026 — 30.09.2026 · 30 дней');
});

test('split and aggregate series have matching per-period totals', () => {
  const split = generateReports({ product: 'ОМС', detail: 'month', splitTopics: 'split', chartType: 'histogram' }, fixedDate);
  const all = generateReports({ product: 'ОМС', detail: 'month', splitTopics: 'all', chartType: 'histogram' }, fixedDate);
  split.forEach((report, reportIndex) => {
    const aggregate = all[reportIndex];
    report.periods.forEach((_, periodIndex) => {
      assert.equal(report.series.reduce((sum, series) => sum + series.values[periodIndex], 0), aggregate.series[0].values[periodIndex]);
    });
  });
});
