// Утренняя сводка: в 11:00 по Еревану — погода и курс драма.
// Каждый день или только по будням (пн–пт) — выбирает подписчик.
//
// Как работает расписание:
//  - раз в минуту проверяем: сейчас между 11:00 и 13:00 по Еревану?
//  - если да — отправляем сводку подписчикам, которым сегодня она ещё не ушла;
//  - дату отправки записываем в базу, поэтому после перезапуска бот не пришлёт её второй раз,
//    а если бот был выключен в 11:00 — пришлёт, как только включится (но не позже 13:00).

const { TelegramApiError, isTransientError } = require('node-telegram-bot-api');
const subscriptions = require('../db/subscriptionsRepository');
const weather = require('./weather');
const currency = require('./currency');

const TIME_ZONE = 'Asia/Yerevan';
const SEND_AT = 11 * 60; // 11:00 — в минутах от полуночи
const SEND_UNTIL = 13 * 60; // после 13:00 пропущенную сводку уже не шлём
const CHECK_INTERVAL_MS = 60 * 1000;
const PAUSE_BETWEEN_MESSAGES_MS = 50; // бережём лимиты Telegram (~30 сообщений в секунду)

const SEND_TIME_TEXT = '11:00';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Текущие дата, время и день недели в Ереване:
// { date: '2026-11-12', minutes: 660, weekday: 4 } (0 — воскресенье, 6 — суббота)
function yerevanNow(now = new Date()) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'short',
            hourCycle: 'h23',
        })
            .formatToParts(now)
            .map((p) => [p.type, p.value]),
    );
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
        weekday: WEEKDAYS.indexOf(parts.weekday),
    };
}

const isSendWindow = (minutes) => minutes >= SEND_AT && minutes < SEND_UNTIL;
const isWeekend = (weekday) => weekday === 0 || weekday === 6;

// ---------- Текст сводки ----------

async function buildSummary(now = new Date()) {
    const today = new Intl.DateTimeFormat('ru-RU', {
        timeZone: TIME_ZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(now);

    // Погода и курс независимы: если один сервис недоступен, второй всё равно покажем
    const [weatherPart, ratesPart] = await Promise.allSettled([
        weather.findPlace(weather.DEFAULT_CITY).then((place) => weather.getTodayText(place)),
        currency.amdRatesText(),
    ]);
    if (weatherPart.status === 'rejected' && ratesPart.status === 'rejected') {
        throw new Error(`Сводка недоступна: ${weatherPart.reason?.message}; ${ratesPart.reason?.message}`);
    }

    return [
        `☀️ Доброе утро! Сегодня ${today}.`,
        '',
        weatherPart.status === 'fulfilled' ? weatherPart.value : '🌤 Погоду сейчас узнать не удалось.',
        '',
        ratesPart.status === 'fulfilled' ? ratesPart.value : '💱 Курс сейчас узнать не удалось.',
        '',
        'Отключить сводку: /morning',
    ].join('\n');
}

// ---------- Подписка ----------

function isSubscribed(chatId) {
    return subscriptions.getSubscription(chatId)?.enabled === true;
}

function isWeekdaysOnly(chatId) {
    return subscriptions.getSubscription(chatId)?.weekdays_only === true;
}

// «в понедельник», «во вторник»… — для «Следующая сводка — …»
const ON_WEEKDAY = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];

// Когда придёт следующая сводка: «сегодня», «завтра», «в понедельник»…
function nextDelivery(chatId, now = new Date()) {
    const sub = subscriptions.getSubscription(chatId);
    const { date, minutes, weekday } = yerevanNow(now);
    const allowed = (day) => !(sub?.weekdays_only && isWeekend(day));

    if (allowed(weekday) && minutes < SEND_AT && sub?.last_sent_date !== date) {
        return 'сегодня';
    }
    for (let d = 1; d <= 7; d++) {
        const day = (weekday + d) % 7;
        if (allowed(day)) return d === 1 ? 'завтра' : ON_WEEKDAY[day];
    }
    return 'завтра';
}

// Включает сводку и возвращает, когда придёт первая: «сегодня», «завтра», «в понедельник»…
function subscribe(chatId, now = new Date()) {
    const { date, minutes } = yerevanNow(now);
    // Подписались после 11:00 — сегодняшнюю не шлём, первая придёт в следующий подходящий день
    const alreadyLate = minutes >= SEND_AT;
    subscriptions.setSubscription(chatId, true, alreadyLate ? date : null);
    return nextDelivery(chatId, now);
}

function unsubscribe(chatId) {
    subscriptions.setSubscription(chatId, false);
}

function setWeekdaysOnly(chatId, weekdaysOnly) {
    subscriptions.setWeekdaysOnly(chatId, weekdaysOnly);
}

// ---------- Рассылка ----------

// Пользователь заблокировал бота, удалил чат или выгнал бота из группы — писать туда больше нельзя
function isChatGone(error) {
    return (
        error instanceof TelegramApiError &&
        (error.errorCode === 403 || (error.errorCode === 400 && /chat not found/i.test(error.description)))
    );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Одна проверка расписания. Параметры подменяются в тестах.
async function runMorningTick({
    api,
    now = new Date(),
    build = buildSummary,
    pauseMs = PAUSE_BETWEEN_MESSAGES_MS,
} = {}) {
    const result = { sent: 0, disabled: 0, failed: 0, retryLater: 0 };
    const { date, minutes, weekday } = yerevanNow(now);
    if (!isSendWindow(minutes)) return result;

    const due = subscriptions.listDue(date, isWeekend(weekday));
    if (due.length === 0) return result;

    // Текст один на всех — собираем один раз. Если не вышло — повторим через минуту.
    const text = await build(now);

    for (const chatId of due) {
        try {
            await api.sendMessage({ chat_id: chatId, text });
            result.sent++;
        } catch (error) {
            if (isChatGone(error)) {
                unsubscribe(chatId);
                result.disabled++;
            } else if (isTransientError(error)) {
                // Сбой сети или Telegram — не отмечаем, попробуем на следующей минуте
                result.retryLater++;
                continue;
            } else {
                console.error(`Morning summary: failed to send to ${chatId}:`, error.message);
                result.failed++;
            }
        }
        subscriptions.markSent(chatId, date);
        if (pauseMs) await sleep(pauseMs);
    }

    if (result.sent || result.disabled || result.failed || result.retryLater) {
        console.log(`Morning summary ${date}:`, result);
    }
    return result;
}

// Запускает проверку раз в минуту. Возвращает функцию остановки.
function startMorningScheduler(api) {
    let running = false;
    const tick = async () => {
        if (running) return; // прошлая рассылка ещё идёт
        running = true;
        try {
            await runMorningTick({ api });
        } catch (error) {
            console.error('Morning summary error:', error);
        } finally {
            running = false;
        }
    };
    const timer = setInterval(tick, CHECK_INTERVAL_MS);
    tick();
    return () => clearInterval(timer);
}

module.exports = {
    SEND_TIME_TEXT,
    yerevanNow,
    buildSummary,
    isSubscribed,
    isWeekdaysOnly,
    nextDelivery,
    subscribe,
    unsubscribe,
    setWeekdaysOnly,
    runMorningTick,
    startMorningScheduler,
};
