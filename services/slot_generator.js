import { DateTime } from "luxon";

/**
 * Generates available time slots for a tenant based on their configuration.
 * @param {Object} config - Tenant configuration (start_time, end_time, step_min, work_days, timezone)
 * @returns {Array} List of slots for the next 30 days [{date, time}]
 */
export function generateSlots(config) {
  const { start_time, end_time, step_min, work_days, timezone } = config;
  const slots = [];
  const now = DateTime.now().setZone(timezone);

  for (let i = 0; i < 30; i++) {
    const currentDay = now.plus({ days: i }).startOf("day");

    // work_days is [1..7] where 1 is Mon, 7 is Sun
    if (!work_days.includes(currentDay.weekday)) continue;

    const dateStr = currentDay.toISODate();
    let [startH, startM] = start_time.split(":").map(Number);
    let [endH, endM] = end_time.split(":").map(Number);

    let currentSlot = currentDay.set({ hour: startH, minute: startM });
    const endLimit = currentDay.set({ hour: endH, minute: endM });

    while (currentSlot < endLimit) {
      // Don't generate slots in the past
      if (currentSlot > now) {
        slots.push({
          date: dateStr,
          time: currentSlot.toFormat("HH:mm")
        });
      }
      currentSlot = currentSlot.plus({ minutes: step_min });
    }
  }

  return slots;
}
