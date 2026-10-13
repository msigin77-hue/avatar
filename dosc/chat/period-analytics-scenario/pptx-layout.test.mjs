import test from 'node:test';
import assert from 'node:assert/strict';
import { axisTicks, lineValueLabelIndices, lineValueLabels, pieColors, pieLegendRows, summaryLayout } from './pptx-layout.mjs';

const report = {
  topics: ['Списание средств', 'Переводы', 'Комиссии', 'Приложение', 'Прочее'],
  pie: [380, 286, 192, 425, 330],
};

test('pie legend shows each topic with its count, share, and matching color', () => {
  const rows = pieLegendRows(report);

  assert.deepEqual(rows, [
    { topic: 'Списание средств', count: 380, share: 24, color: '#1557A0' },
    { topic: 'Переводы', count: 286, share: 18, color: '#2878B8' },
    { topic: 'Комиссии', count: 192, share: 12, color: '#4A98D2' },
    { topic: 'Приложение', count: 425, share: 26, color: '#83B7E2' },
    { topic: 'Прочее', count: 330, share: 20, color: '#C3DDF1' },
  ]);
});

test('total summary is separated from the Top-3 heading', () => {
  const { total, top3Heading } = summaryLayout;

  assert.ok(total.top < top3Heading.top);
  assert.ok(total.top + total.height < top3Heading.top);
  assert.ok(top3Heading.top - (total.top + total.height) >= 12);
});

test('Y-axis uses readable integer ticks that cover the largest value', () => {
  assert.deepEqual(axisTicks(985), [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(axisTicks(30), [0, 10, 20, 30, 40, 50]);
});

test('line value labels cover monthly and weekly points and stay sparse for daily points', () => {
  assert.deepEqual(lineValueLabelIndices(9), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(lineValueLabelIndices(13), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(lineValueLabelIndices(30), [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 29]);
});

test('value labels are emitted only for the aggregate line series', () => {
  const aggregate = { series: [{ name: 'Все обращения', values: [42, 58, 61] }], periods: ['янв', 'фев', 'мар'] };
  const split = { series: [{ name: 'Жалобы', values: [20, 24, 22] }, { name: 'Консультации', values: [22, 34, 39] }], periods: aggregate.periods };

  assert.deepEqual(lineValueLabels(aggregate), [
    { index: 0, value: 42 },
    { index: 1, value: 58 },
    { index: 2, value: 61 },
  ]);
  assert.deepEqual(lineValueLabels(split), []);
});

test('all chart series use a blue palette', () => {
  assert.deepEqual(pieColors, ['#1557A0', '#2878B8', '#4A98D2', '#83B7E2', '#C3DDF1']);
  assert.ok(pieColors.every(color => /^#[0-9A-F]{6}$/i.test(color)));
});
