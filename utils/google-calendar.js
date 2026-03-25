import { google } from "googleapis";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from "../config.js";
import { getTenantDb } from "../database/tenant_factory.js";

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
  const db = getTenantDb(tenantId);
  db.prepare(
    "INSERT OR REPLACE INTO google_auth (key, access_token, refresh_token, expiry_date) VALUES ('default', ?, ?, ?)"
  ).run(tokens.access_token, tokens.refresh_token, tokens.expiry_date);
}

async function getAuthenticatedClient(tenantId) {
  const db = getTenantDb(tenantId);
  const auth = db.prepare("SELECT * FROM google_auth WHERE key = 'default'").get();
  if (!auth) return null;

  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  client.setCredentials({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    expiry_date: auth.expiry_date,
  });

  client.on("tokens", (tokens) => {
    const update = db.prepare("UPDATE google_auth SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expiry_date = ? WHERE key = 'default'");
    update.run(tokens.access_token, tokens.refresh_token, tokens.expiry_date);
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

  const db = getTenantDb(tenantId);
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
