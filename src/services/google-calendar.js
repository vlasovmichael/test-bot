/**
 * Google Calendar Integration Service
 * Each tenant can optionally provide their own credentials.json.
 */

export async function syncToCalendar(tenantId, credentials, appointment) {
  // Integration logic here
  console.log(`Syncing appointment ${appointment.id} to Google Calendar for tenant ${tenantId}`);
}

export function getTenantCredentialsPath(tenantId) {
  return `data/credentials_${tenantId}.json`;
}
