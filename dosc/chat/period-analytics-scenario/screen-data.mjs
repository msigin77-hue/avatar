import { messageTemplates as copy } from './messages.mjs';

export const products = Object.freeze(['ОМС', 'СЛИТКИ', 'Конверсия в СБОЛе', 'Конверсия в ВСП', 'Карточная конверсия', 'Переводы(в целях)']);

const today = new Date();
const year = today.getFullYear();
const lastMonth = new Date(year, today.getMonth(), 0);
const lastMonthNumber = lastMonth.getMonth() + 1;
const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function keyForTemplate(value) {
  return Object.keys(copy).find(key => copy[key] === value) || null;
}

function formatDate(date, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  return new Intl.DateTimeFormat('ru-RU', options).format(date);
}

function fullMonthPeriod() {
  return `${monthNames[lastMonthNumber - 1]} ${year}`;
}

function reportRange(detail) {
  if (detail === 'week') {
    const end = new Date(today);
    const weekday = end.getDay() || 7;
    end.setDate(end.getDate() - weekday);
    const start = new Date(end);
    start.setDate(start.getDate() - 12 * 7);
    return `${formatDate(start)} — ${formatDate(end)} · 13 недель`;
  }
  if (detail === 'day') return `${formatDate(new Date(year, lastMonthNumber - 1, 1))} — ${formatDate(lastMonth)} · ${lastMonth.getDate()} дней`;
  return `Январь — ${monthNames[lastMonthNumber - 1]} ${year}`;
}

function makeHistoryRecords() {
  const priorMonth = new Date(year, lastMonthNumber - 2, 1);
  const records = [
    { id: 'demo-weekly', product: 'СЛИТКИ', period: `${reportRange('week')}`, createdAt: new Date(year, lastMonthNumber - 1, 8), status: 'completed', filename: copy['report.weekExample'] },
    { id: 'demo-monthly', product: 'ОМС', period: fullMonthPeriod(), createdAt: new Date(year, lastMonthNumber - 1, 5), status: 'completed', filename: copy['report.monthExample'] },
    { id: 'demo-daily', product: 'Карточная конверсия', period: `${formatDate(new Date(year, lastMonthNumber - 1, 1))} — ${formatDate(lastMonth)} · ${lastMonth.getDate()} дней`, createdAt: new Date(year, lastMonthNumber - 1, 3), status: 'completed', filename: copy['report.monthExample'] },
    { id: 'demo-monthly-previous', product: 'Конверсия в ВСП', period: `${monthNames[(lastMonthNumber + 10) % 12]} ${priorMonth.getFullYear()}`, createdAt: new Date(year, lastMonthNumber - 2, 19), status: 'completed', filename: copy['report.monthExample'] },
    { id: 'demo-weekly-previous', product: 'Переводы(в целях)', period: `${reportRange('week')}`, createdAt: new Date(year, lastMonthNumber - 2, 11), status: 'completed', filename: copy['report.weekExample'] },
    { id: 'demo-forming', product: 'Конверсия в СБОЛе', period: fullMonthPeriod(), createdAt: new Date(), status: 'forming', filename: null }
  ];
  return records.sort((left, right) => right.createdAt - left.createdAt).map(record => ({
    ...record,
    createdLabel: formatDate(record.createdAt, { day: '2-digit', month: 'long', year: 'numeric' }),
    statusLabel: record.status === 'completed' ? copy['history.completed'] : copy['history.forming']
  }));
}

const button = (uid, label, route, extra = {}) => ({ uid, id: uid, type: 'InteractiveButton', label, labelKey: keyForTemplate(label), value: route, route, ...extra });
const select = (uid, label, options, value, route) => ({
  uid,
  id: uid,
  type: 'InteractiveSelect',
  label,
  labelKey: keyForTemplate(label),
  value,
  options: options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel, labelKey: keyForTemplate(optionLabel) })),
  route
});
const group = (uid, title = null, description = null, actions = [], extra = {}) => ({ uid, title, titleKey: keyForTemplate(title), description, descriptionKey: keyForTemplate(description), verticalLayout: false, actions, ...extra });

const historyRecords = makeHistoryRecords();

export function buildHistoryScreen(page, records = historyRecords) {
  const pageCount = Math.max(1, Math.ceil(records.length / 5));
  const items = records.slice(page * 5, page * 5 + 5);
  const recordGroups = items.map(record => group(`history-${record.id}`, record.product,
    `${record.period} · Создана ${record.createdLabel} · ${record.statusLabel}`,
    record.status === 'completed' ? [button(`download-${record.id}`, copy['history.download'], `DOWNLOAD_HISTORY:${record.id}`, { fileName: record.filename })] : [],
    { recordId: record.id, status: record.status, filename: record.filename }));
  const pagingActions = [];
  if (page > 0) pagingActions.push(button('history-previous', copy['history.previous'], `HISTORY_PAGE:${page - 1}`));
  pagingActions.push(button(`history-next-${page}`, copy['history.next'], `HISTORY_PAGE:${page + 1}`, { disabled: page >= pageCount - 1 }));
  recordGroups.push(group('history-pagination', `Страница ${page + 1} из ${pageCount}`, null, pagingActions));
  recordGroups.push(group('history-back', null, null, [button('history-back', copy.back, 'BACK_HISTORY')]));
  return {
    id: `history-page-${page + 1}`,
    label: `История презентаций · страница ${page + 1}`,
    text: `**${copy['history.title']}**\n\n${copy['history.caption']}`,
    groups: recordGroups,
    metadata: { page, pageCount }
  };
}

export const demoData = Object.freeze({
  year,
  month: String(lastMonthNumber).padStart(2, '0'),
  monthName: monthNames[lastMonthNumber - 1],
  lastMonth: fullMonthPeriod(),
  product: products[0],
  period: reportRange('month'),
  historyRecords
});

export const scenarioTransitions = Object.freeze({
  ANALYTICS_PERIOD: { type: 'ANALYTICS_PERIOD' },
  NEW_PRESENTATION: { type: 'NEW_PRESENTATION' },
  OPEN_HISTORY: { type: 'OPEN_HISTORY' },
  BACK_BRANCH: { type: 'BACK_BRANCH' },
  BACK_HISTORY: { type: 'BACK_HISTORY' },
  GENERATE: { type: 'GENERATE' },
  BACK_SETTINGS: { type: 'BACK_SETTINGS' },
  RESET: { type: 'RESET' }
});

export const sourceScreens = [
  { id: 'welcome', label: 'Приветствие', text: copy['welcome.text'], groups: [] },
  { id: 'products', label: 'Список продуктов', text: copy['products.text'], groups: [] },
  { id: 'branch', label: 'Выбор сценария', text: '', groups: [group('branch-choice', copy['branch.title'], null, [
    button('analytics-period', copy['branch.analytics'], 'ANALYTICS_PERIOD'),
    button('generate-presentation', copy['branch.presentation'], 'NEW_PRESENTATION')
  ])] },
  buildHistoryScreen(0),
  buildHistoryScreen(1),
  { id: 'settings', label: 'Параметры презентации', text: `**${copy['settings.heading']}**`, groups: [
    group('settings-product', null, 'Продукт, по которому будет сформирована презентация.', [
      select('product-select', copy['product.label'], products.map(value => [value, value]), products[0], 'SET_PRODUCT')
    ], { verticalLayout: true }),
    group('settings-detail', null, 'Шаг периода в диаграмме: месяц, неделя или день.', [
      select('detail-select', copy['settings.detail'], [['month', copy['settings.detail.month']], ['week', copy['settings.detail.week']], ['day', copy['settings.detail.day']]], 'month', 'SET_DETAIL')
    ], { verticalLayout: true }),
    group('settings-chart', null, 'Выбери вид диаграммы для отображения динамики обращений.', [
      select('chart-select', copy['settings.chart'], [['line', copy['settings.chart.line']], ['histogram', copy['settings.chart.histogram']]], 'histogram', 'SET_CHART_TYPE')
    ], { verticalLayout: true }),
    group('settings-topics', null, 'Определи, показывать ли данные отдельно по тематикам или объединить их.', [
      select('topics-select', copy['settings.topics'], [['split', copy['settings.topics.split']], ['all', copy['settings.topics.all']]], 'all', 'SET_SPLIT_TOPICS')
    ], { verticalLayout: true }),
    group('settings-actions', null, null, [
      button('settings-generate', copy['settings.generate'], 'GENERATE'),
      button('settings-back-button', copy.back, 'BACK_BRANCH')
    ], { verticalLayout: true })
  ] },
  { id: 'settings-history', label: 'Сообщение с переходом к истории', text: `**${copy['history.title']}**\n\n${copy['history.caption']}`, groups: [
    group('settings-history-cta', null, null, [button('history-open', copy['history.open'], 'OPEN_HISTORY')])
  ] },
  { id: 'report-generating', label: 'Подготовка презентации', text: `**${copy['report.started']}**\n\n${copy['report.product']}: {product}\n\n${copy['report.period']}: {period}`, groups: [
    group('report-generating-back', null, null, [button('report-generating-back-button', copy.back, 'BACK_SETTINGS')])
  ] },
  { id: 'report-ready', label: 'Готовая презентация', text: `**${copy['report.ready']}**`, groups: [
    group('report-ready-file', 'Презентация_{year}_{month}_{detail}.pptx', copy['report.fileDetails'], [button('report-download', copy['history.download'], 'DOWNLOAD_ATTACHMENT')], { attachment: true })
  ], attachment: { filename: copy['report.monthExample'], mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } },
  { id: 'report-fallback', label: 'Готовая презентация · пример', text: `**${copy['report.ready']}**`, groups: [
    group('report-fallback-file', copy['report.monthExample'], copy['report.fallbackDetails'], [button('report-fallback-download', copy['history.download'], 'DOWNLOAD_ATTACHMENT')], { attachment: true })
  ], attachment: { filename: copy['report.monthExample'], mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } }
];

for (const screen of sourceScreens) {
  screen.textKey = keyForTemplate(screen.text);
  for (const item of screen.groups) {
    item.titleKey ??= keyForTemplate(item.title);
    item.descriptionKey ??= keyForTemplate(item.description);
    for (const action of item.actions) {
      action.labelKey ??= keyForTemplate(action.label);
      for (const option of action.options || []) option.labelKey ??= keyForTemplate(option.label);
    }
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

deepFreeze(sourceScreens);
