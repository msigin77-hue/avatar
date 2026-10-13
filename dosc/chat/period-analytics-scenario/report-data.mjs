import { products } from './screen-data.mjs';

const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const shortMonths = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const typeTopics = {
  toxic: ['Списание средств', 'Переводы', 'Комиссии', 'Приложение', 'Прочее'],
  consultation: ['Карты и счета', 'Переводы', 'Вклады', 'Бонусы', 'Прочее']
};
const names = { toxic: 'Жалобы', consultation: 'Консультации' };

function fmtDate(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function periodsFor(detail, today, lastMonth, lastMonthNumber, year) {
  if (detail === 'month') {
    return Array.from({ length: lastMonthNumber }, (_, index) => ({
      key: `${year}-${String(index + 1).padStart(2, '0')}`,
      label: shortMonths[index],
      start: new Date(year, index, 1),
      end: new Date(year, index + 1, 0)
    }));
  }
  if (detail === 'day') {
    return Array.from({ length: lastMonth.getDate() }, (_, index) => {
      const date = new Date(year, lastMonthNumber - 1, index + 1);
      return { key: fmtDate(date), label: String(index + 1).padStart(2, '0'), start: date, end: date };
    });
  }
  const end = new Date(today);
  const weekday = end.getDay() || 7;
  end.setDate(end.getDate() - weekday);
  const start = new Date(end);
  start.setDate(start.getDate() - 13 * 7 + 1);
  return Array.from({ length: 13 }, (_, index) => {
    const from = new Date(start);
    from.setDate(start.getDate() + index * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { key: `w${index + 1}`, label: `${String(from.getDate()).padStart(2, '0')}–${String(to.getDate()).padStart(2, '0')} ${shortMonths[from.getMonth()]}`, start: from, end: to };
  });
}

function reportRange(detail, periods, lastMonth, lastMonthNumber, year) {
  if (detail === 'month') return `Январь — ${monthNames[lastMonthNumber - 1]} ${year}`;
  if (detail === 'week') return `${fmtDate(periods[0].start)} — ${fmtDate(periods.at(-1).end)} · 13 недель`;
  return `${fmtDate(new Date(year, lastMonthNumber - 1, 1))} — ${fmtDate(lastMonth)} · ${lastMonth.getDate()} дней`;
}

function seed(...values) {
  let hash = 2166136261;
  for (const value of values.join('|').split('')) hash = Math.imul(hash ^ value.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function monthlyTotals(kind, productIndex, month) {
  const factor = [1, 0.78, 0.91, 0.86, 1.08, 0.94][productIndex];
  return typeTopics[kind].map((_, topicIndex) => 150 + ((seed(kind, productIndex, month, topicIndex) % 420) * factor | 0));
}

function distribute(total, count, salt) {
  const weights = Array.from({ length: count }, (_, index) => 12 + (seed(salt, index) % 35));
  const sum = weights.reduce((left, right) => left + right, 0);
  const values = weights.map(weight => Math.floor(total * weight / sum));
  let remainder = total - values.reduce((left, right) => left + right, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % values.length, remainder--) values[index]++;
  return values;
}

export function generateReports(settings, now = new Date()) {
  const today = new Date(now);
  const year = today.getFullYear();
  const lastMonth = new Date(year, today.getMonth(), 0);
  const lastMonthNumber = lastMonth.getMonth() + 1;
  const productIndex = Math.max(0, products.indexOf(settings.product));
  const periods = periodsFor(settings.detail, today, lastMonth, lastMonthNumber, year);
  const monthCounts = ['toxic', 'consultation'].map(kind => ({
    kind,
    topics: typeTopics[kind],
    pie: monthlyTotals(kind, productIndex, lastMonthNumber)
  }));

  return monthCounts.map(({ kind, topics, pie }) => {
    const series = topics.map((topic, topicIndex) => ({
      name: topic,
      values: periods.map((period, periodIndex) => {
        if (settings.detail === 'day') return distribute(pie[topicIndex], periods.length, `${kind}:${productIndex}:${topicIndex}`)[periodIndex];
        if (settings.detail === 'month' && periodIndex === lastMonthNumber - 1) return pie[topicIndex];
        const month = settings.detail === 'month' ? periodIndex + 1 : period.start.getMonth() + 1;
        const perMonth = monthlyTotals(kind, productIndex, month)[topicIndex];
        return settings.detail === 'month' ? perMonth : distribute(perMonth, 4, `${kind}:${productIndex}:${topicIndex}:${month}`)[Math.min(3, Math.floor(periodIndex / 4) % 4)];
      })
    }));
    const chartSeries = settings.splitTopics === 'split' ? series : [{
      name: 'Все обращения',
      values: periods.map((_, index) => series.reduce((sum, row) => sum + row.values[index], 0))
    }];
    const totals = periods.map((_, index) => chartSeries.reduce((sum, row) => sum + row.values[index], 0));
    return {
      kind,
      title: names[kind],
      product: settings.product,
      year,
      month: lastMonthNumber,
      monthName: monthNames[lastMonthNumber - 1],
      detail: settings.detail,
      range: reportRange(settings.detail, periods, lastMonth, lastMonthNumber, year),
      chartType: settings.chartType,
      topics,
      pie,
      periods: periods.map(period => period.label),
      series: chartSeries,
      totals
    };
  });
}
