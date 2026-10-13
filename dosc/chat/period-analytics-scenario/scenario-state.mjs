export const sourceScreenIds = Object.freeze([
  'welcome', 'products', 'branch', 'history-page-1',
  'history-page-2', 'settings', 'settings-history', 'report-generating', 'report-ready', 'report-fallback'
]);

export function messageScreenIds(screenId) {
  return screenId === 'settings' || screenId === 'settings-history'
    ? ['settings', 'settings-history']
    : [screenId];
}

export function initialScenarioState() {
  return {
    state: 'branch',
    screenId: 'branch',
    product: 'ОМС',
    detail: 'month',
    splitTopics: 'all',
    chartType: 'histogram',
    historyPage: 0,
    reportStatus: null,
    fileName: null
  };
}

function withRoute(state, nextState, screenId = nextState) {
  return { ...state, state: nextState, screenId };
}

export function transition(state, event) {
  if (!state || !event || typeof event.type !== 'string') return state;
  switch (event.type) {
    case 'RESET':
      return initialScenarioState();
    case 'SELECT_SCREEN':
      if (!sourceScreenIds.includes(event.screenId) && !/^history-page-(?:[3-9]|[1-9]\d+)$/.test(event.screenId || '')) return state;
      if (event.screenId.startsWith('history-page-')) {
        const historyPage = Number(event.screenId.slice('history-page-'.length)) - 1;
        return { ...state, state: 'history', screenId: event.screenId, historyPage };
      }
      if (event.screenId === 'report-generating') return { ...state, state: 'report-generating', screenId: event.screenId, reportStatus: 'forming', fileName: null };
      if (event.screenId === 'report-ready') return { ...state, state: 'report-ready', screenId: event.screenId, reportStatus: 'completed' };
      if (event.screenId === 'report-fallback') return { ...state, state: 'report-fallback', screenId: event.screenId, reportStatus: 'fallback' };
      if (event.screenId === 'settings-history') return { ...state, state: 'settings', screenId: event.screenId };
      return { ...state, state: event.screenId, screenId: event.screenId };
    case 'ANALYTICS_PERIOD':
      return state;
    case 'NEW_PRESENTATION':
      return state.state === 'branch' ? withRoute(state, 'settings') : state;
    case 'OPEN_HISTORY':
      return ['settings', 'history'].includes(state.state)
        ? { ...withRoute(state, 'history', 'history-page-1'), historyPage: 0 }
        : state;
    case 'HISTORY_PAGE': {
      if (state.state !== 'history') return state;
      const count = Number.isInteger(event.pageCount) && event.pageCount > 0 ? event.pageCount : 1;
      const page = Math.min(Math.max(0, Number(event.page) || 0), count - 1);
      return { ...state, historyPage: page, screenId: `history-page-${page + 1}` };
    }
    case 'BACK_BRANCH':
      return state.state === 'settings' ? withRoute(state, 'branch') : state;
    case 'BACK_HISTORY':
      return state.state === 'history' ? withRoute(state, 'settings') : state;
    case 'SET_PRODUCT':
      return state.state === 'settings' && typeof event.value === 'string' ? { ...state, product: event.value } : state;
    case 'SET_DETAIL':
      return state.state === 'settings' && ['month', 'week', 'day'].includes(event.value) ? { ...state, detail: event.value } : state;
    case 'SET_SPLIT_TOPICS':
      return state.state === 'settings' && ['all', 'split'].includes(event.value) ? { ...state, splitTopics: event.value } : state;
    case 'SET_CHART_TYPE':
      return state.state === 'settings' && ['histogram', 'line'].includes(event.value) ? { ...state, chartType: event.value } : state;
    case 'GENERATE':
      return state.state === 'settings' ? { ...withRoute(state, 'report-generating'), reportStatus: 'forming', fileName: null } : state;
    case 'GENERATED':
      return state.state === 'report-generating'
        ? { ...withRoute(state, 'report-ready'), reportStatus: 'completed', fileName: String(event.fileName || '') }
        : state;
    case 'GENERATION_FAILED':
      return state.state === 'report-generating'
        ? { ...withRoute(state, 'report-fallback'), reportStatus: 'fallback', fileName: String(event.fileName || '') }
        : state;
    case 'BACK_SETTINGS':
      return ['report-generating', 'report-ready', 'report-fallback'].includes(state.state)
        ? { ...withRoute(state, 'settings'), reportStatus: null, fileName: null }
        : state;
    default:
      return state;
  }
}
