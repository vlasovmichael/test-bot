// Простая система i18n на базе JSON-файлов
// Все сообщения берём из locales/*.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Определяем __dirname для этого конкретного файла
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Теперь ошибка исчезнет
const localesDir = path.join(__dirname, "locales");

// Загружаем все языки один раз
const ru = JSON.parse(
  fs.readFileSync(path.join(localesDir, "ru.json"), "utf-8"),
);
const ua = JSON.parse(
  fs.readFileSync(path.join(localesDir, "ua.json"), "utf-8"),
);
const pl = JSON.parse(
  fs.readFileSync(path.join(localesDir, "pl.json"), "utf-8"),
);
const en = JSON.parse(
  fs.readFileSync(path.join(localesDir, "en.json"), "utf-8"),
);

const MAP = { ru, ua, pl, en };
const DEFAULT_LANG = "en";

// Простейший плейсхолдер {name} -> vars.name
function format(str, vars) {
  if (!vars) return str;
  return Object.keys(vars).reduce((acc, key) => {
    // Это регулярное выражение найдет и {date}, и {{date}}
    const re = new RegExp("\\{\\{?" + key + "\\}?\\}", "g");
    return acc.replace(re, String(vars[key]));
  }, str);
}

function t(lang, key, vars) {
  const l = MAP[lang] ? lang : DEFAULT_LANG;
  const dict = MAP[l];
  const value = dict[key] ?? MAP[DEFAULT_LANG][key] ?? key;
  return format(value, vars);
}

function getLanguageButtons() {
  // Каждый язык в отдельном массиве [] — это создаст новую строку
  return [
    [{ text: "   Русский", callback_data: "lang:ru" }],
    [{ text: "🇺🇦 Українська", callback_data: "lang:ua" }],
    [{ text: "🇵🇱 Polski", callback_data: "lang:pl" }],
    [{ text: "🇬🇧 English", callback_data: "lang:en" }],
  ];
}

export { t, getLanguageButtons };
