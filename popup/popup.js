import { buildIcal, eventEnd, formatFloating, formatUtc, toDate } from '../lib/ical.js';
import { isEventUrl } from '../lib/ra-url.js';

const MESSAGE_RETRY_ATTEMPTS = 4;
const MESSAGE_RETRY_DELAY_MS = 150;
const RELOAD_TIMEOUT_MS = 15000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const api = globalThis.browser ?? chrome;

const elements = {
  eventInfo: document.getElementById('event-info'),
  eventTitle: document.getElementById('event-title'),
  eventDate: document.getElementById('event-date'),
  eventVenue: document.getElementById('event-venue'),
  errorMessage: document.getElementById('error-message'),
  actions: document.getElementById('actions'),
  loading: document.getElementById('loading'),
  loadingLabel: document.getElementById('loading-label'),
  downloadIcs: document.getElementById('download-ics'),
  addGoogle: document.getElementById('add-google')
};

let eventData = null;

async function init() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url || !isEventUrl(tab.url)) {
      showError('NOT_RA_EVENT_PAGE');
      return;
    }

    let response = await requestEventData(tab.id);

    if (!response) {
      response = await reloadTabAndRetry(tab.id);
    }

    if (response?.success && response.data) {
      eventData = response.data;
      showEventInfo();
    } else {
      showError(response?.error || 'EVENT_DATA_UNAVAILABLE');
    }
  } catch (error) {
    console.error('[RA to Calendar] Failed to extract event data:', error);
    showError('EVENT_DATA_UNAVAILABLE');
  }
}

async function requestEventData(tabId) {
  try {
    return await api.tabs.sendMessage(tabId, { action: 'extractEvent' });
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }
    return retrySendMessage(tabId, MESSAGE_RETRY_ATTEMPTS, MESSAGE_RETRY_DELAY_MS);
  }
}

async function retrySendMessage(tabId, attempts, waitMs) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await delay(waitMs);

    try {
      return await api.tabs.sendMessage(tabId, { action: 'extractEvent' });
    } catch (error) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }
    }
  }

  return null;
}

function isMissingReceiverError(error) {
  const message = error?.message;
  return typeof message === 'string' && (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reloadTabAndRetry(tabId) {
  elements.loadingLabel.textContent = 'Refreshing page';

  const loaded = waitForTabComplete(tabId);
  await api.tabs.reload(tabId);
  await loaded;

  return requestEventData(tabId);
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      api.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timed out waiting for tab reload'));
    }, RELOAD_TIMEOUT_MS);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
        return;
      }
      clearTimeout(timeoutId);
      api.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    api.tabs.onUpdated.addListener(listener);
  });
}

function showEventInfo() {
  elements.loading.hidden = true;
  elements.eventInfo.hidden = false;
  elements.actions.hidden = false;

  elements.eventTitle.textContent = eventData.title || 'Untitled event';
  elements.eventTitle.title = eventData.title || '';
  elements.eventDate.textContent = formatDateRange(eventData.dateStart, eventData.dateEnd);
  elements.eventVenue.textContent = eventData.venue || 'Venue unknown';
}

function showError(errorCode) {
  elements.loading.hidden = true;
  elements.eventInfo.hidden = true;
  elements.actions.hidden = true;
  elements.errorMessage.hidden = false;

  const message = getErrorMessage(errorCode);
  elements.errorMessage.querySelector('[data-role="message"]').textContent = message.message;
  elements.errorMessage.querySelector('[data-role="hint"]').textContent = message.hint;
}

function getErrorMessage(errorCode) {
  if (errorCode === 'NOT_RA_EVENT_PAGE') {
    return {
      message: 'Not a Resident Advisor event page',
      hint: 'Open a page like ra.co/events/2304772'
    };
  }

  return {
    message: 'Could not extract event details',
    hint: 'Resident Advisor may have changed the page structure for this event'
  };
}

function formatDateRange(start, end) {
  const startDate = toDate(start);
  if (!startDate) {
    return 'Date to be announced';
  }

  const day = (date) => `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const time = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const head = `${day(startDate)} ${startDate.getFullYear()}`;

  const endDate = toDate(end);
  if (!endDate) {
    return `${head} · ${time(startDate)}`;
  }

  const spansDays = endDate.toDateString() !== startDate.toDateString();
  const withinTwoDays = endDate - startDate < 48 * 60 * 60 * 1000;
  const tail = spansDays && !withinTwoDays ? `${day(endDate)} ${time(endDate)}` : time(endDate);

  return `${head} · ${time(startDate)}–${tail}`;
}

function downloadIcs() {
  const ical = buildIcal(eventData);
  if (!ical) {
    return;
  }

  const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const slug = (eventData.title || '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const filename = `${slug || eventData.eventId || 'event'}.ics`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function addToGoogle() {
  const start = toDate(eventData?.dateStart);
  if (!start) {
    return;
  }

  const end = eventEnd(eventData);
  if (!end) {
    return;
  }

  const format = eventData.dateStartFloating ? formatFloating : formatUtc;
  const details = [
    eventData.lineup?.length ? `Lineup: ${eventData.lineup.join(', ')}` : '',
    eventData.description,
    eventData.url
  ].filter(Boolean).join('\n\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventData.title || 'Event',
    location: [eventData.venue, eventData.address].filter(Boolean).join(', '),
    details,
    dates: `${format(start)}/${format(end)}`
  });

  api.tabs.create({ url: `https://calendar.google.com/calendar/render?${params.toString()}` });
}

elements.downloadIcs.addEventListener('click', downloadIcs);
elements.addGoogle.addEventListener('click', addToGoogle);

init();
