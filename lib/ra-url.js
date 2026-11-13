const EVENT_PATH = /\/events\/(\d+)/;
const EVENT_HOST = /^(?:[a-z0-9-]+\.)*ra\.co$/i;

export function eventIdFromUrl(value) {
  try {
    const url = new URL(value);
    if (!EVENT_HOST.test(url.hostname)) {
      return null;
    }
    return EVENT_PATH.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isEventUrl(value) {
  return eventIdFromUrl(value) !== null;
}
