// Функция для форматирования даты строго по времени Варшавы
function formatWarsawDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Функция для форматирования времени строго по времени Варшавы
function formatWarsawTime(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export { formatWarsawDate, formatWarsawTime };
