import test from 'node:test';
import assert from 'node:assert/strict';

test('feature screen data preserves the original screens, labels, defaults, and existing route set', async () => {
  const [{ products, sourceScreens, demoData, scenarioTransitions }, { messageTemplates }] = await Promise.all([
    import('./screen-data.mjs'), import('./messages.mjs')
  ]);
  const byId = Object.fromEntries(sourceScreens.map(screen => [screen.id, screen]));

  assert.deepEqual(sourceScreens.map(screen => screen.id), [
    'welcome', 'products', 'branch', 'history-page-1',
    'history-page-2', 'settings', 'settings-history', 'report-generating', 'report-ready', 'report-fallback'
  ]);
  assert.match(byId.welcome.text, /Я твой AI-помощник по работе с обратной связью клиентов/);
  assert.match(byId.welcome.text, /К-1 и К-2/);
  assert.match(byId.products.text, /Твои продукты/);
  assert.deepEqual(products, ['ОМС', 'СЛИТКИ', 'Конверсия в СБОЛе', 'Конверсия в ВСП', 'Карточная конверсия', 'Переводы(в целях)']);

  const buttons = screen => screen.groups.flatMap(group => group.actions);
  assert.deepEqual(buttons(byId.branch).map(action => [action.label, action.route]), [
    ['Аналитика за период', 'ANALYTICS_PERIOD'], ['Сгенерировать презентацию', 'NEW_PRESENTATION']
  ]);
  assert.equal(buttons(byId.settings).some(action => action.route === 'OPEN_HISTORY'), false);
  assert.equal(buttons(byId['settings-history']).find(action => action.route === 'OPEN_HISTORY').label, 'Ранее сгенерированные презентации');
  assert.match(byId['settings-history'].text, /Твои презентации/);
  assert.equal(byId['history-page-1'].groups.filter(group => group.recordId).length, 5);
  assert.equal(byId['history-page-2'].groups.filter(group => group.recordId).length, 1);

  assert.equal(byId.product, undefined);
  const settingsControls = byId.settings.groups.flatMap(group => group.actions);
  const productSelect = settingsControls.find(action => action.id === 'product-select');
  assert.deepEqual(productSelect.options.map(option => option.label), products);
  assert.equal(productSelect.value, products[0]);
  const selectors = settingsControls.filter(action => action.type === 'InteractiveSelect');
  assert.deepEqual(selectors.map(action => action.id), ['product-select', 'detail-select', 'chart-select', 'topics-select']);
  assert.deepEqual(selectors.map(action => action.value), [products[0], 'month', 'histogram', 'all']);
  assert.deepEqual(selectors.map(action => action.options.map(option => option.label)), [
    products,
    ['Месяц', 'Неделя', 'День'],
    ['Линейная', 'Столбчатая'],
    ['Разбивать по тематикам', 'Не разбивать по тематикам']
  ]);
  assert.equal(byId.settings.groups.length, 5);
  assert.deepEqual(byId.settings.groups.map(group => group.actions.length), [1, 1, 1, 1, 2]);
  assert.ok(byId.settings.groups.every(group => group.verticalLayout));
  assert.match(byId.settings.groups[0].description, /продукт/i);
  assert.match(byId.settings.groups[1].description, /период|детализац/i);
  assert.match(byId.settings.groups[2].description, /диаграмм/i);
  assert.match(byId.settings.groups[3].description, /тематикам/i);
  assert.deepEqual(byId.settings.groups.slice(0, 4).flatMap(group => group.actions).map(action => action.id), [
    'product-select', 'detail-select', 'chart-select', 'topics-select'
  ]);
  assert.deepEqual(byId.settings.groups[4].actions.map(action => action.label), ['Сгенерировать презентацию', 'Назад']);
  assert.deepEqual(byId.settings.groups[4].actions.map(action => action.route), ['GENERATE', 'BACK_BRANCH']);
  assert.match(byId['report-generating'].text, /Мы начали готовить презентацию/);
  assert.match(byId['report-ready'].text, /Презентация готова\. К отправке 1 файл/);
  assert.equal(byId['report-ready'].attachment.filename, 'analytics-synthetic-sample.pptx');
  assert.equal(byId['report-fallback'].attachment.filename, 'analytics-synthetic-sample.pptx');
  assert.equal(demoData.historyRecords.length, 6);
  assert.ok(scenarioTransitions.OPEN_HISTORY);
  assert.ok(!scenarioTransitions.CHOOSE_PRESENTATION);
  assert.equal(messageTemplates['branch.title'], 'Выбери сценарий работы');
});

test('ready presentation filename is kept horizontal and may truncate with ellipsis', async () => {
  const { readFile } = await import('node:fs/promises');
  const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
  const responsiveStyles = await readFile(new URL('./prototype.css', import.meta.url), 'utf8');
  const workbenchStyles = await readFile(new URL('./workbench.css', import.meta.url), 'utf8');
  assert.match(styles, /\.file-meta strong[^}]*writing-mode:\s*horizontal-tb/s);
  assert.match(styles, /\.file-meta strong[^}]*white-space:\s*nowrap/s);
  assert.match(styles, /\.attachment-group \.group-title[^}]*writing-mode:\s*horizontal-tb/s);
  assert.match(styles, /\.file-card\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.file-meta\s*\{[^}]*grid-column:\s*2/s);
  assert.match(responsiveStyles, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.file-card\s*\{[^}]*grid-template-columns:\s*38px\s+minmax\(0,\s*1fr\)/s);
  assert.doesNotMatch(responsiveStyles, /\.file-meta\s*\{\s*flex-basis:/);
  assert.match(workbenchStyles, /\.sdk-group\[data-group-id="settings-actions"\] \.sdk-action:last-child[^}]*border-top:\s*1px/s);
});
