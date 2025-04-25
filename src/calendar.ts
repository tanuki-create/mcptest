import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

/**
 * Creates a new event on the user's primary Google Calendar.
 *
 * @param summary The title of the event (e.g., subtask description).
 * @param startTimeIso The start date/time in ISO 8601 format.
 * @param endTimeIso The end date/time in ISO 8601 format.
 * @param authClient An authorized OAuth2 client.
 * @returns The URL of the created Google Calendar event.
 */
export async function createCalendarEvent(
  summary: string,
  startTimeIso: string,
  endTimeIso: string,
  authClient: OAuth2Client
): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  try {
    console.log(`Creating calendar event: ${summary} from ${startTimeIso} to ${endTimeIso}`);
    const event: calendar_v3.Schema$Event = {
      summary,
      start: {
        dateTime: startTimeIso,
        // timeZone: 'Your/Timezone' // Optional: Specify timezone if needed
      },
      end: {
        dateTime: endTimeIso,
        // timeZone: 'Your/Timezone'
      },
      // Optional: Add description, attendees, etc.
      // description: 'Created by MCP Scheduler',
    };

    const response = await calendar.events.insert({
      calendarId: 'primary', // Use the user's primary calendar
      requestBody: event,
    });

    const eventUrl = response.data.htmlLink;
    if (!eventUrl) {
      throw new Error('Failed to create calendar event: No event URL returned.');
    }

    console.log(`Event created: ${eventUrl}`);
    return eventUrl;

  } catch (error: unknown) {
    console.error('Error interacting with Google Calendar API:', error);
    let detail = '';
    if (typeof error === 'object' && error !== null && 'errors' in error) {
      detail = JSON.stringify((error as any).errors);
    }
    throw new Error(`Failed to create calendar event: ${error instanceof Error ? error.message : String(error)} ${detail}`);
  }
}

/**
 * Queries Google Calendar for free/busy information within a given time range.
 *
 * @param startTimeIso Start of the time range (ISO 8601).
 * @param endTimeIso End of the time range (ISO 8601).
 * @param authClient An authorized OAuth2 client.
 * @param timeZone The IANA timezone identifier (e.g., 'America/Los_Angeles'). Defaults to system timezone if possible.
 * @returns A promise resolving to the free/busy query response.
 */
export async function getFreeBusy(
  startTimeIso: string,
  endTimeIso: string,
  authClient: OAuth2Client,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone // Attempt to get system timezone
): Promise<calendar_v3.Schema$FreeBusyResponse> {
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  try {
    console.log(`Querying free/busy from ${startTimeIso} to ${endTimeIso} in ${timeZone}`);
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTimeIso,
        timeMax: endTimeIso,
        timeZone: timeZone,
        items: [{ id: 'primary' }], // Check primary calendar
      },
    });
    console.log('Free/busy query successful.');
    return response.data;
  } catch (error: unknown) {
    console.error('Error querying free/busy information:', error);
        let detail = '';
    if (typeof error === 'object' && error !== null && 'errors' in error) {
      detail = JSON.stringify((error as any).errors);
    }
    throw new Error(`Failed to query free/busy: ${error instanceof Error ? error.message : String(error)} ${detail}`);
  }
} 