import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIcal, escapeText, foldLine, formatUtc } from '../lib/ical.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function physicalLines(ical) {
  return ical.split('\r\n');
}

function unfold(value) {
  return value.replace(/\r\n /g, '');
}

function unescapeText(value) {
  return value.replace(/\\([\\;,n])/g, (_match, char) => (char === 'n' ? '\n' : char));
}

function sampleEvent(overrides = {}) {
  return {
    eventId: '2304772',
    title: 'Whities x RA',
    description: 'All night long.',
    dateStart: '2026-11-20T23:00:00Z',
    dateEnd: '2026-11-21T06:00:00Z',
    venue: 'Fold',
    address: 'Gillender St, London E3 3JX',
    lineup: ['Ben UFO', 'Objekt'],
    url: 'https://ra.co/events/2304772',
    ...overrides
  };
}

test('escapeText escapes backslashes before other characters', () => {
  assert.equal(escapeText(String.raw`C:\music, live; now`), String.raw`C:\\music\, live\; now`);
  assert.equal(escapeText(String.raw`\,`), String.raw`\\\,`);
  assert.equal(escapeText('a\r\nb\nc'), String.raw`a\nb\nc`);
});

test('escapeText survives a round trip', () => {
  const original = 'Line one, with;semi\\backslash\nline two';
  assert.equal(unescapeText(escapeText(original)), original);
});

test('formatUtc renders UTC timestamps and rejects junk', () => {
  assert.equal(formatUtc('2026-11-20T23:00:00Z'), '20261120T230000Z');
  assert.equal(formatUtc(new Date(Date.UTC(2026, 0, 2, 3, 4, 5))), '20260102T030405Z');
  assert.equal(formatUtc('not a date'), '');
  assert.equal(formatUtc(null), '');
});

test('foldLine keeps every physical line within 75 octets', () => {
  const line = `DESCRIPTION:${'a'.repeat(400)}`;
  const lines = foldLine(line).split('\r\n');

  assert.ok(lines.length > 1);
  for (const physical of lines) {
    assert.ok(encoder.encode(physical).length <= 75, `line too long: ${physical.length}`);
    decoder.decode(encoder.encode(physical));
  }
  assert.equal(unfold(foldLine(line)), line);
});

test('foldLine never splits multi-byte characters', () => {
  const line = `SUMMARY:${'東京のクラブ'.repeat(30)}`;
  const folded = foldLine(line);

  for (const physical of folded.split('\r\n')) {
    assert.ok(encoder.encode(physical).length <= 75);
    decoder.decode(encoder.encode(physical));
  }
  assert.equal(unfold(folded), line);
  assert.ok(!folded.includes('\uFFFD'));
});

test('foldLine never ends a line on a lone escape backslash', () => {
  const line = `${'x'.repeat(73)}\\n${'y'.repeat(20)}`;

  for (const physical of foldLine(line).split('\r\n')) {
    const trailing = physical.match(/\\+$/)?.[0].length ?? 0;
    assert.equal(trailing % 2, 0, `line ends on a lone backslash: ${physical}`);
  }
  assert.equal(unfold(foldLine(line)), line);
});

test('foldLine wraps the escaped description without corrupting it', () => {
  const original = 'Zeitgeist, Session; "special"\\n' + 'a'.repeat(120);
  const folded = foldLine(`DESCRIPTION:${escapeText(original)}`);

  assert.equal(unescapeText(unfold(folded)).slice('DESCRIPTION:'.length), original);
});

test('buildIcal refuses events without a start date', () => {
  assert.equal(buildIcal(sampleEvent({ dateStart: null })), null);
  assert.equal(buildIcal(sampleEvent({ dateStart: 'garbage' })), null);
  assert.equal(buildIcal(null), null);
});

test('buildIcal emits CRLF line endings only', () => {
  const ical = buildIcal(sampleEvent());

  assert.ok(ical.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ical.endsWith('END:VCALENDAR\r\n'));
  assert.equal(/(?<!\r)\n/.test(ical), false);
});

test('buildIcal defaults the end time to six hours after the start', () => {
  const ical = buildIcal(sampleEvent({ dateEnd: null }));

  assert.match(ical, /DTSTART:20261120T230000Z/);
  assert.match(ical, /DTEND:20261121T050000Z/);
});

test('buildIcal keeps a stable UID for the same event', () => {
  const first = buildIcal(sampleEvent());
  const second = buildIcal(sampleEvent({ title: 'Renamed night', dateEnd: null }));

  assert.match(first, /UID:2304772@ra-to-calendar/);
  assert.match(second, /UID:2304772@ra-to-calendar/);
});

test('buildIcal escapes summary and location but not the URL', () => {
  const ical = buildIcal(sampleEvent({ title: 'Ben UFO, Objekt; Live', venue: 'Fold, London' }));

  assert.match(ical, /SUMMARY:Ben UFO\\, Objekt\\; Live/);
  assert.match(ical, /LOCATION:Fold\\, London/);
  assert.match(ical, /URL:https:\/\/ra\.co\/events\/2304772/);
});

test('buildIcal produces a parseable event body', () => {
  const unscoped = unfold(buildIcal(sampleEvent()));
  const keys = unscoped
    .split('\r\n')
    .filter((line) => line.includes(':'))
    .map((line) => line.slice(0, line.indexOf(':')));

  for (const required of ['BEGIN', 'UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'DESCRIPTION']) {
    assert.ok(keys.includes(required), `missing ${required}`);
  }
  assert.match(unscoped, /DESCRIPTION:Lineup: Ben UFO\\, Objekt\\nAll night long\.\\nhttps:\/\/ra\.co\/events\/2304772/);
});

test('buildIcal drops CRLF injection attempts in the URL field', () => {
  const ical = buildIcal(sampleEvent({ url: 'https://ra.co/events/2304772\r\nSUMMARY:Injected' }));

  assert.equal(unescapedSummaryCount(ical), 1);
});

function unescapedSummaryCount(ical) {
  return ical.split('\r\n').filter((line) => line.startsWith('SUMMARY:')).length;
}
