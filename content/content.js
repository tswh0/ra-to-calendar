/**
 * RA to Calendar - Content Script
 * Extracts event data from Resident Advisor event pages
 * Handles SPA navigation by watching for URL changes
 */

(function() {
  'use strict';

  const DATA_WAIT_TIMEOUT_MS = 2500;
  const DATA_WAIT_INTERVAL_MS = 150;

  let lastEventId = null;

  /**
   * Extract event ID from current URL
   */
  function getEventIdFromUrl(url = window.location.href) {
    const pathname = new URL(url, window.location.origin).pathname;
    const match = pathname.match(/\/events\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract event data from the RA page
   */
  function extractEventData(sourceDocument = document, sourceUrl = window.location.href) {
    const eventId = getEventIdFromUrl(sourceUrl);
    const data = {
      title: '',
      dateStart: null,
      dateEnd: null,
      venue: '',
      address: '',
      lineup: [],
      url: sourceUrl.split('?')[0],
      eventId: eventId
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
      const nextData = JSON.parse(nextDataScript.textContent);
      const apolloState = nextData?.props?.apolloState;
      if (!apolloState) {
        return null;
      }

      const eventKey = `Event:${eventId}`;
      const eventData = apolloState[eventKey];
      if (!eventData) {
        return null;
      }

      const extracted = {
        title: eventData.title || '',
        description: eventData.content || '',
        dateStart: parseDateValue(eventData.startTime),
        dateEnd: parseDateValue(eventData.endTime),
        venue: '',
        address: '',
        lineup: []
      };

      if (eventData.venue && eventData.venue.__ref) {
        const venueData = apolloState[eventData.venue.__ref];
        if (venueData) {
          extracted.venue = venueData.name || '';
          extracted.address = venueData.address || '';
        }
      }

      if (eventData.lineup) {
        extracted.lineup = parseLineupString(eventData.lineup);
      }

      if (Array.isArray(eventData.artists)) {
        eventData.artists.forEach((artistRef) => {
          if (!artistRef.__ref) {
            return;
          }
          const artistData = apolloState[artistRef.__ref];
          if (artistData?.name && !extracted.lineup.includes(artistData.name)) {
            extracted.lineup.push(artistData.name);
          }
        });
      }

      return extracted;
    } catch (error) {
      console.error('[RA to Calendar] Could not parse __NEXT_DATA__:', error);
      return null;
    }
  }

  function extractFromJsonLd(sourceDocument = document) {
    const scripts = Array.from(sourceDocument.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent);
        const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [])];
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
          dateStart: parseDateValue(eventNode.startDate),
          dateEnd: parseDateValue(eventNode.endDate),
          venue: eventNode.location?.name || '',
          address: formatPostalAddress(eventNode.location?.address),
          lineup: performers
            .map((performer) => performer?.name || '')
            .filter(Boolean)
        };
      } catch (error) {
        console.warn('[RA to Calendar] Could not parse JSON-LD block:', error);
      }
    }

    return null;
  }

  function extractFromDom(sourceDocument = document) {
    const title = getText([
      'h1',
      '[data-testid="event-title"]',
      'meta[property="og:title"]'
    ], 'content', sourceDocument);
    const venue = getText([
      '[data-testid="venue-link"]',
      'a[href*="/clubs/"]',
      'a[href*="/venues/"]'
    ], null, sourceDocument);
    const address = getText([
      '[data-testid="event-venue-address"]',
      'address',
      '[itemprop="address"]'
    ], null, sourceDocument);

    const timeElement = sourceDocument.querySelector('time[datetime]');
    const dateStart = parseDateValue(timeElement?.getAttribute('datetime'));

    const description = getText([
      'meta[name="description"]',
      'meta[property="og:description"]'
    ], 'content', sourceDocument);

    return {
      title: title || '',
      description: description || '',
      dateStart,
      dateEnd: null,
      venue: venue || '',
      address: address || '',
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
      if (!element) {
        continue;
      }
      const value = attribute ? element.getAttribute(attribute) : element.textContent;
      if (value && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  function parseDateValue(value) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function mergeEventData(target, source) {
    if (!source) {
      return target;
    }

    if (!target.title && source.title) {
      target.title = source.title;
    }
    if (!target.description && source.description) {
      target.description = source.description;
    }
    if (!target.dateStart && source.dateStart) {
      target.dateStart = source.dateStart;
    }
    if (!target.dateEnd && source.dateEnd) {
      target.dateEnd = source.dateEnd;
    }
    if (!target.venue && source.venue) {
      target.venue = source.venue;
    }
    if (!target.address && source.address) {
      target.address = source.address;
    }

    target.lineup = uniqueValues([...(target.lineup || []), ...(source.lineup || [])]);
    return target;
  }

  function uniqueValues(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  function isCompleteEventData(eventData) {
    return Boolean(eventData?.title && eventData?.dateStart);
  }

  async function waitForCompleteEventData(options = {}) {
    const timeoutMs = options.timeoutMs || DATA_WAIT_TIMEOUT_MS;
    const intervalMs = options.intervalMs || DATA_WAIT_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const eventData = extractEventData();

      if (isCompleteEventData(eventData)) {
        return eventData;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const eventData = extractEventData();
    return eventData;
  }

  async function fetchEventDataFromPageSource(sourceUrl) {
    try {
      const response = await fetch(sourceUrl, {
        credentials: 'same-origin',
        cache: 'no-store'
      });

      if (!response.ok) {
        console.warn('[RA to Calendar] Failed to fetch event source:', response.status);
        return null;
      }

      const html = await response.text();
      const parser = new DOMParser();
      const sourceDocument = parser.parseFromString(html, 'text/html');
      const eventData = extractEventData(sourceDocument, sourceUrl);

      return isCompleteEventData(eventData) ? eventData : null;
    } catch (error) {
      console.warn('[RA to Calendar] Failed to fetch event page source:', error);
      return null;
    }
  }

  /**
   * Parse lineup string like "<artist id=\"123\">Name</artist> \nName2"
   */
  function parseLineupString(lineupStr) {
    if (!lineupStr) return [];
    
    const artists = [];
    
    // Match <artist id="...">Name</artist>
    const artistTagRegex = /<artist[^>]*>([^<]+)<\/artist>/g;
    let match;
    while ((match = artistTagRegex.exec(lineupStr)) !== null) {
      const name = match[1].trim();
      if (name && !artists.includes(name)) {
        artists.push(name);
      }
    }
    
    // Also match standalone names (not in tags)
    const lines = lineupStr.split('\n');
    lines.forEach(line => {
      // Remove artist tags and get remaining text
      const cleaned = line.replace(/<artist[^>]*>.*?<\/artist>/g, '').trim();
      if (cleaned && !artists.includes(cleaned)) {
        artists.push(cleaned);
      }
    });
    
    return artists;
  }

  /**
   * Check for URL changes (SPA navigation)
   */
  function checkForNavigation() {
    const currentEventId = getEventIdFromUrl();
    if (currentEventId && currentEventId !== lastEventId) {
      console.log(`[RA to Calendar] Navigation detected: ${lastEventId} -> ${currentEventId}`);
      lastEventId = currentEventId;
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'extractEvent') {
      checkForNavigation();

      (async () => {
        let eventData = await waitForCompleteEventData();

        if (!isCompleteEventData(eventData)) {
          const fetchedEventData = await fetchEventDataFromPageSource(window.location.href);
          if (fetchedEventData) {
            eventData = fetchedEventData;
          }
        }

        if (!isCompleteEventData(eventData)) {
          sendResponse({
            success: false,
            error: 'EVENT_DATA_INCOMPLETE',
            data: eventData
          });
        } else {
          sendResponse({ success: true, data: eventData });
        }
      })();
    }
    return true;
  });

  // Watch for URL changes using History API
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    checkForNavigation();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    checkForNavigation();
  };

  window.addEventListener('popstate', checkForNavigation);

  // Also poll for changes (fallback)
  setInterval(checkForNavigation, 1000);

  // Initial extraction
  lastEventId = getEventIdFromUrl();
})();
