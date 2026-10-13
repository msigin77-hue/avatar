import test from 'node:test';
import assert from 'node:assert/strict';
import { initialScenarioState, messageScreenIds, transition } from './scenario-state.mjs';

test('starts at scenario branch with the existing defaults', () => {
  assert.deepEqual(initialScenarioState(), {
    state: 'branch', screenId: 'branch', product: 'ОМС', detail: 'month',
    splitTopics: 'all', chartType: 'histogram', historyPage: 0, reportStatus: null, fileName: null
  });
});

test('keeps the existing period analytics button inert', () => {
  const state = initialScenarioState();
  assert.deepEqual(transition(state, { type: 'ANALYTICS_PERIOD' }), state);
});

test('opens combined presentation settings directly and retains all selections through generation', () => {
  let state = initialScenarioState();
  state = transition(state, { type: 'NEW_PRESENTATION' });
  state = transition(state, { type: 'SET_PRODUCT', value: 'СЛИТКИ' });
  assert.equal(state.state, 'settings');
  state = transition(state, { type: 'SET_DETAIL', value: 'week' });
  state = transition(state, { type: 'SET_SPLIT_TOPICS', value: 'split' });
  state = transition(state, { type: 'SET_CHART_TYPE', value: 'line' });
  state = transition(state, { type: 'GENERATE' });
  assert.equal(state.state, 'report-generating');
  assert.equal(state.reportStatus, 'forming');
  state = transition(state, { type: 'GENERATED', fileName: 'weekly.pptx' });
  assert.equal(state.state, 'report-ready');
  assert.equal(state.reportStatus, 'completed');
  assert.equal(state.fileName, 'weekly.pptx');
  assert.deepEqual([state.product, state.detail, state.splitTopics, state.chartType], ['СЛИТКИ', 'week', 'split', 'line']);
});

test('history opens after settings and returns there with parameters intact', () => {
  let state = transition(initialScenarioState(), { type: 'NEW_PRESENTATION' });
  state = transition(state, { type: 'SET_DETAIL', value: 'week' });
  state = transition(state, { type: 'OPEN_HISTORY' });
  assert.equal(state.state, 'history');
  assert.equal(state.screenId, 'history-page-1');
  state = transition(state, { type: 'HISTORY_PAGE', page: 1, pageCount: 2 });
  assert.equal(state.screenId, 'history-page-2');
  state = transition(state, { type: 'BACK_HISTORY' });
  assert.equal(state.state, 'settings');
  assert.equal(state.screenId, 'settings');
  assert.equal(state.historyPage, 1);
  assert.equal(state.detail, 'week');
});

test('history pagination supports any page count without a hard-coded page ceiling', () => {
  let state = transition(initialScenarioState(), { type: 'NEW_PRESENTATION' });
  state = transition(state, { type: 'OPEN_HISTORY' });
  state = transition(state, { type: 'HISTORY_PAGE', page: 12, pageCount: 13 });
  assert.equal(state.screenId, 'history-page-13');
  const selected = transition(initialScenarioState(), { type: 'SELECT_SCREEN', screenId: 'history-page-13' });
  assert.equal(selected.state, 'history');
  assert.equal(selected.historyPage, 12);
});

test('back from settings and report returns to branch and preserves selections', () => {
  let state = initialScenarioState();
  state = transition(state, { type: 'NEW_PRESENTATION' });
  state = transition(state, { type: 'SET_PRODUCT', value: 'ОМС' });
  state = transition(state, { type: 'SET_DETAIL', value: 'day' });
  state = transition(state, { type: 'BACK_BRANCH' });
  assert.equal(state.state, 'branch');
  assert.equal(state.product, 'ОМС');
  state = transition(state, { type: 'NEW_PRESENTATION' });
  state = transition(state, { type: 'GENERATE' });
  state = transition(state, { type: 'BACK_SETTINGS' });
  assert.equal(state.state, 'settings');
  assert.equal(state.product, 'ОМС');
  assert.equal(state.detail, 'day');
});

test('generation fallback is an existing ready-with-sample state', () => {
  let state = initialScenarioState();
  state = transition(state, { type: 'NEW_PRESENTATION' });
  state = transition(state, { type: 'GENERATE' });
  state = transition(state, { type: 'GENERATION_FAILED', fileName: 'analytics-synthetic-sample.pptx' });
  assert.equal(state.state, 'report-fallback');
  assert.equal(state.reportStatus, 'fallback');
  assert.equal(state.fileName, 'analytics-synthetic-sample.pptx');
});

test('reset returns to the initial state and transitions do not mutate their input', () => {
  const input = transition(initialScenarioState(), { type: 'NEW_PRESENTATION' });
  const snapshot = structuredClone(input);
  assert.deepEqual(transition(input, { type: 'RESET' }), initialScenarioState());
  assert.deepEqual(input, snapshot);
});

test('screen selector displays the history prompt as a separate message on the settings route', () => {
  const selected = transition(initialScenarioState(), { type: 'SELECT_SCREEN', screenId: 'settings-history' });
  assert.equal(selected.state, 'settings');
  assert.equal(selected.screenId, 'settings-history');
});

test('selecting the history follow-up still previews the complete settings conversation', () => {
  assert.deepEqual(messageScreenIds('settings'), ['settings', 'settings-history']);
  assert.deepEqual(messageScreenIds('settings-history'), ['settings', 'settings-history']);
});

test('screen selector can display any source screen without mutating scenario defaults', () => {
  const state = initialScenarioState();
  const selected = transition(state, { type: 'SELECT_SCREEN', screenId: 'history-page-2' });
  assert.equal(selected.screenId, 'history-page-2');
  assert.equal(selected.state, 'history');
  assert.equal(selected.historyPage, 1);
  assert.equal(selected.product, state.product);
  assert.equal(state.screenId, 'branch');
});
