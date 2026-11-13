const DATA_WAIT_TIMEOUT_MS = 2500;
const DATA_WAIT_INTERVAL_MS = 150;
const ZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function getEventIdFromUrl(url = window.location.href) {
  const match = new URL(url, window.location.origin).pathname.match(/\/events\/(\d+)/);
  return match ? match[1] : null;
}

function extractEventData(sourceDocument = document, sourceUrl = window.location.href) {
  const eventId = getEventIdFromUrl(sourceUrl);
  const data = {
    title: '',
    description: '',
    dateStart: null,
    dateEnd: null,
    venue: '',
    address: '',
    lineup: [],
    url: sourceUrl.split(/[?#]/)[0],
    eventId
  };

  if (!eventId) {
    return data;
  }

  mergeEventData(data, extractFromNextData(eventId, sourceDocument));
  mergeEventData(data, extractFromJsonLd(sourceDocument));
  mergeEventData(data, extractFromDom(sourceDocument));

  return data;
}

function extractFromNextData(eventId, sourceDocument = document) {
  const nextDataScript = sourceDocument.getElementById('__NEXT_DATA__');
  if (!nextDataScript) {
    return null;
  }

  try {
    const apolloState = JSON.parse(nextDataScript.textContent)?.props?.apolloState;
    const eventData = apolloState?.[`Event:${eventId}`];
    if (!eventData) {
      return null;
    }

    const venueData = eventData.venue?.__ref ? apolloState[eventData.venue.__ref] : null;
    const extracted = {
      title: eventData.title || '',
      description: eventData.content || '',
      dateStart: parseTimestamp(eventData.startTime),
      dateEnd: parseTimestamp(eventData.endTime),
      venue: venueData?.name || '',
      address: venueData?.address || '',
      lineup: eventData.lineup ? parseLineupString(eventData.lineup) : []
    };

    if (Array.isArray(eventData.artists)) {
      eventData.artists.forEach((artistRef) => {
        const artistName = artistRef?.__ref ? apolloState[artistRef.__ref]?.name : null;
        if (artistName && !extracted.lineup.includes(artistName)) {
          extracted.lineup.push(artistName);
        }
      });
    }

    return extracted;
  } catch (error) {
    console.warn('[RA to Calendar] Could not parse __NEXT_DATA__:', error);
    return null;
  }
}

function extractFromJsonLd(sourceDocument = document) {
  const scripts = Array.from(sourceDocument.querySelectorAll('script[type="application/ld+json"]'));

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent);
      const candidates = [
        ...(Array.isArray(parsed) ? parsed : [parsed]),
        ...(Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [])
      ];
      const eventNode = candidates.find((candidate) => {
        const type = candidate?.['@type'];
        return type === 'Event' || (Array.isArray(type) && type.includes('Event'));
      });

      if (!eventNode) {
        continue;
      }

      const performers = Array.isArray(eventNode.performer)
        ? eventNode.performer
        : eventNode.performer ? [eventNode.performer] : [];

      return {
        title: eventNode.name || '',
        description: eventNode.description || '',
        dateStart: parseTimestamp(eventNode.startDate),
        dateEnd: parseTimestamp(eventNode.endDate),
        venue: eventNode.location?.name || '',
        address: formatPostalAddress(eventNode.location?.address),
        lineup: performers.map((performer) => performer?.name || '').filter(Boolean)
      };
    } catch (error) {
      console.warn('[RA to Calendar] Could not parse JSON-LD block:', error);
    }
  }

  return null;
}

function extractFromDom(sourceDocument = document) {
  return {
    title: getText(['h1', '[data-testid="event-title"]', 'meta[property="og:title"]'], 'content', sourceDocument),
    description: getText(['meta[name="description"]', 'meta[property="og:description"]'], 'content', sourceDocument),
    dateStart: parseTimestamp(sourceDocument.querySelector('time[datetime]')?.getAttribute('datetime')),
    dateEnd: null,
    venue: getText(['[data-testid="venue-link"]', 'a[href*="/clubs/"]', 'a[href*="/venues/"]'], null, sourceDocument),
    address: getText(['[data-testid="event-venue-address"]', 'address', '[itemprop="address"]'], null, sourceDocument),
    lineup: extractLineupFromDom(sourceDocument)
  };
}

function extractLineupFromDom(sourceDocument = document) {
  const selectors = [
    '[data-testid="lineup"] a',
    '[data-testid="lineup"] *',
    'a[href*="/dj/"]',
    'a[href*="/artists/"]'
  ];

  for (const selector of selectors) {
    const names = Array.from(sourceDocument.querySelectorAll(selector))
      .map((node) => node.textContent.trim())
      .filter(Boolean);

    if (names.length > 0) {
      return uniqueValues(names);
    }
  }

  return [];
}

function formatPostalAddress(address) {
  if (!address) {
    return '';
  }

  if (typeof address === 'string') {
    return address.trim();
  }

  return [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry
  ].filter(Boolean).join(', ');
}

function getText(selectors, attribute, sourceDocument = document) {
  for (const selector of selectors) {
    const element = sourceDocument.querySelector(selector);
    const value = element ? (attribute ? element.getAttribute(attribute) : element.textContent) : '';
    if (value?.trim()) {
      return value.trim();
    }
  }

  return '';
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return { date, floating: !ZONE_SUFFIX.test(text) };
}

function mergeEventData(target, source) {
  if (!source) {
    return target;
  }

  for (const field of ['title', 'description', 'venue', 'address']) {
    if (!target[field] && source[field]) {
      target[field] = source[field];
    }
  }

  for (const field of ['dateStart', 'dateEnd']) {
    if (source[field] && (!target[field] || (target[field].floating && !source[field].floating))) {
      target[field] = source[field];
    }
  }

  target.lineup = uniqueValues([...target.lineup, ...(source.lineup || [])]);
  return target;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isCompleteEventData(eventData) {
  return Boolean(eventData?.title && eventData?.dateStart);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCompleteEventData() {
  const deadline = Date.now() + DATA_WAIT_TIMEOUT_MS;
  let eventData = extractEventData();

  while (!isCompleteEventData(eventData) && Date.now() < deadline) {
    await delay(DATA_WAIT_INTERVAL_MS);
    eventData = extractEventData();
  }

  return eventData;
}

async function fetchEventDataFromPageSource(sourceUrl) {
  try {
    const response = await fetch(sourceUrl, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const sourceDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
    const eventData = extractEventData(sourceDocument, sourceUrl);

    return isCompleteEventData(eventData) ? eventData : null;
  } catch (error) {
    console.warn('[RA to Calendar] Could not fetch event page source:', error);
    return null;
  }
}

function parseLineupString(lineupStr) {
  if (!lineupStr) {
    return [];
  }

  const names = [];
  const artistTagRegex = /<artist[^>]*>([^<]+)<\/artist>/g;
  let match;

  while ((match = artistTagRegex.exec(lineupStr)) !== null) {
    names.push(match[1].trim());
  }

  lineupStr.split('\n').forEach((line) => {
    names.push(line.replace(/<artist[^>]*>.*?<\/artist>/g, '').trim());
  });

  return uniqueValues(names);
}

function toMessagePayload(eventData) {
  return {
    ...eventData,
    dateStart: eventData.dateStart?.date ?? null,
    dateStartFloating: eventData.dateStart?.floating ?? false,
    dateEnd: eventData.dateEnd?.date ?? null,
    dateEndFloating: eventData.dateEnd?.floating ?? false
  };
}

async function extractCompleteEventData() {
  let eventData = await waitForCompleteEventData();

  if (!isCompleteEventData(eventData)) {
    eventData = await fetchEventDataFromPageSource(window.location.href) ?? eventData;
  }

  return eventData;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action !== 'extractEvent') {
    return false;
  }

  extractCompleteEventData()
    .then((eventData) => {
      const data = toMessagePayload(eventData);
      sendResponse(isCompleteEventData(eventData)
        ? { success: true, data }
        : { success: false, error: 'EVENT_DATA_INCOMPLETE', data });
    })
    .catch((error) => {
      console.error('[RA to Calendar] Extraction failed:', error);
      sendResponse({ success: false, error: 'EVENT_DATA_UNAVAILABLE' });
    });

  return true;
});
