import { messageTemplates } from './messages.mjs';
import { buildHistoryScreen, demoData, products, scenarioTransitions, sourceScreens as featureScreens } from './screen-data.mjs';
import { initialScenarioState, messageScreenIds, transition } from './scenario-state.mjs';
import { buildMessage, buildMessages, createDraft, insertBeforeUid, loadDraft, measureScreen, moveItem, moveItemToPosition, parseDraft, restoreScreen, serializeDraft } from './workbench-model.mjs';
import { generateReports } from './report-data.mjs';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const storageKey = 'period-analytics-workbench-v1';
const historyStorageKey = 'period-analytics-presentation-history-v1';
const presentationMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const staticScreens = featureScreens.map(clone);
const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function formatDate(date, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  return new Intl.DateTimeFormat('ru-RU', options).format(date);
}

function nowPeriodData(settings = app.scenario) {
  return generateReports(settings)[0];
}

function applyTemplates(screen, isDraft) {
  const result = clone(screen);
  if (!isDraft) return result;
  const setField = (item, field, keyField) => {
    const key = item[keyField];
    if (key && Object.hasOwn(app.draft.templates, key)) item[field] = app.draft.templates[key];
    else if (key && messageTemplates[key] !== undefined) item[field] = messageTemplates[key];
  };
  setField(result, 'text', 'textKey');
  for (const group of result.groups) {
    setField(group, 'title', 'titleKey');
    setField(group, 'description', 'descriptionKey');
    for (const action of group.actions) {
      setField(action, 'label', 'labelKey');
      for (const option of action.options || []) setField(option, 'label', 'labelKey');
    }
  }
  return result;
}

function historyCutoff() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  return cutoff;
}

function recentHistory() {
  const cutoff = historyCutoff();
  return app.historyRecords.filter(record => record.createdAt >= cutoff && products.includes(record.product))
    .sort((left, right) => right.createdAt - left.createdAt);
}

function decodeHistoryFile(fileBase64) {
  const bytes = Uint8Array.from(atob(fileBase64), character => character.charCodeAt(0));
  return new Blob([bytes], { type: presentationMime });
}

function loadSavedHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(historyStorageKey) || '[]');
    return stored.map(record => ({
      ...record,
      createdAt: new Date(record.createdAt),
      file: record.fileBase64 ? decodeHistoryFile(record.fileBase64) : null
    })).filter(record => products.includes(record.product));
  } catch {
    return [];
  }
}

async function persistHistory() {
  const cutoff = historyCutoff();
  const savedRecords = app.historyRecords.filter(record => !record.id.startsWith('demo-') && record.createdAt >= cutoff && products.includes(record.product));
  try {
    const values = await Promise.all(savedRecords.map(async record => {
      let fileBase64 = null;
      if (record.file) {
        const bytes = new Uint8Array(await record.file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        fileBase64 = btoa(binary);
      }
      const { file, ...metadata } = record;
      return { ...metadata, fileBase64 };
    }));
    localStorage.setItem(historyStorageKey, JSON.stringify(values));
  } catch {
    app.storageNotice = 'Черновик сохраняется отдельно; браузер не смог сохранить историю PPTX.';
  }
}

const seededHistory = demoData.historyRecords.map(record => ({
  ...clone(record),
  fileUrl: record.filename ? `examples/${record.filename}` : undefined
}));

const app = {
  sourceScreens: [],
  draft: null,
  scenario: initialScenarioState(),
  mode: 'draft',
  width: 'wide',
  outlines: true,
  interact: false,
  selection: { kind: 'text' },
  undo: [],
  payloadMode: 'json',
  dragged: null,
  historyRecords: [...seededHistory, ...loadSavedHistory()],
  currentFile: null,
  activeFilename: null,
  generation: 0,
  storageNotice: '',
  commentSnapshot: null
};

function sourceScreensFor(records, previous = []) {
  const pages = Math.max(2, Math.ceil(records.length / 5), ...previous
    .filter(screen => /^history-page-\d+$/.test(screen.id))
    .map(screen => Number(screen.id.slice('history-page-'.length))));
  const screens = staticScreens.filter(screen => !/^history-page-\d+$/.test(screen.id)).map(clone);
  for (let page = 0; page < pages; page++) screens.push(buildHistoryScreen(page, records));
  return screens;
}

app.sourceScreens = sourceScreensFor(recentHistory());
try {
  const previousDraft = localStorage.getItem(storageKey);
  app.draft = loadDraft(localStorage, app.sourceScreens, storageKey);
  if (previousDraft === null) app.draft.selectedScreen = 'branch';
} catch {
  app.draft = createDraft(app.sourceScreens);
  app.storageNotice = 'Хранилище черновика недоступно. Изменения сохранятся только до закрытия вкладки.';
}
app.scenario = transition(app.scenario, { type: 'SELECT_SCREEN', screenId: app.draft.selectedScreen });

function saveDraft() {
  try {
    localStorage.setItem(storageKey, serializeDraft(app.draft));
    $('save-status').textContent = app.storageNotice || 'Черновик предложения сохранён в этом браузере.';
    return true;
  } catch {
    $('save-status').textContent = 'Браузер не сохранил черновик. Скачай вариант JSON перед закрытием.';
    return false;
  }
}

function rememberUndo() {
  app.undo.push(clone(app.draft));
  if (app.undo.length > 30) app.undo.shift();
}

function sourceScreen(screenId) {
  const found = app.sourceScreens.find(screen => screen.id === screenId);
  if (found) return clone(found);
  const match = /^history-page-(\d+)$/.exec(screenId);
  if (match) return buildHistoryScreen(Number(match[1]) - 1, recentHistory());
  return clone(app.sourceScreens.find(screen => screen.id === 'branch') || app.sourceScreens[0]);
}

function ensureDraftScreen(screenId) {
  let screen = app.draft.screens.find(item => item.id === screenId);
  if (screen) return screen;
  screen = sourceScreen(screenId);
  app.draft.screens.push(screen);
  return screen;
}

function updateSourcePages() {
  const prior = [...app.sourceScreens, ...app.draft.screens];
  app.sourceScreens = sourceScreensFor(recentHistory(), prior);
  for (const screen of app.sourceScreens) ensureDraftScreen(screen.id);
}

function activeScreenId() {
  return app.scenario.screenId || app.draft.selectedScreen || 'branch';
}

function selectedScreenId() {
  return app.selection.screenId || activeScreenId();
}

function payloadForScreen(screenId, isDraft) {
  const ids = messageScreenIds(screenId);
  const screens = ids.map(id => screenFor(id, isDraft));
  return buildMessages(screens, ids, contextForScreen());
}

function baseScreen(screenId = activeScreenId()) {
  return sourceScreen(screenId);
}

function proposedScreen(screenId = activeScreenId()) {
  return ensureDraftScreen(screenId);
}

function contextForScreen() {
  const report = nowPeriodData();
  return {
    ...demoData,
    product: app.scenario.product,
    period: report.range,
    year: report.year,
    month: String(report.month).padStart(2, '0'),
    detail: app.scenario.detail,
    splitTopics: app.scenario.splitTopics,
    chartType: app.scenario.chartType
  };
}

function addCustomField(item, field) {
  item.customFields ||= [];
  if (!item.customFields.includes(field)) item.customFields.push(field);
}

function dynamicHistoryScreen(screenId, isDraft) {
  const page = Math.max(0, Number(screenId.slice('history-page-'.length)) - 1);
  const records = recentHistory();
  const sourceView = buildHistoryScreen(page, records);
  const proposal = isDraft ? proposedScreen(screenId) : null;
  if (isDraft && proposal.groups.length === 0 && sourceView.groups.length > 0) proposal.groups = clone(sourceView.groups);
  let baseGroups = isDraft ? proposal.groups : sourceView.groups;
  const recordGroups = sourceView.groups.filter(group => group.recordId);
  const nonRecordTemplates = baseGroups.filter(group => !group.recordId);
  const templateRecord = status => baseGroups.find(group => group.recordId && group.status === status)
    || sourceView.groups.find(group => group.recordId && group.status === status);
  const pageGroups = recordGroups.map(sourceGroup => {
    const existing = baseGroups.find(group => group.recordId === sourceGroup.recordId);
    const group = existing ? clone(existing) : clone(sourceGroup);
    if (!existing && isDraft) {
      baseGroups = insertBeforeUid(baseGroups, sourceGroup, 'history-pagination');
      proposal.groups = baseGroups;
    }
    if (!group.customFields?.includes('title')) group.title = sourceGroup.title;
    if (!group.customFields?.includes('description')) group.description = sourceGroup.description;
    group.recordId = sourceGroup.recordId;
    group.status = sourceGroup.status;
    group.filename = sourceGroup.filename;
    const record = records.find(item => item.id === sourceGroup.recordId);
    const priorAction = existing?.actions?.find(action => action.route?.startsWith('DOWNLOAD_HISTORY:'));
    group.actions = record?.status === 'completed'
      ? [{ ...sourceGroup.actions[0], label: priorAction?.label || sourceGroup.actions[0]?.label || messageTemplates['history.download'],
          route: `DOWNLOAD_HISTORY:${record.id}`, value: `DOWNLOAD_HISTORY:${record.id}`, fileName: record.filename || sourceGroup.filename }]
      : [];
    return group;
  });
  const pagination = nonRecordTemplates.find(group => group.uid === 'history-pagination') || sourceView.groups.find(group => group.uid === 'history-pagination');
  const back = nonRecordTemplates.find(group => group.uid === 'history-back') || sourceView.groups.find(group => group.uid === 'history-back');
  const pageActions = [];
  if (page > 0) pageActions.push({ uid: 'history-previous', id: 'history-previous', type: 'InteractiveButton', label: messageTemplates['history.previous'], labelKey: 'history.previous', value: `HISTORY_PAGE:${page - 1}`, route: `HISTORY_PAGE:${page - 1}` });
  pageActions.push({ uid: `history-next-${page}`, id: `history-next-${page}`, type: 'InteractiveButton', label: messageTemplates['history.next'], labelKey: 'history.next', value: `HISTORY_PAGE:${page + 1}`, route: `HISTORY_PAGE:${page + 1}`, disabled: page >= sourceView.metadata.pageCount - 1 });
  const paginationGroup = { ...clone(pagination), title: `Страница ${page + 1} из ${sourceView.metadata.pageCount}`, actions: pageActions };
  const groups = [...pageGroups, paginationGroup, clone(back)];
  if (isDraft) {
    const orderOf = uid => {
      const index = baseGroups.findIndex(group => group.uid === uid);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    groups.sort((left, right) => orderOf(left.uid) - orderOf(right.uid));
    const savedPagination = baseGroups.find(group => group.uid === 'history-pagination');
    if (savedPagination) {
      const actionOrder = uid => {
        const index = savedPagination.actions.findIndex(action => action.uid === uid);
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
      };
      paginationGroup.actions.sort((left, right) => actionOrder(left.uid) - actionOrder(right.uid));
    }
  }
  const screen = isDraft ? proposal : sourceView;
  screen.id = screenId;
  screen.label = `История презентаций · страница ${page + 1}`;
  screen.groups = groups;
  screen.metadata = sourceView.metadata;
  if (isDraft) {
    const backGroup = proposal.groups.find(group => group.uid === 'history-back');
    if (backGroup) groups[groups.length - 1] = { ...groups[groups.length - 1], title: backGroup.title, description: backGroup.description, actions: backGroup.actions };
    proposal.groups = groups.map(group => {
      const saved = proposal.groups.find(item => item.uid === group.uid);
      return saved ? { ...group, ...saved, recordId: group.recordId, status: group.status, filename: group.filename, actions: group.actions } : group;
    });
    screen.groups = proposal.groups;
  }
  return screen;
}

function screenFor(screenId, isDraft) {
  if (screenId.startsWith('history-page-')) return dynamicHistoryScreen(screenId, isDraft);
  const screen = isDraft ? proposedScreen(screenId) : baseScreen(screenId);
  const result = applyTemplates(screen, isDraft);
  if (result.attachment) result.attachment.filename = app.activeFilename || result.attachment.filename;
  if (screenId === 'settings') {
    const choices = { 'product-select': app.scenario.product, 'detail-select': app.scenario.detail, 'topics-select': app.scenario.splitTopics, 'chart-select': app.scenario.chartType };
    for (const action of result.groups.flatMap(group => group.actions)) if (choices[action.id]) action.value = choices[action.id];
  }
  if (screenId.startsWith('report-')) {
    for (const group of result.groups) if (group.attachment && app.activeFilename && !group.customFields?.includes('title')) group.title = app.activeFilename;
  }
  return result;
}

function markdownInline(value) {
  return escapeHtml(value)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(text) {
  const blocks = String(text ?? '').split(/\n\s*\n/);
  const content = blocks.map(block => {
    const lines = block.split('\n');
    if (lines.every(line => /^[-*] /.test(line))) return `<ul>${lines.map(line => `<li>${markdownInline(line.replace(/^[-*] /, ''))}</li>`).join('')}</ul>`;
    if (lines.every(line => /^\d+\. /.test(line))) return `<ol>${lines.map(line => `<li>${markdownInline(line.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    return `<p>${lines.map(markdownInline).join('<br>')}</p>`;
  }).join('');
  return `<div class="markdown-body">${content}</div>`;
}

function findSelectionNode(selection) {
  const screen = proposedScreen(selection.screenId || activeScreenId());
  if (selection.kind === 'text') return { object: screen, field: 'text', key: 'message.text', path: 'message.text' };
  const groupIndex = screen.groups.findIndex(group => group.uid === selection.groupUid);
  if (groupIndex < 0) return null;
  const group = screen.groups[groupIndex];
  if (selection.kind === 'action') {
    const actionIndex = group.actions.findIndex(action => action.uid === selection.actionUid);
    if (actionIndex < 0) return null;
    const action = group.actions[actionIndex];
    return { object: action, field: 'label', key: action.labelKey || null, path: `groups[${groupIndex}].actions[${actionIndex}].label`, group, action };
  }
  const field = selection.kind === 'title' ? 'title' : 'description';
  return { object: group, field, key: group[`${field}Key`] || null, path: `groups[${groupIndex}].${field}`, group };
}

function resolveValue(value, data) {
  return String(value ?? '').replace(/\{([\w-]+)\}/g, (match, key) => data[key] === undefined ? match : String(data[key]));
}

function currentScreenModel(screen, isDraft) {
  const data = contextForScreen();
  return buildMessage(screen, data);
}

function fullTextMessageView(message) {
  const lines = [`[message.text]`, message.text || '(пусто)'];
  message.groups.forEach((group, index) => {
    lines.push('', `[groups[${index}].title]`, group.title || '(пусто)');
    lines.push(`[groups[${index}].description]`, group.description || '(пусто)');
    group.actions.forEach((action, actionIndex) => {
      lines.push(`[groups[${index}].actions[${actionIndex}]]`, `${action.type}: ${action.label ?? '(без подписи)'}`);
      if (action.options) for (const option of action.options) lines.push(`  ${option.value}: ${option.label}`);
    });
  });
  return lines.join('\n');
}

function fullTextView(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  return list.map((message, index) => `${list.length > 1 ? `Сообщение ${index + 1}\n` : ''}${fullTextMessageView(message)}`).join('\n\n──────────\n\n');
}

function groupMeasureText(measure) {
  return `title ${measure.title.actual}/${measure.title.limit} · description ${measure.description.actual}/${measure.description.limit} UTF-16`;
}

function displayLabel(value, data) {
  return resolveValue(value ?? '', data);
}

function selectedClass(kind, groupUid, actionUid, screenId = activeScreenId()) {
  const selectedScreen = app.selection.screenId || activeScreenId();
  const selected = app.mode === 'draft' && app.selection.kind === kind
    && selectedScreen === screenId
    && (groupUid === undefined || app.selection.groupUid === groupUid)
    && (actionUid === undefined || app.selection.actionUid === actionUid);
  return selected ? ' chosen' : '';
}

function selectTarget(kind, groupUid, actionUid, screenId = activeScreenId()) {
  return `data-select-kind="${kind}" data-screen-id="${escapeHtml(screenId)}"${groupUid ? ` data-group-id="${escapeHtml(groupUid)}"` : ''}${actionUid ? ` data-action-id="${escapeHtml(actionUid)}"` : ''}`;
}

function findRouteAction(action) {
  return action.route || action.value || '';
}

function renderAction(action, group, groupIndex, actionIndex, data, editable, screenId) {
  const isSelect = action.type === 'InteractiveSelect';
  const isAttachment = Boolean(group.attachment);
  const selected = selectedClass('action', group.uid, action.uid, screenId);
  const key = selectTarget('action', group.uid, action.uid, screenId);
  const route = findRouteAction(action);
  let control;
  if (isSelect) {
    const options = (action.options || []).map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(action.value) ? 'selected' : ''}>${escapeHtml(displayLabel(option.label, data))}</option>`).join('');
    const fieldLabel = displayLabel(action.label, data);
    if (app.interact) {
      control = `<label class="sdk-select-label"><span class="sdk-label">${escapeHtml(fieldLabel)}</span><select class="field-preview" data-control-route="${escapeHtml(route)}" ${action.disabled ? 'disabled' : ''}>${options}</select></label>`;
    } else {
      const activeOption = action.options?.find(option => String(option.value) === String(action.value));
      control = `<button class="select-mock editable${selected}" type="button" ${key}><span class="select-caption">${escapeHtml(fieldLabel)}: ${escapeHtml(displayLabel(activeOption?.label, data))}</span><span class="select-arrow" aria-hidden="true">⌄</span></button>`;
    }
  } else {
    const buttonLabel = displayLabel(action.label, data);
    const className = action.primary ? ' primary' : '';
    control = `<button class="action-button${className}${selected}" type="button" ${key} ${app.interact && route ? `data-demo-route="${escapeHtml(route)}"` : ''} ${action.disabled ? 'disabled' : ''}>${escapeHtml(buttonLabel)}</button>`;
  }
  const actionHtml = `<div class="sdk-action${isAttachment ? ' is-attachment' : ''}" draggable="${editable && !isSelect}" data-drag-kind="action" data-group-id="${escapeHtml(group.uid)}" data-action-id="${escapeHtml(action.uid)}">${control}${app.outlines && action.id ? `<span class="action-tag">${escapeHtml(action.type)} · ${escapeHtml(action.id)}</span>` : ''}</div>`;
  return actionHtml;
}

function renderGroup(group, groupIndex, measure, data, editable, screenId) {
  const title = displayLabel(group.title, data);
  const description = displayLabel(group.description, data);
  const titleMarkup = `<div class="group-field group-title editable${selectedClass('title', group.uid, undefined, screenId)}" ${selectTarget('title', group.uid, undefined, screenId)}>${title ? escapeHtml(title) : '<span class="empty-field">(title отсутствует)</span>'}</div>`;
  const descriptionMarkup = `<div class="group-field plain-description editable${selectedClass('description', group.uid, undefined, screenId)}" ${selectTarget('description', group.uid, undefined, screenId)}>${description ? escapeHtml(description) : '<span class="empty-field">(description отсутствует)</span>'}</div>`;
  const groupMetrics = measure ? `<div class="group-metrics">${groupMeasureText(measure)}</div>` : '';
  const dragButton = editable ? `<button class="drag-handle" type="button" draggable="true" data-drag-kind="group" data-group-id="${escapeHtml(group.uid)}" aria-label="Перетащить группу">⠿</button>` : '';
  const record = group.recordId ? app.historyRecords.find(item => item.id === group.recordId) : null;
  const recordStatus = record || group.status ? `<span class="history-status ${escapeHtml(record?.status || group.status)}">${escapeHtml(record?.status === 'completed' ? 'Завершено' : record?.status === 'forming' ? 'Формируется' : group.status === 'completed' ? 'Завершено' : 'Формируется')}</span>` : '';
  const actionHtml = group.actions.map((action, actionIndex) => renderAction(action, group, groupIndex, actionIndex, data, editable, screenId)).join('');
  const classes = `sdk-group${group.recordId ? ' record-group' : ''}${group.attachment ? ' attachment-group' : ''}${group.verticalLayout ? ' vertical-layout' : ''}`;
  const fileCard = group.attachment
    ? `<div class="file-card"><div class="file-icon">PPTX</div><div class="file-meta"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></div>${actionHtml}</div>`
    : `<div class="sdk-actions">${actionHtml}</div>`;
  return `<section class="${classes}" draggable="${editable}" data-drag-kind="group" data-group-id="${escapeHtml(group.uid)}">
    <div class="group-topline">${titleMarkup}${recordStatus}${dragButton}</div>
    ${descriptionMarkup}${groupMetrics}${fileCard}
  </section>`;
}

function renderMessage(screen, version, isDraft, messageIndex = 0) {
  const data = contextForScreen();
  const displayScreen = applyTemplates(screen, isDraft);
  const message = buildMessage(displayScreen, data);
  const measurements = measureScreen(displayScreen, data);
  const editable = isDraft && app.mode === 'draft';
  const classes = `chat ${app.width === 'narrow' ? 'narrow' : ''} ${app.outlines ? '' : 'no-outlines'}`;
  const sequenceLabel = messageIndex > 0 ? '<div class="message-sequence-label">Отдельное сообщение</div>' : '';
  let context = '';
  if (screen.id === 'branch') {
    const welcome = buildMessage(applyTemplates(baseScreen('welcome'), false), data);
    const productsMessage = buildMessage(applyTemplates(baseScreen('products'), false), data);
    context = `<div class="chat-context"><div class="context-message">${renderMarkdown(welcome.text)}</div><div class="context-message">${renderMarkdown(productsMessage.text)}</div></div>`;
  }
  const messageText = `<div class="message-field editable${selectedClass('text', undefined, undefined, screen.id)}" ${selectTarget('text', undefined, undefined, screen.id)}>${message.text ? renderMarkdown(message.text) : (app.outlines ? '<span class="empty-field">message.text отсутствует</span>' : '')}</div>`;
  const groupMarkup = displayScreen.groups.map((group, index) => renderGroup(group, index, measurements.groups[index], data, editable, screen.id)).join('');
  const warnings = measurements.violations.map(item => `<div class="limit-warning">${escapeHtml(item.field)}: ${item.actual}/${item.limit}${item.provisional ? ' · предварительная граница' : ''}</div>`).join('');
  const limitLabel = `message.text ${measurements.messageText.actual}/${measurements.messageText.limit} UTF-16 · группы ${measurements.groupCount.actual}/${measurements.groupCount.limit}`;
  return `<div class="${classes}${messageIndex > 0 ? ' followup-message' : ''}" data-version="${escapeHtml(version)}" data-screen-id="${escapeHtml(screen.id)}">${sequenceLabel}${context}<div class="sdk-label">message.text · ${measurements.messageText.actual}/${measurements.messageText.limit} UTF-16</div>${messageText}${groupMarkup}<div class="message-time">09:42</div>${warnings}<div class="screen-limits${measurements.violations.length ? ' has-errors' : ''}">${escapeHtml(limitLabel)}</div></div>`;
}

function renderVersion(screenId, version, isDraft) {
  const ids = messageScreenIds(screenId);
  const messages = ids.map(id => screenFor(id, isDraft));
  const groupCount = messages.reduce((count, screen) => count + screen.groups.length, 0);
  const content = messages.map((screen, index) => renderMessage(screen, version, isDraft, index)).join('');
  return `<div class="preview-version"><div class="version-title"><span>${escapeHtml(version)}</span><span>${groupCount} групп · ${messages.length} сообщения</span></div>${content}</div>`;
}

function screenLabel(screenId) {
  return app.sourceScreens.find(screen => screen.id === screenId)?.label
    || app.draft.screens.find(screen => screen.id === screenId)?.label
    || (screenId.startsWith('history-page-') ? `История презентаций · страница ${screenId.slice('history-page-'.length)}` : screenId);
}

function updateScreenPicker() {
  const select = $('screen');
  const screenIds = new Set([...app.sourceScreens.map(screen => screen.id), ...app.draft.screens.map(screen => screen.id)]);
  const options = [...screenIds].map(id => new Option(screenLabel(id), id));
  if (!screenIds.has(activeScreenId())) options.push(new Option(screenLabel(activeScreenId()), activeScreenId()));
  select.replaceChildren(...options);
  select.value = activeScreenId();
}

function currentSourceForSelector(screenId) {
  return sourceScreen(screenId);
}

function updatePayload(message) {
  $('payload').classList.toggle('text-payload', app.payloadMode === 'text');
  $('payload').textContent = app.payloadMode === 'json' ? JSON.stringify(message, null, 2) : fullTextView(message);
  $('show-json').setAttribute('aria-pressed', String(app.payloadMode === 'json'));
  $('show-text').setAttribute('aria-pressed', String(app.payloadMode === 'text'));
}

function render() {
  updateScreenPicker();
  const screenId = activeScreenId();
  const isHistory = screenId.startsWith('history-page-');
  const title = isHistory ? screenLabel(screenId) : screenLabel(screenId);
  $('screen-title').textContent = title;
  $('screen-count').textContent = `${app.draft.screens.length} экранов`;
  $('source').textContent = app.mode === 'current'
    ? 'Источник: прежний макет аналитической презентации; это не снимок работающего сервиса.'
    : app.mode === 'compare'
      ? 'Слева — прежний макет. Справа — редактируемое предложение.'
      : 'Предложение · изменения сохраняются только в черновике этого макета.';
  const preview = $('preview');
  preview.classList.toggle('compare', app.mode === 'compare');
  if (app.mode === 'compare') {
    preview.innerHTML = renderVersion(screenId, 'Как сейчас', false)
      + renderVersion(screenId, 'Предложение', true);
  } else if (app.mode === 'current') {
    preview.innerHTML = renderVersion(screenId, 'Как сейчас', false);
  } else {
    preview.innerHTML = renderVersion(screenId, 'Предложение', true);
  }
  document.body.classList.toggle('no-outlines', !app.outlines);
  for (const mode of ['current', 'draft', 'compare']) $(`mode-${mode}`).setAttribute('aria-pressed', String(app.mode === mode));
  $('width').value = app.width;
  $('outlines').checked = app.outlines;
  $('interact').checked = app.interact;
  const messages = payloadForScreen(screenId, app.mode !== 'current');
  updatePayload(messages.length === 1 ? messages[0] : messages);
  renderEditor();
  renderTemplateCatalog();
  $('note').hidden = !app.storageNotice;
  $('note').textContent = app.storageNotice;
}

function renderEditor() {
  const readOnly = app.mode !== 'draft';
  const found = readOnly ? null : findSelectionNode(app.selection);
  $('edit-hint').textContent = readOnly
    ? app.mode === 'current' ? 'Исходный вариант доступен только для чтения. Переключись на «Предложение», чтобы редактировать.' : 'Сравнение доступно только для чтения. Переключись на «Предложение», чтобы редактировать.'
    : 'Текст редактируется как есть. Markdown работает только в message.text.';
  $('field-editor').disabled = readOnly || !found;
  $('save-field').disabled = readOnly || !found;
  $('up').disabled = readOnly || !found || !['title', 'description', 'action'].includes(app.selection.kind);
  $('down').disabled = $('up').disabled;
  $('undo').disabled = readOnly || app.undo.length === 0;
  $('baseline').disabled = readOnly;
  $('comment').disabled = readOnly;
  $('vertical').disabled = readOnly || !found?.group;
  $('options-editor-wrap').hidden = !found?.action || found.action.type !== 'InteractiveSelect';
  $('options-editor').disabled = readOnly || $('options-editor-wrap').hidden;
  if (found) {
    $('selection-title').textContent = found.key || found.path;
    $('field-editor').value = String(found.object[found.field] ?? '');
    $('field-key').textContent = found.path;
    $('vertical').checked = Boolean(found.group?.verticalLayout);
    if (found.action?.type === 'InteractiveSelect') {
      $('options-editor').value = (found.action.options || []).map(option => `${option.value} | ${option.label}`).join('\n');
    } else {
      $('options-editor').value = '';
    }
    updateFieldMetrics(found);
    updateMoveControls(found);
  } else {
    $('selection-title').textContent = 'Элемент не выбран';
    $('field-editor').value = '';
    $('field-key').textContent = '';
    $('field-metrics').textContent = '';
    $('field-constraint').hidden = true;
    $('vertical').checked = false;
    $('up').disabled = true;
    $('down').disabled = true;
  }
  $('comment').value = app.draft.comments[selectedScreenId()] || '';
  $('save-status').textContent ||= app.storageNotice;
}

function updateFieldMetrics(found) {
  const data = contextForScreen();
  const value = resolveValue(found.object[found.field] ?? '', data);
  let limit = null;
  if (found.field === 'text') limit = 4096;
  if (found.field === 'title') limit = 128;
  if (found.field === 'description') limit = 256;
  const metrics = limit === null
    ? `${value.length} UTF-16 · отдельный предел для этого поля не установлен`
    : `${value.length}/${limit} UTF-16`;
  $('field-metrics').textContent = metrics;
  $('field-metrics').classList.toggle('over', limit !== null && value.length > limit);
  const notes = {
    text: 'message.text поддерживает Markdown и располагается перед всеми группами.',
    title: 'Title — обычный текст без Markdown и ручных переносов. Значение не обрезается.',
    description: 'Description — обычный текст без Markdown и ручных переносов. Значение не обрезается.',
    label: 'Для подписи действия отдельный предел длины не установлен.'
  };
  $('field-constraint').hidden = false;
  $('field-constraint').textContent = notes[found.field] || 'Лимит не подтверждён.';
}

function updateMoveControls(found) {
  if (!found.group || app.selection.kind === 'text') return;
  const screen = proposedScreen(selectedScreenId());
  const collection = app.selection.kind === 'action' ? found.group.actions : screen.groups;
  const uid = app.selection.kind === 'action' ? app.selection.actionUid : app.selection.groupUid;
  const index = collection.findIndex(item => item.uid === uid);
  $('up').disabled = index <= 0;
  $('down').disabled = index < 0 || index >= collection.length - 1;
}

function renderTemplateCatalog() {
  const keys = Object.keys(messageTemplates).sort();
  const select = $('template-key');
  const prior = select.value;
  select.replaceChildren(...keys.map(key => new Option(key, key)));
  if (keys.includes(prior)) select.value = prior;
  showTemplate();
}

function showTemplate() {
  const key = $('template-key').value;
  if (!key) return;
  $('catalog-editor').value = Object.hasOwn(app.draft.templates, key) ? app.draft.templates[key] : messageTemplates[key];
  $('catalog-editor').disabled = app.mode !== 'draft';
  $('apply-template').disabled = app.mode !== 'draft';
  const usage = app.sourceScreens.reduce((count, screen) => {
    const items = [screen, ...screen.groups, ...screen.groups.flatMap(group => group.actions), ...screen.groups.flatMap(group => group.actions.flatMap(action => action.options || []))];
    return count + items.filter(item => Object.values(item).includes(key)).length;
  }, 0);
  $('template-usage').textContent = `Шаблон связан с элементами макета: ${usage}.`;
}

function selectElement(element) {
  if (app.mode !== 'draft') return;
  app.selection = {
    kind: element.dataset.selectKind,
    groupUid: element.dataset.groupId,
    actionUid: element.dataset.actionId,
    screenId: element.dataset.screenId || activeScreenId()
  };
  document.body.classList.add('editor-open');
  render();
}

function snapshotForField(info) {
  if (!info) return;
  addCustomField(info.object, info.field);
  info.object[`${info.field}Key`] = null;
}

function saveSelectedField() {
  const found = findSelectionNode(app.selection);
  if (!found || app.mode !== 'draft') return;
  rememberUndo();
  snapshotForField(found);
  found.object[found.field] = $('field-editor').value;
  if (found.action?.type === 'InteractiveSelect') {
    const nextOptions = $('options-editor').value.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      const separator = line.indexOf('|');
      if (separator < 0) return { value: String(index + 1), label: line.trim() };
      return { value: line.slice(0, separator).trim(), label: line.slice(separator + 1).trim() };
    });
    found.action.options = nextOptions;
    for (const option of nextOptions) option.customFields = ['label'];
  }
  saveDraft();
  render();
  $('action-log').textContent = 'Поле обновлено в предложении.';
}

function reorderWithin(screen, selection, targetUid) {
  screen.groups = moveItemToPosition(screen, selection, targetUid).groups;
}

function moveSelected(direction) {
  if (app.mode !== 'draft' || !['group', 'action', 'title', 'description'].includes(app.selection.kind)) return;
  const selection = app.selection.kind === 'title' || app.selection.kind === 'description'
    ? { kind: 'group', groupUid: app.selection.groupUid }
    : app.selection;
  rememberUndo();
  const screen = proposedScreen(selectedScreenId());
  const moved = moveItem(screen, selection, direction);
  screen.groups = moved.groups;
  saveDraft();
  render();
}

function dispatchRoute(route, value) {
  if (!route) return;
  if (route === 'ANALYTICS_PERIOD') {
    $('action-log').textContent = 'Кнопка «Аналитика за период» в текущем макете не ведёт в отдельный сценарий.';
    return;
  }
  if (route.startsWith('DOWNLOAD_HISTORY:')) {
    downloadHistory(route.slice('DOWNLOAD_HISTORY:'.length));
    return;
  }
  if (route === 'DOWNLOAD_ATTACHMENT') {
    downloadCurrentAttachment();
    return;
  }
  let event;
  if (route.startsWith('HISTORY_PAGE:')) {
    const pageCount = Math.max(1, Math.ceil(recentHistory().length / 5));
    event = { type: 'HISTORY_PAGE', page: Number(route.split(':')[1]), pageCount };
  } else if (route === 'SET_PRODUCT' || route === 'SET_DETAIL' || route === 'SET_SPLIT_TOPICS' || route === 'SET_CHART_TYPE') {
    event = { type: route, value };
  } else {
    event = { ...(scenarioTransitions[route] || { type: route }) };
  }
  const previousState = app.scenario.state;
  const previousScreenId = app.scenario.screenId;
  app.scenario = transition(app.scenario, event);
  if (app.scenario === undefined) return;
  if (app.scenario.screenId !== previousScreenId) app.selection = { kind: 'text', screenId: app.scenario.screenId };
  if (app.scenario.screenId !== activeScreenId() || app.scenario.state !== previousState) {
    if (app.scenario.state !== 'report-generating') app.activeFilename = app.scenario.state === 'report-fallback' ? 'analytics-synthetic-sample.pptx' : app.scenario.state === 'report-ready' ? app.activeFilename : null;
  }
  const screenId = app.scenario.screenId;
  const isHistoryScreen = /^history-page-\d+$/.test(screenId);
  if (app.sourceScreens.some(screen => screen.id === screenId) || isHistoryScreen) {
    app.draft.selectedScreen = screenId;
    if (isHistoryScreen) updateSourcePages();
    saveDraft();
  }
  render();
  if (event.type === 'GENERATE' && app.scenario.state === 'report-generating') generatePresentation();
}

function renderPayloadAndReport() {
  const screenId = activeScreenId();
  const messages = payloadForScreen(screenId, app.mode !== 'current');
  updatePayload(messages.length === 1 ? messages[0] : messages);
}

function simulateAction(route, value) {
  if (!app.interact) return false;
  dispatchRoute(route, value);
  return true;
}

function selectScreen(screenId) {
  app.scenario = transition(app.scenario, { type: 'SELECT_SCREEN', screenId });
  app.draft.selectedScreen = screenId;
  if (screenId.startsWith('history-page-')) updateSourcePages();
  app.selection = { kind: 'text', screenId };
  saveDraft();
  render();
}

function pushTransitionBack(event) {
  app.scenario = transition(app.scenario, event);
}

function addHistoryRecord() {
  const report = nowPeriodData();
  const record = {
    id: `generated-${Date.now()}`,
    product: app.scenario.product,
    period: report.range,
    createdAt: new Date(),
    status: 'forming',
    filename: null,
    file: null
  };
  app.historyRecords.unshift(record);
  updateSourcePages();
  return record;
}

function minimumDelay() {
  return new Promise(resolve => setTimeout(resolve, 3000));
}

async function generatePresentation() {
  const generation = ++app.generation;
  const historyRecord = addHistoryRecord();
  const reports = generateReports(app.scenario);
  const wait = minimumDelay();
  try {
    const request = fetch('/api/presentation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports })
    });
    const response = await Promise.all([request, wait]).then(([result]) => result);
    if (!response.ok) throw new Error(await response.text());
    app.currentFile = await response.blob();
    const detailName = app.scenario.detail;
    app.activeFilename = `Презентация_${reports[0].year}_${String(reports[0].month).padStart(2, '0')}_${detailName}.pptx`;
    historyRecord.status = 'completed';
    historyRecord.file = app.currentFile;
    historyRecord.filename = app.activeFilename;
    await persistHistory();
    if (generation !== app.generation || app.scenario.state !== 'report-generating') return;
    app.scenario = transition(app.scenario, { type: 'GENERATED', fileName: app.activeFilename });
    app.draft.selectedScreen = 'report-ready';
    updateSourcePages();
    saveDraft();
    render();
  } catch {
    await wait;
    if (generation !== app.generation) return;
    const sampleFile = app.scenario.detail === 'week' ? 'analytics-weekly-synthetic-sample.pptx' : 'analytics-synthetic-sample.pptx';
    app.activeFilename = sampleFile;
    historyRecord.status = 'completed';
    historyRecord.fileUrl = `examples/${sampleFile}`;
    historyRecord.filename = sampleFile;
    await persistHistory();
    if (app.scenario.state !== 'report-generating') return;
    app.scenario = transition(app.scenario, { type: 'GENERATION_FAILED', fileName: sampleFile });
    app.draft.selectedScreen = 'report-fallback';
    updateSourcePages();
    saveDraft();
    render();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadUrl(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function downloadHistory(recordId) {
  const record = app.historyRecords.find(item => item.id === recordId);
  if (!record) return;
  if (record.file) downloadBlob(record.file, record.filename || 'analytics.pptx');
  else if (record.fileUrl) downloadUrl(record.fileUrl, record.filename || 'analytics-synthetic-sample.pptx');
  $('action-log').textContent = record.file || record.fileUrl ? `Скачивание презентации «${record.product}» началось.` : 'Файл пока формируется.';
}

function downloadCurrentAttachment() {
  if (app.currentFile) downloadBlob(app.currentFile, app.activeFilename || 'analytics.pptx');
  else {
    const report = nowPeriodData();
    const matchingRecords = recentHistory().filter(record => record.product === app.scenario.product && record.period === report.range);
    const savedFile = matchingRecords.find(record => record.file) || matchingRecords.find(record => record.fileUrl);
    if (savedFile) downloadHistory(savedFile.id);
    else if (app.activeFilename) downloadUrl(`examples/${app.activeFilename}`, app.activeFilename);
    else downloadUrl('examples/analytics-synthetic-sample.pptx', 'analytics-synthetic-sample.pptx');
  }
  $('action-log').textContent = 'Скачивание презентации началось.';
}

function openOutputDialog(title, content, filename) {
  $('export-name').textContent = title;
  $('export-content').value = content;
  $('export-content').dataset.filename = filename;
  $('export-status').textContent = '';
  $('export-dialog').showModal();
}

function exportDraft() {
  openOutputDialog('Вариант JSON', serializeDraft(app.draft), 'period-analytics-proposal.json');
}

function exportText() {
  const screenId = activeScreenId();
  const messages = payloadForScreen(screenId, app.mode !== 'current');
  openOutputDialog(`Текстовый вид · ${screenLabel(screenId)}`, fullTextView(messages), `period-analytics-${screenId}.txt`);
}

async function copyText(text, output = $('export-status')) {
  try {
    await navigator.clipboard.writeText(text);
    output.textContent = 'Скопировано.';
  } catch {
    output.textContent = 'Копирование недоступно в этом окне. Выдели текст и скопируй вручную.';
  }
}

async function importDraft(file) {
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    $('action-log').textContent = 'Файл больше 3 МБ; импорт не выполнен. Текущий черновик сохранён.';
    return;
  }
  try {
    const parsed = parseDraft(await file.text(), app.sourceScreens);
    rememberUndo();
    app.draft = parsed;
    app.scenario = transition(app.scenario, { type: 'SELECT_SCREEN', screenId: parsed.selectedScreen });
    app.selection = { kind: 'text' };
    saveDraft();
    $('action-log').textContent = 'Вариант импортирован. Исходный макет и история презентаций не изменены.';
    render();
  } catch (error) {
    $('action-log').textContent = `Импорт не выполнен: ${error.message}. Текущий черновик сохранён.`;
  }
}

function addTemplateOverride() {
  if (app.mode !== 'draft') return;
  const key = $('template-key').value;
  if (!key) return;
  rememberUndo();
  app.draft.templates[key] = $('catalog-editor').value;
  saveDraft();
  render();
  $('action-log').textContent = `Шаблон «${key}» обновлён в предложении.`;
}

function fullResetScenario() {
  app.generation++;
  app.currentFile = null;
  app.activeFilename = null;
  app.scenario = initialScenarioState();
  app.draft.selectedScreen = 'branch';
  app.selection = { kind: 'text' };
  saveDraft();
  render();
}

function restoreSelectedScreen() {
  if (app.mode !== 'draft') return;
  rememberUndo();
  const screenId = selectedScreenId();
  app.draft = restoreScreen(app.draft, app.sourceScreens, screenId);
  app.selection = { kind: 'text', screenId };
  saveDraft();
  render();
  $('action-log').textContent = 'Предложение выбранного экрана восстановлено из прежнего макета. Комментарий сохранён.';
}

function moveSelectionTo(direction, targetUid) {
  if (app.mode !== 'draft') return;
  rememberUndo();
  const screen = proposedScreen(selectedScreenId());
  if (app.selection.kind === 'group') reorderWithin(screen, app.selection, targetUid);
  if (app.selection.kind === 'action') reorderWithin(screen, app.selection, targetUid);
  saveDraft();
  render();
}

function handlePreviewClick(event) {
  const target = event.target.closest('[data-demo-route], [data-select-kind]');
  if (!target) return;
  if (target.dataset.demoRoute && simulateAction(target.dataset.demoRoute, target.dataset.value)) return;
  if (target.dataset.selectKind) selectElement(target);
}

function routeFromControl(action, value) {
  dispatchRoute(action.dataset.controlRoute, value);
}

function setComment(value) {
  if (app.mode !== 'draft') return;
  const screenId = selectedScreenId();
  if (app.commentSnapshot === null) {
    rememberUndo();
    app.commentSnapshot = app.draft.comments[screenId] || '';
  }
  app.draft.comments[screenId] = value;
  saveDraft();
}

function initializeEvents() {
  $('screen').addEventListener('change', event => selectScreen(event.target.value));
  $('mode-current').addEventListener('click', () => { app.mode = 'current'; app.selection = { kind: 'text' }; render(); });
  $('mode-draft').addEventListener('click', () => { app.mode = 'draft'; app.selection = { kind: 'text' }; render(); });
  $('mode-compare').addEventListener('click', () => { app.mode = 'compare'; app.selection = { kind: 'text' }; render(); });
  $('width').addEventListener('change', event => { app.width = event.target.value; render(); });
  $('outlines').addEventListener('change', event => { app.outlines = event.target.checked; render(); });
  $('interact').addEventListener('change', event => { app.interact = event.target.checked; render(); });
  $('preview').addEventListener('click', handlePreviewClick);
  $('preview').addEventListener('change', event => {
    const control = event.target.closest('[data-control-route]');
    if (control) routeFromControl(control, control.value);
  });
  $('preview').addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-drag-kind]');
    if (!handle || app.mode !== 'draft' || app.interact) { event.preventDefault(); return; }
    const { dragKind, groupId, actionId } = handle.dataset;
    app.dragged = dragKind === 'group' ? { kind: 'group', groupUid: groupId } : { kind: 'action', groupUid: groupId, actionUid: actionId };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', actionId || groupId || 'item');
  });
  $('preview').addEventListener('dragover', event => {
    const target = event.target.closest('.sdk-group, .sdk-action');
    if (!target || !app.dragged || app.mode !== 'draft') return;
    event.preventDefault();
    target.classList.add('drop-target');
  });
  $('preview').addEventListener('dragleave', event => event.target.closest('.drop-target')?.classList.remove('drop-target'));
  $('preview').addEventListener('drop', event => {
    const target = event.target.closest('.sdk-group, .sdk-action');
    if (!target || !app.dragged) return;
    event.preventDefault();
    const dragged = app.dragged;
    app.dragged = null;
    target.classList.remove('drop-target');
    const targetUid = target.dataset.groupId || target.closest('.sdk-group')?.dataset.groupId;
    const itemUid = dragged.kind === 'group' ? target.dataset.groupId : target.dataset.actionId;
    if (targetUid && itemUid && (dragged.kind === 'group' || dragged.groupUid === targetUid)) moveSelectionTo('target', itemUid);
  });
  $('preview').addEventListener('dragend', () => { app.dragged = null; document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); });

  $('save-field').addEventListener('click', saveSelectedField);
  $('field-editor').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') saveSelectedField(); });
  $('up').addEventListener('click', () => moveSelected('up'));
  $('down').addEventListener('click', () => moveSelected('down'));
  $('vertical').addEventListener('change', event => {
    const found = findSelectionNode(app.selection);
    if (!found?.group || app.mode !== 'draft') return;
    rememberUndo();
    found.group.verticalLayout = event.target.checked;
    saveDraft();
    render();
  });
  $('comment').addEventListener('input', event => setComment(event.target.value));
  $('comment').addEventListener('blur', () => { app.commentSnapshot = null; });
  $('undo').addEventListener('click', () => {
    if (app.mode !== 'draft' || !app.undo.length) return;
    app.draft = app.undo.pop();
    app.selection = { kind: 'text' };
    saveDraft();
    render();
  });
  $('baseline').addEventListener('click', restoreSelectedScreen);
  $('reset').addEventListener('click', fullResetScenario);
  $('open-editor').addEventListener('click', () => document.body.classList.add('editor-open'));
  $('close-editor').addEventListener('click', () => document.body.classList.remove('editor-open'));

  $('show-json').addEventListener('click', () => { app.payloadMode = 'json'; renderPayloadAndReport(); });
  $('show-text').addEventListener('click', () => { app.payloadMode = 'text'; renderPayloadAndReport(); });
  $('copy-payload').addEventListener('click', () => copyText($('payload').textContent, $('action-log')));
  $('export').addEventListener('click', exportDraft);
  $('export-text').addEventListener('click', exportText);
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => { await importDraft(event.target.files?.[0]); event.target.value = ''; });
  $('template-key').addEventListener('change', showTemplate);
  $('apply-template').addEventListener('click', addTemplateOverride);
  $('copy-export').addEventListener('click', () => copyText($('export-content').value));
  $('download-export').addEventListener('click', () => {
    const filename = $('export-content').dataset.filename || 'period-analytics-proposal.json';
    const blob = new Blob([$('export-content').value], { type: filename.endsWith('.json') ? 'application/json' : 'text/plain' });
    downloadBlob(blob, filename);
    $('export-status').textContent = 'Файл сформирован.';
  });
  $('close-export').addEventListener('click', () => $('export-dialog').close());
}

initializeEvents();
render();
