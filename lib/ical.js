const DEFAULT_DURATION_MS = 6 * 60 * 60 * 1000;
const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

export function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const pad = (part) => String(part).padStart(2, '0');

export function formatUtc(value) {
  const date = toDate(value);
  if (!date) {
    return '';
  }

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z'
  ].join('');
}

export function formatFloating(value) {
  const date = toDate(value);
  if (!date) {
    return '';
  }

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function octets(value) {
  return encoder.encode(value).length;
}

function trailingBackslashes(value) {
  const match = value.match(/\\+$/);
  return match ? match[0].length : 0;
}

export function foldLine(line) {
  if (octets(line) <= MAX_LINE_OCTETS) {
    return line;
  }

  const chunks = [];
  let chunk = '';
  let size = 0;
  let limit = MAX_LINE_OCTETS;

  for (const char of line) {
    const width = octets(char);

    if (size + width > limit) {
      if (trailingBackslashes(chunk) % 2 === 1) {
        chunk = chunk.slice(0, -1);
        size -= 1;
      }
      chunks.push(chunk);
      chunk = '';
      size = 0;
      limit = MAX_LINE_OCTETS - 1;
    }

    chunk += char;
    size += width;
  }

  chunks.push(chunk);

  return chunks.join('\r\n ');
}

function eventUid(event) {
  const source = event.eventId || event.url || event.title || 'event';
  return `${String(source).replace(/[\r\n]/g, '')}@ra-to-calendar`;
}

function eventLocation(event) {
  return [event.venue, event.address].filter(Boolean).join(', ');
}

function eventDescription(event) {
  const parts = [];
  if (Array.isArray(event.lineup) && event.lineup.length > 0) {
    parts.push(`Lineup: ${event.lineup.join(', ')}`);
  }
  if (event.description) {
    parts.push(event.description);
  }
  if (event.url) {
    parts.push(event.url);
  }
  return parts.join('\n');
}

export function buildIcal(event) {
  const start = toDate(event?.dateStart);
  if (!start) {
    return null;
  }

  const end = toDate(event.dateEnd) ?? new Date(start.getTime() + DEFAULT_DURATION_MS);
  const format = event.dateStartFloating ? formatFloating : formatUtc;
  const location = eventLocation(event);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RA to Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${eventUid(event)}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${format(start)}`,
    `DTEND:${format(end)}`,
    `SUMMARY:${escapeText(event.title || 'Event')}`
  ];

  if (location) {
    lines.push(`LOCATION:${escapeText(location)}`);
  }

  lines.push(`DESCRIPTION:${escapeText(eventDescription(event))}`);

  if (event.url) {
    lines.push(`URL:${String(event.url).replace(/[\r\n]/g, '')}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
