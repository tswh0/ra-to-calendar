import test from 'node:test';
import assert from 'node:assert/strict';

import { eventIdFromUrl, isEventUrl } from '../lib/ra-url.js';

test('accepts every Resident Advisor locale', () => {
  const urls = [
    'https://ra.co/events/2535669',
    'https://www.ra.co/events/2535669',
    'https://de.ra.co/events/2535669',
    'https://es.ra.co/events/2535669',
    'https://ja.ra.co/events/2535669',
    'https://br.ra.co/events/2535669',
    'https://de.ra.co/events/2535669?referrer=search',
    'https://de.ra.co/events/2535669#lineup',
    'https://de.ra.co/events/2535669/'
  ];

  for (const url of urls) {
    assert.equal(eventIdFromUrl(url), '2535669', url);
    assert.equal(isEventUrl(url), true, url);
  }
});

test('rejects non-event and look-alike hosts', () => {
  const urls = [
    'https://ra.co/clubs/12345',
    'https://de.ra.co/events',
    'https://de.ra.co/events/not-a-number',
    'https://ra.co.evil.com/events/2535669',
    'https://notra.co/events/2535669',
    'https://ra.co@evil.com/events/2535669',
    'https://evil.com/ra.co/events/2535669',
    'chrome://extensions',
    'not a url'
  ];

  for (const url of urls) {
    assert.equal(eventIdFromUrl(url), null, url);
    assert.equal(isEventUrl(url), false, url);
  }
});
