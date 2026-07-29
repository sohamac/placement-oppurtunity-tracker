import { google } from 'googleapis';

export async function addEventToGoogleCalendar(
  accessToken: string,
  eventDetails: {
    title: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM (24-hour)
    description: string;
    timeZone?: string; // e.g. "Asia/Kolkata"
  }
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth });

  console.log("Scheduling event on Google Calendar...", eventDetails);
  
  // Parse date and time
  const startDateTime = new Date(`${eventDetails.date}T${eventDetails.time}:00`);
  // Assume a 1 hour default duration for interviews
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
  
  const tz = eventDetails.timeZone || 'UTC';

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: eventDetails.title,
        description: eventDetails.description,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: tz,
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: tz,
        },
      },
    });

    return { success: true, eventLink: response.data.htmlLink };
  } catch (error) {
    console.error("Error adding event to Google Calendar:", error);
    throw new Error("Failed to add to calendar");
  }
}
