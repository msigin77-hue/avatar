import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMessage,
  buildMessages,
  createDraft,
  insertBeforeUid,
  loadDraft,
  measureScreen,
  moveItem,
  moveItemToPosition,
  parseDraft,
  restoreScreen,
  serializeDraft
} from './workbench-model.mjs';

const source = [{
  id: 'product',
  label: 'Выбор продукта',
  text: 'Продукт {product}',
  groups: [{
    uid: 'product-group',
    title: 'Продукт',
    description: 'Выбери продукт',
    verticalLayout: true,
    actions: [
      { uid: 'product-select', type: 'InteractiveSelect', id: 'product', options: [{ label: 'ОМС', value: 'OMS' }], value: 'OMS', route: 'select-product' },
      { uid: 'next', type: 'InteractiveButton', id: 'next', label: 'Далее', value: 'next', route: 'next' }
    ]
  }]
}];

function fakeStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    data
  };
}

test('createDraft clones source screens and starts with independent comments and templates', () => {
  const draft = createDraft(source);
  assert.equal(draft.schemaVersion, 5);
  assert.equal(draft.screens[0].id, 'product');
  assert.notEqual(draft.screens[0], source[0]);
  draft.screens[0].groups[0].title = 'Изменённое предложение';
  assert.equal(source[0].groups[0].title, 'Продукт');
  assert.deepEqual(draft.comments, {});
  assert.deepEqual(draft.templates, {});
});

test('buildMessage puts top text before groups and preserves SDK fields, options, and verticalLayout', () => {
  const message = buildMessage(source[0], { product: 'ОМС' });
  assert.equal(message.text, 'Продукт ОМС');
  assert.equal(message.groups[0].title, 'Продукт');
  assert.equal(message.groups[0].verticalLayout, true);
  assert.equal(message.groups[0].actions[0].type, 'InteractiveSelect');
  assert.deepEqual(message.groups[0].actions[0].options, [{ label: 'ОМС', value: 'OMS' }]);
  assert.equal(message.groups[0].actions[0].route, undefined);
});

test('buildMessage keeps local preview metadata out of the SDK message structure', () => {
  const screen = structuredClone(source[0]);
  screen.groups[0].actions[0].disabled = true;
  screen.groups[0].actions[0].recordId = 'history-row';
  screen.groups[0].actions[0].labelKey = 'product.label';
  screen.groups[0].actions[0].options[0].labelKey = 'product.oms';
  const action = buildMessage(screen).groups[0].actions[0];
  assert.equal(action.route, undefined);
  assert.equal(action.uid, undefined);
  assert.equal(action.disabled, undefined);
  assert.equal(action.recordId, undefined);
  assert.equal(action.labelKey, undefined);
  assert.equal(action.options[0].labelKey, undefined);
});

test('buildMessages returns separate SDK message structures in conversation order', () => {
  const followup = { id: 'history', text: 'Твои презентации', groups: [{ uid: 'history-cta', title: null, description: null, actions: [{ uid: 'open', type: 'InteractiveButton', label: 'Ранее сгенерированные презентации', value: 'OPEN_HISTORY' }] }] };
  const messages = buildMessages([...source, followup], ['product', 'history'], { product: 'ОМС' });
  assert.deepEqual(messages.map(message => message.text), ['Продукт ОМС', 'Твои презентации']);
  assert.equal(messages[1].groups[0].actions[0].value, 'OPEN_HISTORY');
  assert.deepEqual(Object.keys(messages[1]), ['text', 'groups']);
});

test('measureScreen counts substituted text in UTF-16 units without truncating source values', () => {
  const screen = structuredClone(source[0]);
  screen.text = '{symbol}'.repeat(2048) + 'x';
  const measured = measureScreen(screen, { symbol: '😀' });
  assert.equal(measured.messageText.actual, 4097);
  assert.equal(measured.messageText.limit, 4096);
  assert.equal(measured.messageText.over, true);
  assert.equal(screen.text.length, 16385);
  assert.ok(measured.violations.some(item => item.field === 'message.text'));
});

test('measureScreen reports title, description, group, and provisional button boundaries', () => {
  const screen = structuredClone(source[0]);
  screen.groups = Array.from({ length: 31 }, (_, index) => ({
    uid: `g${index}`,
    title: index === 0 ? 't'.repeat(129) : null,
    description: index === 0 ? 'd'.repeat(257) : null,
    verticalLayout: false,
    actions: index === 0 ? Array.from({ length: 31 }, (_, actionIndex) => ({ uid: `a${actionIndex}`, type: 'InteractiveButton', label: 'Открыть' })) : []
  }));
  const measured = measureScreen(screen, {});
  assert.equal(measured.groups.length, 31);
  assert.ok(measured.violations.some(item => item.field === 'groups' && item.actual === 31 && item.limit === 30));
  assert.ok(measured.violations.some(item => item.field === 'groups[0].actions' && item.provisional === true));
  assert.ok(measured.violations.some(item => item.field === 'groups[0].title' && item.actual === 129));
  assert.ok(measured.violations.some(item => item.field === 'groups[0].description' && item.actual === 257));
  assert.equal(screen.groups[0].title.length, 129);
  assert.equal(screen.groups.length, 31);
});

test('measureScreen accepts all non-button actions without inventing their limits', () => {
  const screen = structuredClone(source[0]);
  screen.text = 'x'.repeat(4096);
  screen.groups[0].title = 't'.repeat(128);
  screen.groups[0].description = 'd'.repeat(256);
  screen.groups[0].actions = Array.from({ length: 31 }, (_, index) => ({ uid: `select${index}`, type: 'InteractiveSelect', options: [] }));
  const measured = measureScreen(screen, {});
  assert.deepEqual(measured.violations, []);
});

test('moveItem reorders groups and actions by stable ids without mutating its input', () => {
  const screen = {
    id: 'order', text: '', groups: [
      { uid: 'g1', title: 'one', actions: [{ uid: 'a1' }, { uid: 'a2' }] },
      { uid: 'g2', title: 'two', actions: [] }
    ]
  };
  const movedGroup = moveItem(screen, { kind: 'group', groupUid: 'g2' }, 'up');
  assert.deepEqual(movedGroup.groups.map(group => group.uid), ['g2', 'g1']);
  assert.deepEqual(screen.groups.map(group => group.uid), ['g1', 'g2']);
  const movedAction = moveItem(screen, { kind: 'action', groupUid: 'g1', actionUid: 'a2' }, 'up');
  assert.deepEqual(movedAction.groups[0].actions.map(action => action.uid), ['a2', 'a1']);
  assert.deepEqual(screen.groups[0].actions.map(action => action.uid), ['a1', 'a2']);
});

test('moveItem leaves an item unchanged when it is already at the requested boundary', () => {
  const screen = structuredClone(source[0]);
  assert.deepEqual(moveItem(screen, { kind: 'group', groupUid: 'product-group' }, 'up'), screen);
  assert.deepEqual(moveItem(screen, { kind: 'action', groupUid: 'product-group', actionUid: 'product-select' }, 'up'), screen);
});

test('moveItemToPosition moves groups and actions to a drag target by stable id', () => {
  const screen = {
    id: 'order', text: '', groups: [
      { uid: 'g1', actions: [{ uid: 'a1' }, { uid: 'a2' }, { uid: 'a3' }] },
      { uid: 'g2', actions: [] },
      { uid: 'g3', actions: [] }
    ]
  };
  const movedGroup = moveItemToPosition(screen, { kind: 'group', groupUid: 'g3' }, 'g1');
  assert.deepEqual(movedGroup.groups.map(group => group.uid), ['g3', 'g1', 'g2']);
  const movedAction = moveItemToPosition(screen, { kind: 'action', groupUid: 'g1', actionUid: 'a3' }, 'a1');
  assert.deepEqual(movedAction.groups[0].actions.map(action => action.uid), ['a3', 'a1', 'a2']);
  assert.deepEqual(screen.groups[0].actions.map(action => action.uid), ['a1', 'a2', 'a3']);
});

test('insertBeforeUid adds a new history card before pagination without mutating saved groups', () => {
  const groups = [{ uid: 'history-1' }, { uid: 'history-pagination' }, { uid: 'history-back' }];
  const inserted = insertBeforeUid(groups, { uid: 'history-2' }, 'history-pagination');
  assert.deepEqual(inserted.map(group => group.uid), ['history-1', 'history-2', 'history-pagination', 'history-back']);
  assert.deepEqual(groups.map(group => group.uid), ['history-1', 'history-pagination', 'history-back']);
});

test('restoreScreen resets only the selected screen and keeps comments on other screens', () => {
  const draft = createDraft([...source, { id: 'other', label: 'Другой', text: 'other', groups: [] }]);
  draft.screens[0].text = 'Предложение';
  draft.comments.product = 'Комментарий не удалять';
  draft.comments.other = 'Другой комментарий';
  const restored = restoreScreen(draft, source, 'product');
  assert.equal(restored.screens.find(screen => screen.id === 'product').text, source[0].text);
  assert.equal(restored.screens.find(screen => screen.id === 'other').text, 'other');
  assert.deepEqual(restored.comments, draft.comments);
  assert.equal(draft.screens[0].text, 'Предложение');
});

test('serializeDraft and parseDraft preserve texts, layout, comments, and templates', () => {
  const draft = createDraft(source);
  draft.screens[0].groups[0].verticalLayout = true;
  draft.comments.product = 'Обсуждение продукта';
  draft.templates.heading = 'Текст';
  const restored = parseDraft(serializeDraft(draft), source);
  assert.deepEqual(restored, draft);
});

test('parseDraft rejects malformed and unrelated JSON before changing current data', () => {
  assert.throws(() => parseDraft('{', source));
  assert.throws(() => parseDraft(JSON.stringify({ schemaVersion: 1, screens: [] }), source));
  const unchanged = createDraft(source);
  assert.equal(unchanged.screens[0].text, source[0].text);
});

test('parseDraft rejects malformed select options before the current draft can be replaced', () => {
  const current = createDraft(source);
  const imported = structuredClone(current);
  imported.screens[0].groups[0].actions[0].options = [null];
  assert.throws(() => parseDraft(serializeDraft(imported), source), /вариант|option/i);
  assert.deepEqual(current, createDraft(source));
});

test('parseDraft preserves paginated history screens beyond the two synthetic examples', () => {
  const page3 = { id: 'history-page-3', label: 'История презентаций · страница 3', text: 'История', groups: [] };
  const extendedSource = [...source, page3];
  const draft = createDraft(extendedSource);
  draft.selectedScreen = page3.id;
  const parsed = parseDraft(serializeDraft(draft), source);
  assert.equal(parsed.selectedScreen, 'history-page-3');
  assert.ok(parsed.screens.some(screen => screen.id === 'history-page-3'));
});

test('parseDraft migrates the removed presentation-choice screen into the new flow without losing its edits', async () => {
  const { sourceScreens: currentScreens } = await import('./screen-data.mjs');
  const oldScreens = [
    { id: 'branch', label: 'Развилка', text: '', groups: [{ uid: 'branch-group', actions: [{ uid: 'new', type: 'InteractiveButton', label: 'Генерировать', value: 'NEW_PRESENTATION', route: 'NEW_PRESENTATION' }] }] },
    { id: 'presentation-choice', label: 'Новая или готовая', text: '', groups: [{ uid: 'choice-group', actions: [
      { uid: 'new-choice', type: 'InteractiveButton', label: 'Сгенерировать новую', value: 'NEW_PRESENTATION', route: 'NEW_PRESENTATION', labelKey: null, customFields: ['label'] },
      { uid: 'history-choice', type: 'InteractiveButton', label: 'Список презентаций', value: 'OPEN_HISTORY', route: 'OPEN_HISTORY', labelKey: null, customFields: ['label'] }
    ] }] },
    structuredClone(source[0])
  ];
  const legacy = createDraft(oldScreens);
  legacy.schemaVersion = 1;
  legacy.selectedScreen = 'presentation-choice';
  legacy.comments['presentation-choice'] = 'Проверить выбор истории';
  legacy.screens.find(screen => screen.id === 'presentation-choice').text = 'Мой текст';
  const migrated = parseDraft(serializeDraft(legacy), currentScreens);
  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.selectedScreen, 'branch');
  assert.equal(migrated.screens.some(screen => screen.id === 'presentation-choice'), false);
  assert.equal(migrated.comments['settings-history'], 'Проверить выбор истории');
  const branchAction = migrated.screens.find(screen => screen.id === 'branch').groups.flatMap(group => group.actions).find(action => action.route === 'NEW_PRESENTATION');
  const historyAction = migrated.screens.find(screen => screen.id === 'settings-history').groups.flatMap(group => group.actions).find(action => action.route === 'OPEN_HISTORY');
  assert.equal(branchAction.label, 'Сгенерировать новую');
  assert.equal(historyAction.label, 'Список презентаций');
});

test('parseDraft merges the former product step into settings and preserves its comment and custom label', async () => {
  const { sourceScreens: currentScreens } = await import('./screen-data.mjs');
  const legacy = createDraft(currentScreens);
  legacy.schemaVersion = 2;
  legacy.screens.push({ id: 'product', label: 'Выбор продукта', text: 'Выбери продукт', groups: [{ uid: 'product-settings', actions: [
    { uid: 'product-select', id: 'product-select', type: 'InteractiveSelect', label: 'Выбери банковский продукт', value: 'ОМС', route: 'SET_PRODUCT', customFields: ['label'], options: [{ label: 'ОМС', value: 'ОМС' }] }
  ] }] });
  legacy.selectedScreen = 'product';
  legacy.comments.product = 'Уточнить каталог продуктов';
  legacy.comments.settings = 'Сохранить диаграммы';
  const oldSettings = legacy.screens.find(screen => screen.id === 'settings');
  const oldControls = oldSettings.groups[0];
  const oldActions = Object.fromEntries(oldSettings.groups.flatMap(group => group.actions).map(action => [action.id, action]));
  oldControls.verticalLayout = false;
  oldControls.actions = ['detail-select', 'topics-select', 'chart-select', 'settings-generate'].map(id => oldActions[id]);
  oldSettings.groups = [oldControls, { uid: 'settings-back', actions: [oldActions['settings-back-button']] }];
  const migrated = parseDraft(serializeDraft(legacy), currentScreens);
  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.selectedScreen, 'settings');
  assert.equal(migrated.screens.some(screen => screen.id === 'product'), false);
  assert.match(migrated.comments.settings, /Сохранить диаграммы/);
  assert.match(migrated.comments.settings, /Уточнить каталог продуктов/);
  const productSelect = migrated.screens.find(screen => screen.id === 'settings').groups.flatMap(group => group.actions).find(action => action.route === 'SET_PRODUCT');
  assert.equal(productSelect.label, 'Выбери банковский продукт');
  const settings = migrated.screens.find(screen => screen.id === 'settings');
  assert.equal(settings.groups.length, 5);
  assert.ok(settings.groups.every(group => group.verticalLayout));
  assert.deepEqual(settings.groups.map(group => group.actions.map(action => action.id)), [
    ['product-select'], ['detail-select'], ['chart-select'], ['topics-select'], ['settings-generate', 'settings-back-button']
  ]);
});

test('parseDraft migrates revision 3 single-group settings to the five-group layout', async () => {
  const { sourceScreens: currentScreens } = await import('./screen-data.mjs');
  const previous = createDraft(currentScreens);
  previous.schemaVersion = 3;
  const settings = previous.screens.find(screen => screen.id === 'settings');
  const actions = settings.groups.flatMap(group => group.actions);
  settings.groups = [{ uid: 'settings-controls', verticalLayout: true, actions }];
  const migrated = parseDraft(serializeDraft(previous), currentScreens);
  const updatedSettings = migrated.screens.find(screen => screen.id === 'settings');
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(updatedSettings.groups.map(group => group.actions.map(action => action.id)), [
    ['product-select'], ['detail-select'], ['chart-select'], ['topics-select'], ['settings-generate', 'settings-back-button']
  ]);
});

test('parseDraft migrates revision 4 groups to include descriptions and the back separator group', async () => {
  const { sourceScreens: currentScreens } = await import('./screen-data.mjs');
  const previous = createDraft(currentScreens);
  previous.schemaVersion = 4;
  const settings = previous.screens.find(screen => screen.id === 'settings');
  settings.groups = settings.groups.map(group => ({ ...group, description: null, descriptionKey: null }));
  const migrated = parseDraft(serializeDraft(previous), currentScreens);
  const updatedSettings = migrated.screens.find(screen => screen.id === 'settings');
  assert.equal(migrated.schemaVersion, 5);
  assert.ok(updatedSettings.groups.slice(0, 4).every(group => typeof group.description === 'string' && group.description.length > 0));
  assert.equal(updatedSettings.groups.length, 5);
});

test('loadDraft backs up the old flow before saving its migrated version and retains presentation history', async () => {
  const { sourceScreens: currentScreens } = await import('./screen-data.mjs');
  const key = 'period-analytics-workbench-v1';
  const oldScreens = [
    { id: 'branch', text: '', groups: [] },
    { id: 'presentation-choice', text: '', groups: [] },
    structuredClone(source[0])
  ];
  const oldDraft = createDraft(oldScreens);
  oldDraft.schemaVersion = 1;
  oldDraft.comments['presentation-choice'] = 'Старый комментарий';
  const raw = serializeDraft(oldDraft);
  const history = '[{"id":"kept-history"}]';
  const storage = fakeStorage({ [key]: raw, 'period-analytics-presentation-history-v1': history });
  const loaded = loadDraft(storage, currentScreens, key);
  assert.equal(storage.getItem(`${key}-before-revision-1`), raw);
  assert.equal(JSON.parse(storage.getItem(key)).schemaVersion, 5);
  assert.equal(loaded.comments['settings-history'], 'Старый комментарий');
  assert.equal(storage.getItem('period-analytics-presentation-history-v1'), history);
});

test('loadDraft stores exact backup before replacing a stale draft and never touches history', () => {
  const key = 'period-analytics-workbench-v1';
  const oldDraft = JSON.stringify({ schemaVersion: 0, comments: { product: 'Old comment' } });
  const storage = fakeStorage({ [key]: oldDraft, 'period-analytics-presentation-history-v1': '[{"id":"history"}]' });
  const loaded = loadDraft(storage, source, key);
  assert.equal(storage.getItem(`${key}-before-revision-0`), oldDraft);
  assert.equal(loaded.screens[0].text, source[0].text);
  assert.equal(storage.getItem('period-analytics-presentation-history-v1'), '[{"id":"history"}]');
});

test('loadDraft backs up corrupt data without overwriting an earlier backup', () => {
  const key = 'period-analytics-workbench-v1';
  const storage = fakeStorage({ [key]: '{', [`${key}-before-revision-unknown`]: 'previous backup' });
  const loaded = loadDraft(storage, source, key);
  assert.equal(storage.getItem(`${key}-before-revision-unknown`), 'previous backup');
  assert.equal(storage.getItem(`${key}-before-revision-unknown-2`), '{');
  assert.equal(loaded.screens[0].id, 'product');
});
