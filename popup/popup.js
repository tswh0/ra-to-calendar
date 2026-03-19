/**
 * RA to Calendar - Popup Script
 * Handles UI and calendar export actions
 */

(function() {
  'use strict';

  const MESSAGE_RETRY_ATTEMPTS = 4;
  const MESSAGE_RETRY_DELAY_MS = 150;
  const TAB_RELOAD_TIMEOUT_MS = 15000;

  let eventData = null;

  // DOM Elements
  const elements = {
    eventInfo: document.getElementById('event-info'),
    eventTitle: document.getElementById('event-title'),
    eventDate: document.getElementById('event-date'),
    eventVenue: document.getElementById('event-venue'),
    errorMessage: document.getElementById('error-message'),
    actions: document.getElementById('actions'),
    loading: document.getElementById('loading'),
    downloadIcs: document.getElementById('download-ics'),
    addGoogle: document.getElementById('add-google'),
    addApple: document.getElementById('add-apple')
  };

  /**
   * Initialize popup
   */
  async function init() {
    // Check if we're on an RA event page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.match(/ra\.co\/events\/\d+/)) {
      showError('NOT_RA_EVENT_PAGE');
      return;
    }

    // Try to extract event data
    try {
      let response = await requestEventData(tab.id);

      if (!response?.success) {
        response = await reloadTabAndRetry(tab.id);
      }

      if (response && response.success && response.data) {
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
      return await chrome.tabs.sendMessage(tabId, { action: 'extractEvent' });
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
        return await chrome.tabs.sendMessage(tabId, { action: 'extractEvent' });
      } catch (error) {
        if (!isMissingReceiverError(error)) {
          throw error;
        }
      }
    }

    return null;
  }

  function isMissingReceiverError(error) {
    return typeof error?.message === 'string' && (
      error.message.includes('Receiving end does not exist') ||
      error.message.includes('Could not establish connection')
    );
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function reloadTabAndRetry(tabId) {
    console.log('[RA to Calendar] Reloading page for fresh event data...');
    elements.loading.innerHTML = '<div class="spinner"></div><p>Refreshing event page...</p>';

    const loaded = waitForTabComplete(tabId);
    await chrome.tabs.reload(tabId);
    await loaded;

    return requestEventData(tabId);
  }

  function waitForTabComplete(tabId) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Timed out waiting for tab reload'));
      }, TAB_RELOAD_TIMEOUT_MS);

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
          return;
        }

        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /**
   * Show event information
   */
  function showEventInfo() {
    elements.loading.classList.add('hidden');
    elements.eventInfo.classList.remove('hidden');
    elements.actions.classList.remove('hidden');

    elements.eventTitle.textContent = eventData.title || 'Unknown Event';
    elements.eventDate.textContent = formatDateRange(eventData.dateStart, eventData.dateEnd);
    elements.eventVenue.textContent = eventData.venue || 'Unknown Venue';
  }

  /**
   * Show error message
   */
  function showError(errorCode) {
    elements.loading.classList.add('hidden');
    elements.eventInfo.classList.add('hidden');
    elements.actions.classList.add('hidden');
    elements.errorMessage.classList.remove('hidden');

    const message = getErrorMessage(errorCode);
    const errorText = elements.errorMessage.querySelector('[data-role="message"]');
    const hintText = elements.errorMessage.querySelector('[data-role="hint"]');
    errorText.textContent = message.message;
    hintText.textContent = message.hint;
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

  /**
   * Format date range for display
   */
  function formatDateRange(start, end) {
    if (!start) return 'Date TBD';
    
    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) return 'Date TBD';
    
    const options = { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric'
    };
    
    let result = startDate.toLocaleDateString('en-GB', options);
    
    // Add time if available
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    const startTime = startDate.toLocaleTimeString('en-GB', timeOptions);
    
    if (end) {
      const endDate = new Date(end);
      if (!isNaN(endDate.getTime())) {
        const endTime = endDate.toLocaleTimeString('en-GB', timeOptions);
        result += ` · ${startTime} - ${endTime}`;
        return result;
      }
    }
    
    result += ` · ${startTime}`;
    return result;
  }

  /**
   * Generate iCal content
   */
  function generateIcal() {
    if (!eventData) return null;

    const uid = getStableUid();
    const dtstamp = formatIcalDate(new Date());
    const dtstart = eventData.dateStart ? formatIcalDate(new Date(eventData.dateStart)) : '';
    const dtend = eventData.dateEnd ? formatIcalDate(new Date(eventData.dateEnd)) : '';
    
    // If no end time, set it to 6 hours after start
    let endDate = null;
    if (eventData.dateStart && !eventData.dateEnd) {
      endDate = new Date(eventData.dateStart);
      endDate.setHours(endDate.getHours() + 6);
    }
    const dtendFinal = dtend || (endDate ? formatIcalDate(endDate) : '');
    
    // Build description
    let descriptionParts = [];
    if (eventData.lineup && eventData.lineup.length > 0) {
      descriptionParts.push(`Lineup: ${eventData.lineup.join(', ')}`);
    }
    if (eventData.description) {
      descriptionParts.push(eventData.description);
    }
    descriptionParts.push(eventData.url);
    const description = descriptionParts.join('\n');
    
    // Build location
    let location = eventData.venue;
    if (eventData.address) {
      location += `, ${eventData.address}`;
    }

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RA to Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      dtstart ? `DTSTART:${dtstart}` : '',
      dtendFinal ? `DTEND:${dtendFinal}` : '',
      `SUMMARY:${escapeIcalText(eventData.title || 'Event')}`,
      location ? `LOCATION:${escapeIcalText(location)}` : '',
      `DESCRIPTION:${escapeIcalText(description)}`,
      `URL:${eventData.url}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(line => line);

    return lines.map(foldIcalLine).join('\r\n');
  }

  function getStableUid() {
    const source = eventData.eventId || eventData.url || eventData.title || 'event';
    return `${source}@ra-to-calendar`;
  }

  /**
   * Format date for iCal (UTC)
   */
  function formatIcalDate(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hour = String(d.getUTCHours()).padStart(2, '0');
    const minute = String(d.getUTCMinutes()).padStart(2, '0');
    const second = String(d.getUTCSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}T${hour}${minute}${second}Z`;
  }

  /**
   * Escape text for iCal
   */
  function escapeIcalText(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  function foldIcalLine(line) {
    const maxLength = 75;
    if (line.length <= maxLength) {
      return line;
    }

    const chunks = [];
    let remaining = line;

    while (remaining.length > maxLength) {
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }

    if (remaining) {
      chunks.push(remaining);
    }

    return chunks.join('\r\n ');
  }

  /**
   * Download .ics file
   */
  function downloadIcs() {
    const ical = generateIcal();
    if (!ical) return;

    const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const filename = eventData.title
      ? `${eventData.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.ics`
      : 'event.ics';

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /**
   * Add to Google Calendar
   */
  function addToGoogle() {
    if (!eventData) return;

    const baseUrl = 'https://calendar.google.com/calendar/render';
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: eventData.title || 'Event',
      location: [eventData.venue, eventData.address].filter(Boolean).join(', ')
    });

    // Build details
    let details = '';
    if (eventData.lineup && eventData.lineup.length > 0) {
      details += `Lineup: ${eventData.lineup.join(', ')}\n\n`;
    }
    if (eventData.description) {
      details += eventData.description + '\n\n';
    }
    details += eventData.url;
    params.set('details', details);

    if (eventData.dateStart) {
      const start = new Date(eventData.dateStart);
      // If no end time, default to 6 hours after start
      const end = eventData.dateEnd ? new Date(eventData.dateEnd) : new Date(start.getTime() + 6 * 60 * 60 * 1000);
      
      params.set('dates', `${formatGoogleDate(start)}/${formatGoogleDate(end)}`);
    }

    chrome.tabs.create({ url: `${baseUrl}?${params.toString()}` });
  }

  /**
   * Format date for Google Calendar
   */
  function formatGoogleDate(date) {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hour = String(d.getUTCHours()).padStart(2, '0');
    const minute = String(d.getUTCMinutes()).padStart(2, '0');
    const second = String(d.getUTCSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}T${hour}${minute}${second}Z`;
  }

  /**
   * Add to Apple Calendar (download .ics)
   */
  function addToApple() {
    downloadIcs();
  }

  // Event listeners
  elements.downloadIcs.addEventListener('click', downloadIcs);
  elements.addGoogle.addEventListener('click', addToGoogle);
  elements.addApple.addEventListener('click', addToApple);

  // Initialize
  init();
})();
