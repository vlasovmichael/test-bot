// Админ-панель: управление днями/слотами, просмотр расписания, отмена записей

import {
  addSlot,
  getSlotsForDate,
  closeDay,
  openDay,
  isDayClosed,
  getBookingsForDate,
  cancelBooking,
  getSetting,
  getAdminStats,
} from "../database/db.js";
import { monthsNominative } from "./months.js";
import { t } from "../i18n.js";

function toDateString(date) {
  // Используем шведскую локаль 'sv-SE', так как она единственная
  // возвращает формат YYYY-MM-DD по умолчанию. Это хак, но очень надежный.
  return date.toLocaleDateString("sv-SE");
}

function buildAdminMainKeyboard(lang) {
  return {
    inline_keyboard: [
      [
        {
          text: `⚙️ ${t(lang, "admin_btn_settings")}`,
          callback_data: "admin:settings",
        },
      ], // Новая кнопка
      [
        {
          text: t(lang, "admin_btn_manage_days"),
          callback_data: "admin:manage_days",
        },
      ],
      [
        {
          text: t(lang, "admin_btn_view_schedule"),
          callback_data: "admin:view_schedule",
        },
      ],
      [
        {
          text: t(lang, "admin_btn_cancel_booking"),
          callback_data: "admin:cancel_booking",
        },
      ],
      [
        {
          text: "📢 Оповестить об окне",
          callback_data: "admin:broadcast_slot",
        },
      ],
      [{ text: "📊 Статистика", callback_data: "admin:stats" }],
      [{ text: `🏠 ${t(lang, "btn_back_main")}`, callback_data: "menu:back" }],
    ],
  };
}

// Главное меню настроек
async function showAdminSettings(ctx, lang) {
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `📅 ${t(lang, "set_work_days")}`,
          callback_data: "admin:conf_days",
        },
      ],
      [
        {
          text: `⏳ ${t(lang, "set_interval")}`,
          callback_data: "admin:conf_step",
        },
        {
          text: `🕒 ${t(lang, "set_hours")}`,
          callback_data: "admin:conf_hours",
        },
      ],
      [{ text: "📝 Редактировать цены", callback_data: "admin:edit_prices" }],
      [
        {
          text: "🔗 Редактировать портфолио",
          callback_data: "admin:edit_portfolio",
        },
      ],
      [
        {
          text: `⬅️ ${t(lang, "admin_btn_back")}`,
          callback_data: "admin:main",
        },
      ],
    ],
  };

  await ctx.editMessageText(t(lang, "admin_settings_title"), {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// Выбор шага (интервала)
async function showStepSettings(ctx, lang) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: "30 мин", callback_data: "admin:save_step:30" },
        { text: "1 час", callback_data: "admin:save_step:60" },
      ],
      [
        { text: "1.5 ч", callback_data: "admin:save_step:90" },
        { text: "2 часа", callback_data: "admin:save_step:120" },
      ],
      [
        {
          text: `⬅️ ${t(lang, "admin_btn_back")}`,
          callback_data: "admin:settings",
        },
      ],
    ],
  };
  await ctx.editMessageText(t(lang, "admin_select_interval"), {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// Выбор рабочих дней (✅/❌)
async function showWorkDaysSettings(ctx, lang) {
  // Важно: используем getSetting для отображения текущих галочек
  const currentDays = getSetting("work_days", [1, 2, 3, 4, 5]);
  const weekDaysShort = t(lang, "week_days") || [
    "Пн",
    "Вт",
    "Ср",
    "Чт",
    "Пт",
    "Сб",
    "Вс",
  ];

  const buttons = weekDaysShort.map((name, index) => {
    // В JS Date.getDay(): 0 - Вс, 1 - Пн ... 6 - Сб
    // Твой массив weekDaysShort начинается с Пн, поэтому делаем сдвиг:
    const dayNum = index === 6 ? 0 : index + 1;
    const isWorking = currentDays.includes(dayNum);

    return {
      text: `${isWorking ? "✅" : "❌"} ${name}`,
      callback_data: `admin:toggle_workday:${dayNum}`, // Формат совпадает с index.js
    };
  });

  const keyboard = [];
  while (buttons.length) keyboard.push(buttons.splice(0, 4));

  keyboard.push([
    {
      text: `⬅️ ${t(lang, "admin_btn_back")}`,
      callback_data: "admin:settings",
    },
  ]);

  await ctx.editMessageText(t(lang, "admin_select_workdays"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });
}

function buildAdminDatesKeyboard(lang, actionPrefix, monthOffset = 0) {
  const now = new Date();
  // Вычисляем дату просмотра с учетом смещения
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekDays = t(lang, "week_days");

  const monthList = monthsNominative[lang] || monthsNominative["en"];
  const headerText = `── ${monthList[currentMonth]} ${currentYear} ──`;

  const keyboard = [
    [{ text: headerText, callback_data: "none" }], // Заголовок месяца
    weekDays.map((day) => ({ text: ` ${day} `, callback_data: "none" })),
  ];

  let startDay = viewDate.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;

  let row = [];
  for (let i = 0; i < startDay; i++) {
    row.push({ text: " ", callback_data: "none" });
  }

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(currentYear, currentMonth, day);
    const iso = toDateString(d);
    const checkDate = new Date(d).setHours(0, 0, 0, 0);
    const isPast = checkDate < today.getTime();

    let text = day < 10 ? `  ${day}  ` : ` ${day} `;
    if (isPast) text = `·${day}·`;

    row.push({ text, callback_data: `${actionPrefix}:${iso}` });

    if (row.length === 7) {
      keyboard.push(row);
      row = [];
    }
  }

  if (row.length > 0) {
    while (row.length < 7) row.push({ text: " ", callback_data: "none" });
    keyboard.push(row);
  }

  // --- НАВИГАЦИЯ ДЛЯ АДМИНА ---
  // Тут нет ограничений: админ может листать в прошлое и в будущее бесконечно
  keyboard.push([
    {
      text: "⬅️",
      callback_data: `admin_cal_offset:${actionPrefix}:${monthOffset - 1}`,
    },
    {
      text: "➡️",
      callback_data: `admin_cal_offset:${actionPrefix}:${monthOffset + 1}`,
    },
  ]);

  keyboard.push([
    { text: `⬅️ ${t(lang, "admin_btn_back")}`, callback_data: "admin:main" },
  ]);

  return { inline_keyboard: keyboard };
}

async function showAdminPanel(ctx, lang) {
  await ctx.reply(t(lang, "admin_panel_title"), {
    parse_mode: "HTML",
    reply_markup: buildAdminMainKeyboard(lang),
  });
}

// Управление днями и слотами
async function handleManageDays(ctx, lang) {
  const title = `📅 ${t(lang, "admin_pick_date")}\n` + "—".repeat(26);

  await ctx.editMessageText(title, {
    parse_mode: "HTML",
    reply_markup: buildAdminDatesKeyboard(lang, "admin_day"),
  });
}

async function handleAdminDayOverview(ctx, lang, date) {
  const closed = isDayClosed(date);
  const slots = getSlotsForDate(date);

  // Разбиваем строку YYYY-MM-DD корректно
  const [y, m, d] = date.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  const displayDate = dateObj.toLocaleDateString(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });

  // Текущее время для сравнения
  const now = new Date();

  let text =
    t(lang, "admin_day_overview", {
      date: displayDate,
      closed: closed ? t(lang, "admin_closed_yes") : t(lang, "admin_closed_no"),
    }) + "\n";

  if (!slots.length) {
    text += `\n${t(lang, "admin_no_slots")}`;
  } else {
    for (const s of slots) {
      // Проверяем, не прошло ли уже время этого слота
      const slotTime = new Date(`${date}T${s.time}:00`);
      const isPast = slotTime < now;

      const status = s.is_booked ? ` (${t(lang, "admin_slot_booked")})` : "";
      const pastMarker = isPast ? " ✨" : " •"; // Или любой другой символ для прошедших

      text += `\n${pastMarker} ${s.time}${status}`;
    }
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t(lang, "admin_btn_add_time"),
            callback_data: `admin_add_time:${date}`,
          },
        ],
        [
          {
            text: t(lang, "admin_btn_toggle_close_day"),
            callback_data: `admin_toggle_day:${date}`,
          },
        ],
        // ИСПРАВЛЕНО: Кнопка возврата именно в админ-меню
        [{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }],
      ],
    },
  });
}

async function toggleDayClosed(ctx, lang, date) {
  const closed = isDayClosed(date);

  if (closed) {
    openDay(date);
    // Берем текст из перевода и удаляем из него все HTML теги для alert
    const message = t(lang, "admin_day_opened", { date }).replace(
      /<\/?[^>]+(>|$)/g,
      "",
    );

    await ctx.answerCallbackQuery({
      text: message,
      show_alert: true,
    });
  } else {
    closeDay(date);
    // Аналогично очищаем текст для закрытия дня
    const message = t(lang, "admin_day_closed", { date }).replace(
      /<\/?[^>]+(>|$)/g,
      "",
    );

    await ctx.answerCallbackQuery({
      text: message,
      show_alert: true,
    });
  }

  // Обновляем меню дня (здесь HTML по-прежнему будет работать корректно)
  await handleAdminDayOverview(ctx, lang, date);
}

// Админ: добавление времени — через текстовое сообщение
async function askAdminForTime(ctx, lang, date) {
  ctx.session.admin = {
    ...(ctx.session.admin || {}),
    step: "enter_time",
    date,
  };
  await ctx.editMessageText(t(lang, "admin_send_time"), {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, "btn_back_main"), callback_data: "admin:main" }],
      ],
    },
  });
}

// Валидация HH:MM
function isValidTime(str) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
}

async function handleAdminTimeInput(ctx, lang) {
  const adminSession = ctx.session.admin || {};
  if (adminSession.step !== "enter_time" || !adminSession.date) return;

  const timeStr = ctx.message.text.trim();
  if (!isValidTime(timeStr)) {
    await ctx.reply(t(lang, "admin_time_invalid"), { parse_mode: "HTML" });
    return;
  }

  addSlot(adminSession.date, timeStr);
  await ctx.reply(
    t(lang, "admin_time_added", {
      date: new Date(adminSession.date).toLocaleDateString("pl-PL"),
      time: timeStr,
    }),
    { parse_mode: "HTML" },
  );

  ctx.session.admin = null;
}

// Просмотр расписания
async function handleAdminViewSchedule(ctx, lang) {
  const title = `📅 ${t(lang, "admin_pick_date")}\n` + "—".repeat(26);

  await ctx.editMessageText(title, {
    parse_mode: "HTML",
    reply_markup: buildAdminDatesKeyboard(lang, "admin_view"),
  });
}

async function showScheduleForDate(ctx, lang, date) {
  const list = getBookingsForDate(date);
  if (!list.length) {
    await ctx.editMessageText(
      t(lang, "admin_schedule_for_date", {
        date: new Date(date).toLocaleDateString("pl-PL"),
      }) +
        "\n\n" +
        t(lang, "admin_schedule_empty"),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, "btn_back_main"), callback_data: "admin:main" }],
          ],
        },
      },
    );
    return;
  }

  let text = t(lang, "admin_schedule_for_date", {
    date: new Date(date).toLocaleDateString("pl-PL"),
  });
  for (const b of list) {
    const name = b.name || b.user_name_db || "-";
    const phone = b.phone || b.user_phone_db || "-";
    text += `\n\n• <b>${b.time}</b> — ${name}, ${phone}, id=${b.user_telegram_id}, status=${b.status}`;
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, "btn_back_main"), callback_data: "admin:main" }],
      ],
    },
  });
}

// Отмена записей
async function handleAdminCancelBooking(ctx, lang) {
  const title = `📅 ${t(lang, "admin_pick_date")}\n` + "—".repeat(26);

  await ctx.editMessageText(title, {
    parse_mode: "HTML",
    reply_markup: buildAdminDatesKeyboard(lang, "admin_cancel_date"),
  });
}

async function pickBookingToCancel(ctx, lang, date) {
  const list = getBookingsForDate(date).filter((b) => b.status === "active");
  if (!list.length) {
    await ctx.editMessageText(
      t(lang, "admin_cancel_no_bookings", {
        date: new Date(date).toLocaleDateString("pl-PL"),
      }),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, "btn_back_main"), callback_data: "admin:main" }],
          ],
        },
      },
    );
    return;
  }

  let text = t(lang, "admin_cancel_pick_booking", {
    date: new Date(date).toLocaleDateString("pl-PL"),
  });

  const kb = [];
  for (const b of list) {
    const name = b.name || b.user_name_db || "-";
    text += `\n\n• ${b.time} — ${name}`;
    kb.push([
      {
        text: `${b.time} — ${name}`,
        callback_data: `admin_cancel_id:${b.id}`,
      },
    ]);
  }
  kb.push([{ text: t(lang, "btn_back_main"), callback_data: "admin:main" }]);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: kb },
  });
}

async function cancelBookingById(ctx, lang, bookingId) {
  // 1. Пытаемся отменить запись и получить её данные
  const booking = cancelBooking(bookingId);

  if (!booking) {
    await ctx.answerCallbackQuery({
      text: t(lang, "error_generic"),
      show_alert: true,
    });
    return;
  }

  // 2. РАБОТАЕМ С ДАТОЙ ПРАВИЛЬНО
  // Создаем объект даты из ISO-строки (база выдает UTC)
  const dateObj = new Date(booking.appointment_at);

  // Форматируем дату и время согласно польскому часовому поясу
  // Это автоматически прибавит нужный час (+1 или +2 в зависимости от сезона)
  const displayDate = dateObj.toLocaleDateString("pl-PL");
  const displayTime = dateObj.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 3. Отвечаем на callback (убираем "часики" на кнопке)
  await ctx.answerCallbackQuery({
    text: t(lang, "admin_booking_canceled"),
    show_alert: false,
  });

  // 4. Генерируем текст сообщения
  const successText = t(lang, "admin_cancel_success_custom", {
    name: booking.name,
    date: displayDate,
    time: displayTime,
  });

  // 5. Редактируем сообщение, выводя результат
  await ctx.editMessageText(successText, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t(lang, "admin_btn_back"),
            callback_data: "admin:main",
          },
        ],
      ],
    },
  });
}

// Запрос времени работы у админа
async function askAdminForHours(ctx, lang) {
  ctx.session.admin = {
    ...(ctx.session.admin || {}),
    step: "enter_hours",
  };

  const currentStart = getSetting("start_time", "10:00");
  const currentEnd = getSetting("end_time", "18:00");

  const text = `🕒 Сейчас: <b>${currentStart} — ${currentEnd}</b>\n\nПришлите новое время работы в формате <code>ЧЧ:ММ-ЧЧ:ММ</code>\n\nПример: <code>09:00-20:00</code>`;

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `⬅️ ${t(lang, "admin_btn_back")}`,
            callback_data: "admin:settings",
          },
        ],
      ],
    },
  });
}

async function askAdminForPrices(ctx, lang) {
  ctx.session.admin = { ...ctx.session.admin, step: "enter_prices" };
  const currentText = getSetting(
    "custom_prices",
    "Стандартный текст не изменен",
  );

  await ctx.editMessageText(
    `📝 <b>Редактирование цен</b>\n\nСейчас установлено:\n<code>${currentText}</code>\n\nПришлите новым сообщением текст прайс-листа (можно использовать смайлики и перенос строк).`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `⬅️ ${t(lang, "admin_btn_back")}`,
              callback_data: "admin:settings",
            },
          ],
        ],
      },
    },
  );
}

async function askAdminForPortfolio(ctx, lang) {
  ctx.session.admin = { ...ctx.session.admin, step: "enter_portfolio" };

  await ctx.editMessageText(
    `🔗 <b>Редактирование портфолио</b>\n\nПришлите список ссылок в формате:\n<code>Название - Ссылка</code>\n(каждая ссылка с новой строки)\n\n<b>Пример:</b>\nInstagram - https://instagram.com/myacc\nTikTok - https://tiktok.com/@myacc`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `⬅️ ${t(lang, "admin_btn_back")}`,
              callback_data: "admin:settings",
            },
          ],
        ],
      },
    },
  );
}

async function askAdminForBroadcast(ctx, lang) {
  ctx.session.admin = { ...ctx.session.admin, step: "enter_broadcast" };
  await ctx.editMessageText(
    "📢 <b>Рассылка об окошках</b>\n\nПришлите текст сообщения. Например:\n<i>«Девочки, освободилось окошко на сегодня на 15:00! Кому красоту?»</i>\n\nСообщение будет отправлено ВСЕМ пользователям бота.",
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Отмена", callback_data: "admin:main" }]],
      },
    },
  );
}

async function showStats(ctx, lang) {
  const stats = getAdminStats();

  const text = `
📊 <b>Статистика бота</b>

👥 Всего пользователей в базе: <b>${stats.totalUsers}</b>
👤 Реальных клиентов (с записями): <b>${stats.activeClients}</b>

📅 Предстоящих записей: <b>${stats.upcomingBookings}</b>
Всего записей за всё время: <b>${stats.totalBookings}</b>

<i>Примечание: Пользователи — это все, кто когда-либо нажал /start.</i>
  `;

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `⬅️ ${t(lang, "admin_btn_back")}`,
            callback_data: "admin:main",
          },
        ],
      ],
    },
  });
}

export {
  showAdminPanel,
  handleManageDays,
  handleAdminDayOverview,
  toggleDayClosed,
  askAdminForTime,
  handleAdminTimeInput,
  handleAdminViewSchedule,
  showScheduleForDate,
  handleAdminCancelBooking,
  pickBookingToCancel,
  cancelBookingById,
  buildAdminMainKeyboard,
  buildAdminDatesKeyboard,
  showAdminSettings,
  showStepSettings,
  showWorkDaysSettings,
  askAdminForHours,
  askAdminForPrices,
  askAdminForPortfolio,
  askAdminForBroadcast,
  showStats,
};
