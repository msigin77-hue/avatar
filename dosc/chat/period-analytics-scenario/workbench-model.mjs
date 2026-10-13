const limits = Object.freeze({ messageText: 4096, title: 128, description: 256, groups: 30, buttons: 30 });

function clone(value) {
  return structuredClone(value);
}

function interpolate(value, demoData) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{([\w-]+)\}/g, (match, key) => demoData[key] === undefined ? match : String(demoData[key]));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isExtraHistoryPage(screenId) {
  return typeof screenId === 'string' && /^history-page-(?:[3-9]|[1-9]\d+)$/.test(screenId);
}

function assertScreen(screen) {
  if (!isPlainObject(screen) || typeof screen.id !== 'string' || typeof screen.text !== 'string' || !Array.isArray(screen.groups)) {
    throw new TypeError('Неверная структура экрана.');
  }
  for (const group of screen.groups) {
    if (!isPlainObject(group) || typeof group.uid !== 'string' || !Array.isArray(group.actions)) throw new TypeError('Неверная структура группы.');
    if (group.title !== null && group.title !== undefined && typeof group.title !== 'string') throw new TypeError('Заголовок группы должен быть текстом.');
    if (group.description !== null && group.description !== undefined && typeof group.description !== 'string') throw new TypeError('Описание группы должно быть текстом.');
    for (const action of group.actions) {
      if (!isPlainObject(action) || typeof action.uid !== 'string' || typeof action.type !== 'string') throw new TypeError('Неверная структура действия.');
      if (action.label !== null && action.label !== undefined && typeof action.label !== 'string') throw new TypeError('Подпись действия должна быть текстом.');
      if (action.type === 'InteractiveSelect') {
        if (!Array.isArray(action.options)) throw new TypeError('У списка отсутствуют варианты.');
        for (const option of action.options) {
          if (!isPlainObject(option) || typeof option.label !== 'string' || typeof option.value !== 'string') {
            throw new TypeError('Неверная структура варианта списка.');
          }
        }
      }
    }
  }
}

function sdkAction(action, demoData) {
  const result = {};
  for (const [key, value] of Object.entries(action)) {
    if (['uid', 'route', 'disabled', 'recordId', 'fileName', 'previewKind', 'labelKey'].includes(key)) continue;
    if (key === 'options' && Array.isArray(value)) {
      result.options = value.map(option => Object.fromEntries(Object.entries(option)
        .filter(([field]) => field !== 'labelKey')
        .map(([field, item]) => [field, interpolate(item, demoData)])));
    } else {
      result[key] = interpolate(value, demoData);
    }
  }
  return result;
}

export function createDraft(sourceScreens) {
  if (!Array.isArray(sourceScreens) || sourceScreens.length === 0) throw new TypeError('Не заданы исходные экраны.');
  return {
    schemaVersion: 5,
    screens: clone(sourceScreens),
    comments: {},
    templates: {},
    selectedScreen: sourceScreens[0].id
  };
}

export function buildMessage(screen, demoData = {}) {
  assertScreen(screen);
  return {
    text: interpolate(screen.text ?? '', demoData),
    groups: screen.groups.map(group => ({
      title: interpolate(group.title, demoData),
      description: interpolate(group.description, demoData),
      verticalLayout: Boolean(group.verticalLayout),
      actions: group.actions.map(action => sdkAction(action, demoData))
    }))
  };
}

export function buildMessages(screens, screenIds, demoData = {}) {
  if (!Array.isArray(screens) || !Array.isArray(screenIds)) throw new TypeError('Для сборки сообщений нужны массивы экранов и идентификаторов.');
  const screenById = new Map(screens.map(screen => [screen.id, screen]));
  return screenIds.map(screenId => {
    const screen = screenById.get(screenId);
    if (!screen) throw new RangeError(`Экран «${screenId}» не найден.`);
    return buildMessage(screen, demoData);
  });
}

export function measureScreen(screen, demoData = {}) {
  const message = buildMessage(screen, demoData);
  const violations = [];
  const measured = (field, value, limit, details = {}) => {
    const actual = typeof value === 'string' ? value.length : 0;
    if (actual > limit) violations.push({ field, actual, limit, ...details });
    return { actual, limit, over: actual > limit };
  };

  const messageText = measured('message.text', message.text, limits.messageText);
  const groups = message.groups.map((group, groupIndex) => {
    const title = group.title === null || group.title === undefined
      ? { actual: 0, limit: limits.title, over: false }
      : measured(`groups[${groupIndex}].title`, group.title, limits.title);
    const description = group.description === null || group.description === undefined
      ? { actual: 0, limit: limits.description, over: false }
      : measured(`groups[${groupIndex}].description`, group.description, limits.description);
    const buttonCount = group.actions.filter(action => action.type === 'InteractiveButton').length;
    if (buttonCount > limits.buttons) {
      violations.push({ field: `groups[${groupIndex}].actions`, actual: buttonCount, limit: limits.buttons, provisional: true });
    }
    return { title, description, buttonCount };
  });

  if (message.groups.length > limits.groups) violations.push({ field: 'groups', actual: message.groups.length, limit: limits.groups });
  return { messageText, groupCount: { actual: message.groups.length, limit: limits.groups, over: message.groups.length > limits.groups }, groups, violations };
}

export function moveItem(screen, selection, direction) {
  const result = clone(screen);
  const offset = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  if (offset === 0) return result;

  if (selection?.kind === 'group') {
    const index = result.groups.findIndex(group => group.uid === selection.groupUid);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= result.groups.length) return result;
    [result.groups[index], result.groups[target]] = [result.groups[target], result.groups[index]];
    return result;
  }

  if (selection?.kind === 'action') {
    const group = result.groups.find(item => item.uid === selection.groupUid);
    if (!group) return result;
    const index = group.actions.findIndex(action => action.uid === selection.actionUid);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= group.actions.length) return result;
    [group.actions[index], group.actions[target]] = [group.actions[target], group.actions[index]];
  }
  return result;
}

export function moveItemToPosition(screen, selection, targetUid) {
  const result = clone(screen);
  if (selection?.kind === 'group') {
    const sourceIndex = result.groups.findIndex(group => group.uid === selection.groupUid);
    if (sourceIndex < 0 || selection.groupUid === targetUid) return result;
    const [item] = result.groups.splice(sourceIndex, 1);
    const targetIndex = result.groups.findIndex(group => group.uid === targetUid);
    if (targetIndex < 0) result.groups.splice(sourceIndex, 0, item);
    else result.groups.splice(targetIndex, 0, item);
    return result;
  }
  if (selection?.kind === 'action') {
    const group = result.groups.find(item => item.uid === selection.groupUid);
    if (!group || selection.actionUid === targetUid) return result;
    const sourceIndex = group.actions.findIndex(action => action.uid === selection.actionUid);
    if (sourceIndex < 0) return result;
    const [item] = group.actions.splice(sourceIndex, 1);
    const targetIndex = group.actions.findIndex(action => action.uid === targetUid);
    if (targetIndex < 0) group.actions.splice(sourceIndex, 0, item);
    else group.actions.splice(targetIndex, 0, item);
  }
  return result;
}

export function insertBeforeUid(items, item, anchorUid) {
  const result = clone(items);
  const anchorIndex = result.findIndex(candidate => candidate.uid === anchorUid);
  result.splice(anchorIndex < 0 ? result.length : anchorIndex, 0, clone(item));
  return result;
}

export function restoreScreen(draft, sourceScreens, screenId) {
  const source = sourceScreens.find(screen => screen.id === screenId) || (isExtraHistoryPage(screenId)
    ? sourceScreens.find(screen => screen.id === 'history-page-2')
    : null);
  if (!source) throw new RangeError(`Исходный экран «${screenId}» не найден.`);
  const result = clone(draft);
  const index = result.screens.findIndex(screen => screen.id === screenId);
  if (index < 0) throw new RangeError(`Экран «${screenId}» отсутствует в предложении.`);
  result.screens[index] = { ...clone(source), id: screenId, label: screenId === source.id ? source.label : `История презентаций · страница ${screenId.slice('history-page-'.length)}` };
  return result;
}

export function serializeDraft(draft) {
  return JSON.stringify(draft, null, 2);
}

function migrateLegacyDraft(draft, sourceScreens) {
  const result = clone(draft);
  const legacyChoice = result.screens.find(screen => screen.id === 'presentation-choice');
  const legacyProduct = result.screens.find(screen => screen.id === 'product');
  for (const source of sourceScreens) {
    if (!result.screens.some(screen => screen.id === source.id)) result.screens.push(clone(source));
  }

  if (legacyChoice) {
    const legacyActions = legacyChoice.groups.flatMap(group => group.actions);
    const migrateCustomLabel = (route, targetScreenId) => {
      const legacyAction = legacyActions.find(action => action.route === route);
      if (!legacyAction?.customFields?.includes('label')) return;
      const targetScreen = result.screens.find(screen => screen.id === targetScreenId);
      const targetAction = targetScreen?.groups.flatMap(group => group.actions).find(action => action.route === route);
      if (!targetAction) return;
      targetAction.label = legacyAction.label;
      targetAction.labelKey = null;
      targetAction.customFields = [...new Set([...(targetAction.customFields || []), 'label'])];
    };
    migrateCustomLabel('NEW_PRESENTATION', 'branch');
    migrateCustomLabel('OPEN_HISTORY', 'settings-history');

    const movedComments = result.comments['presentation-choice'];
    if (typeof movedComments === 'string' && result.comments['settings-history'] === undefined) {
      result.comments['settings-history'] = movedComments;
    }
    delete result.comments['presentation-choice'];
    result.screens = result.screens.filter(screen => screen.id !== 'presentation-choice');
  }

  if (legacyProduct) {
    const productComment = result.comments.product;
    const settingsComment = result.comments.settings;
    if (typeof productComment === 'string') {
      result.comments.settings = settingsComment === undefined
        ? productComment
        : `${settingsComment}\n\nКомментарий с этапа выбора продукта:\n${productComment}`;
    }
    delete result.comments.product;
    result.screens = result.screens.filter(screen => screen.id !== 'product');
  }

  const settingsSource = sourceScreens.find(screen => screen.id === 'settings');
  const settingsDraft = result.screens.find(screen => screen.id === 'settings');
  if (settingsSource && settingsDraft) {
    const priorActions = [
      ...settingsDraft.groups.flatMap(group => group.actions),
      ...(legacyProduct?.groups.flatMap(group => group.actions) || [])
    ];
    settingsDraft.groups = clone(settingsSource.groups).map(group => {
      group.verticalLayout = true;
      group.actions = group.actions.map(action => {
        const prior = priorActions.find(candidate => candidate.id === action.id || candidate.uid === action.uid);
        if (!prior) return action;
        const merged = { ...action, value: prior.value ?? action.value };
        if (prior.customFields?.includes('label')) {
          merged.label = prior.label;
          merged.labelKey = null;
          merged.customFields = [...new Set([...(action.customFields || []), 'label'])];
        }
        if (Array.isArray(prior.options)) merged.options = clone(prior.options);
        return merged;
      });
      return group;
    });
  }

  for (const screen of result.screens) {
    for (const group of screen.groups) {
      for (const action of group.actions) {
        if (screen.id === 'branch' && action.route === 'CHOOSE_PRESENTATION') action.route = action.value = 'NEW_PRESENTATION';
        if (screen.id.startsWith('history-page-') && action.route === 'BACK_CHOICE') action.route = action.value = 'BACK_HISTORY';
      }
    }
  }

  const templateMoves = [
    ['choice.new', 'branch.presentation'],
    ['choice.history', 'history.open']
  ];
  for (const [oldKey, newKey] of templateMoves) {
    if (Object.hasOwn(result.templates, oldKey) && !Object.hasOwn(result.templates, newKey)) {
      result.templates[newKey] = result.templates[oldKey];
    }
    delete result.templates[oldKey];
  }
  if (result.selectedScreen === 'presentation-choice') result.selectedScreen = 'branch';
  if (result.selectedScreen === 'product') result.selectedScreen = 'settings';
  result.schemaVersion = 5;
  return result;
}

export function parseDraft(json, sourceScreens) {
  let value = clone(typeof json === 'string' ? JSON.parse(json) : json);
  if (!isPlainObject(value) || ![1, 2, 3, 4, 5].includes(value.schemaVersion) || !Array.isArray(value.screens)) {
    throw new TypeError('Файл не содержит поддерживаемое предложение.');
  }
  if (!isPlainObject(value.comments) || !isPlainObject(value.templates) || typeof value.selectedScreen !== 'string') {
    throw new TypeError('Предложение содержит неверные комментарии, шаблоны или выбранный экран.');
  }
  for (const screen of value.screens) assertScreen(screen);
  if (value.schemaVersion < 5) value = migrateLegacyDraft(value, sourceScreens);

  const sourceIds = new Set(sourceScreens.map(screen => screen.id));
  if (new Set(value.screens.map(screen => screen.id)).size !== value.screens.length) {
    throw new TypeError('Предложение содержит неверный список экранов.');
  }
  const draftIds = new Set(value.screens.map(screen => screen.id));
  for (const screen of sourceScreens) if (!draftIds.has(screen.id)) value.screens.push(clone(screen));
  const currentDraftIds = new Set(value.screens.map(screen => screen.id));
  for (const screen of value.screens) {
    if (!sourceIds.has(screen.id) && !isExtraHistoryPage(screen.id)) throw new TypeError('Предложение содержит неизвестный экран.');
    assertScreen(screen);
  }
  if (Object.values(value.comments).some(comment => typeof comment !== 'string')
    || Object.values(value.templates).some(template => typeof template !== 'string')) {
    throw new TypeError('Комментарии и шаблоны должны содержать текст.');
  }
  if (!sourceIds.has(value.selectedScreen) && !isExtraHistoryPage(value.selectedScreen)) throw new TypeError('Выбран неизвестный экран.');
  if (!currentDraftIds.has(value.selectedScreen)) throw new TypeError('Выбранный экран отсутствует в предложении.');
  return clone(value);
}

function nextBackupKey(storage, storageKey, revision) {
  const base = `${storageKey}-before-revision-${revision}`;
  if (storage.getItem(base) === null) return base;
  let suffix = 2;
  while (storage.getItem(`${base}-${suffix}`) !== null) suffix += 1;
  return `${base}-${suffix}`;
}

export function loadDraft(storage, sourceScreens, storageKey) {
  const raw = storage.getItem(storageKey);
  if (raw === null) return createDraft(sourceScreens);
  try {
    const loaded = parseDraft(raw, sourceScreens);
    const previousVersion = JSON.parse(raw)?.schemaVersion;
    if (previousVersion !== 5) {
      const revision = Number.isInteger(previousVersion) ? previousVersion : 'unknown';
      storage.setItem(nextBackupKey(storage, storageKey, revision), raw);
      storage.setItem(storageKey, serializeDraft(loaded));
    }
    return loaded;
  } catch {
    let revision = 'unknown';
    try {
      const parsed = JSON.parse(raw);
      if (Number.isInteger(parsed?.schemaVersion)) revision = parsed.schemaVersion;
    } catch { /* Keep the backup revision marked as unknown for invalid JSON. */ }
    storage.setItem(nextBackupKey(storage, storageKey, revision), raw);
    return createDraft(sourceScreens);
  }
}
