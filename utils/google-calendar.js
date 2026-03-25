import { google } from "googleapis";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from "../config.js";
import { db } from "../database/db.js";

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

export function getAuthUrl(tenantId) {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
    state: tenantId,
  });
}

export async function saveTokens(tenantId, code) {
  const { tokens } = await oauth2Client.getToken(code);
  db.prepare(
    "INSERT OR REPLACE INTO google_auth (tenant_id, access_token, refresh_token, expiry_date) VALUES (?, ?, ?, ?)"
  ).run(tenantId, tokens.access_token, tokens.refresh_token, tokens.expiry_date);
}

async function getAuthenticatedClient(tenantId) {
  const auth = db.prepare("SELECT * FROM google_auth WHERE tenant_id = ?").get(tenantId);
  if (!auth) return null;

  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  client.setCredentials({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    expiry_date: auth.expiry_date,
  });

  client.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      db.prepare("UPDATE google_auth SET access_token = ?, refresh_token = ?, expiry_date = ? WHERE tenant_id = ?").run(
        tokens.access_token,
        tokens.refresh_token,
        tokens.expiry_date,
        tenantId
      );
    } else {
      db.prepare("UPDATE google_auth SET access_token = ?, expiry_date = ? WHERE tenant_id = ?").run(
        tokens.access_token,
        tokens.expiry_date,
        tenantId
      );
    }
  });

  return client;
}

export async function createCalendarEvent(tenantId, booking, service) {
  const authClient = await getAuthenticatedClient(tenantId);
  if (!authClient) return null;

  const calendar = google.calendar({ version: "v3", auth: authClient });
  const start = new Date(booking.appointment_at);
  const end = new Date(start.getTime() + (service?.duration_min || 60) * 60000);

  const event = {
    summary: `Booking: ${booking.name}`,
    description: `Service: ${service?.name || "N/A"}\nPhone: ${booking.phone}`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };

  const res = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
  });

  db.prepare("UPDATE bookings SET google_event_id = ? WHERE id = ?").run(res.data.id, booking.id);
  return res.data.id;
}

export async function deleteCalendarEvent(tenantId, googleEventId) {
  const authClient = await getAuthenticatedClient(tenantId);
  if (!authClient || !googleEventId) return;

  const calendar = google.calendar({ version: "v3", auth: authClient });
  await calendar.events.delete({
    calendarId: "primary",
    eventId: googleEventId,
  });
}
