// Тесты утренней сводки. Запуск: npm test
// Время подставляется вручную, сообщения не уходят в Telegram, погода и курс подменены.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { TelegramApiError } = require('node-telegram-bot-api');

const { openDatabase, closeDatabase, getDb } = require('../src/db/database');
const morning = require('../src/services/morning');
const weather = require('../src/services/weather');
const currency = require('../src/services/currency');
const { commands } = require('../src/commands');

// Ереван — UTC+4 круглый год: 11:00 в Ереване = 07:00 UTC
const at = (date, time) => new Date(`${date}T${time}:00+04:00`);
const DAY1 = '2026-11-12';
const DAY2 = '2026-11-13';

const ALICE = 111;
const BOB = 222;

// Подменённый Telegram: запоминает, кому что отправили
function fakeApi(failFor = {}) {
    const sent = [];
    return {
        sent,
        sendMessage: async ({ chat_id, text }) => {
            if (failFor[chat_id]) throw failFor[chat_id];
            sent.push({ chat_id, text });
            return { message_id: 1 };
        },
    };
}

const build = async () => 'СВОДКА';
const tick = (api, now) => morning.runMorningTick({ api, now, build, pauseMs: 0 });

before(() => openDatabase(':memory:'));
after(() => closeDatabase());
beforeEach(() => getDb().exec('DELETE FROM morning_subscriptions'));

test('время по Еревану', () => {
    assert.deepEqual(morning.yerevanNow(new Date('2026-11-12T07:00:00Z')), { date: DAY1, minutes: 11 * 60, weekday: 4 }); // четверг
    // 20:30 UTC — в Ереване уже следующий день, 00:30
    assert.deepEqual(morning.yerevanNow(new Date('2026-11-12T20:30:00Z')), { date: DAY2, minutes: 30, weekday: 5 });
});

test('подписка до 11:00 — сводка сегодня, после — завтра', () => {
    assert.equal(morning.subscribe(ALICE, at(DAY1, '09:00')), 'сегодня');
    assert.equal(morning.subscribe(BOB, at(DAY1, '11:30')), 'завтра');
    assert.ok(morning.isSubscribed(ALICE));
    morning.unsubscribe(ALICE);
    assert.ok(!morning.isSubscribed(ALICE));
});

test('расписание: ровно один раз в день в 11:00, только подписчикам', async () => {
    morning.subscribe(ALICE, at(DAY1, '08:00'));
    morning.subscribe(BOB, at(DAY1, '08:00'));
    morning.unsubscribe(BOB);
    const api = fakeApi();

    await tick(api, at(DAY1, '10:59'));
    assert.equal(api.sent.length, 0, 'до 11:00 ничего');

    await tick(api, at(DAY1, '11:00'));
    assert.deepEqual(api.sent, [{ chat_id: ALICE, text: 'СВОДКА' }], 'только подписчику');

    await tick(api, at(DAY1, '11:01'));
    await tick(api, at(DAY1, '12:59'));
    assert.equal(api.sent.length, 1, 'второй раз за день — нет');

    await tick(api, at(DAY2, '10:00'));
    assert.equal(api.sent.length, 1);
    await tick(api, at(DAY2, '11:00'));
    assert.equal(api.sent.length, 2, 'на следующий день — снова');
});

test('расписание: бот был выключен в 11:00 — догоняет до 13:00, позже не шлёт', async () => {
    morning.subscribe(ALICE, at(DAY1, '08:00'));
    const api = fakeApi();
    await tick(api, at(DAY1, '12:30')); // бот включили в 12:30
    assert.equal(api.sent.length, 1);

    const api2 = fakeApi();
    await tick(api2, at(DAY2, '13:00')); // на следующий день включили только в 13:00
    await tick(api2, at(DAY2, '18:00'));
    assert.equal(api2.sent.length, 0, 'вечером «утреннюю» сводку не шлём');
});

test('расписание: подписка после 11:00 не присылает сводку в тот же день', async () => {
    morning.subscribe(ALICE, at(DAY1, '11:30'));
    const api = fakeApi();
    await tick(api, at(DAY1, '11:31'));
    assert.equal(api.sent.length, 0);
    await tick(api, at(DAY2, '11:00'));
    assert.equal(api.sent.length, 1);
});

test('расписание: повторное включение не присылает сводку второй раз', async () => {
    morning.subscribe(ALICE, at(DAY1, '08:00'));
    const api = fakeApi();
    await tick(api, at(DAY1, '11:00'));
    morning.unsubscribe(ALICE);
    morning.subscribe(ALICE, at(DAY1, '11:10')); // выключил и сразу включил
    await tick(api, at(DAY1, '11:11'));
    assert.equal(api.sent.length, 1);
});

test('ошибки отправки: заблокировал бота — отписываем; сбой сети — повторяем', async () => {
    morning.subscribe(ALICE, at(DAY1, '08:00'));
    morning.subscribe(BOB, at(DAY1, '08:00'));
    const blocked = new TelegramApiError(403, 'Forbidden: bot was blocked by the user');
    const tooMany = new TelegramApiError(429, 'Too Many Requests: retry after 5');

    const r1 = await tick(fakeApi({ [ALICE]: blocked, [BOB]: tooMany }), at(DAY1, '11:00'));
    assert.equal(r1.disabled, 1);
    assert.equal(r1.retryLater, 1);
    assert.ok(!morning.isSubscribed(ALICE), 'заблокировавший бота отписан');

    const api = fakeApi();
    await tick(api, at(DAY1, '11:01')); // через минуту Telegram снова в порядке
    assert.deepEqual(api.sent.map((m) => m.chat_id), [BOB], 'Бобу дослали, Алисе — нет');
});

test('ошибки отправки: постоянная ошибка не повторяется каждую минуту', async () => {
    morning.subscribe(ALICE, at(DAY1, '08:00'));
    const realError = console.error;
    console.error = () => {};
    try {
        const r = await tick(fakeApi({ [ALICE]: new TelegramApiError(400, 'Bad Request: something') }), at(DAY1, '11:00'));
        assert.equal(r.failed, 1);
        const api = fakeApi();
        await tick(api, at(DAY1, '11:01'));
        assert.equal(api.sent.length, 0);
        assert.ok(morning.isSubscribed(ALICE), 'подписка осталась — завтра попробуем снова');
    } finally {
        console.error = realError;
    }
});

test('не удалось собрать сводку — никому не отмечаем, повторяем через минуту', async () => {
    morning.subscribe(ALICE, at(DAY1, '08:00'));
    const api = fakeApi();
    await assert.rejects(
        morning.runMorningTick({ api, now: at(DAY1, '11:00'), build: async () => { throw new Error('нет сети'); }, pauseMs: 0 }),
    );
    await tick(api, at(DAY1, '11:01'));
    assert.equal(api.sent.length, 1);
});

// ---------- Текст сводки ----------

function stub(object, name, fn) {
    const original = object[name];
    object[name] = fn;
    return () => {
        object[name] = original;
    };
}

test('текст сводки: погода и курс', async () => {
    const restore = [
        stub(weather, 'findPlace', async () => ({ name: 'Ереван' })),
        stub(weather, 'getTodayText', async () => '🌤 Погода — Ереван, Армения'),
        stub(currency, 'amdRatesText', async () => '💱 Курс драма сегодня:\n1 USD = 400,00 AMD'),
    ];
    try {
        const text = await morning.buildSummary(at(DAY1, '11:00'));
        assert.match(text, /^☀️ Доброе утро! Сегодня четверг, 12 ноября\./);
        assert.match(text, /🌤 Погода — Ереван/);
        assert.match(text, /1 USD = 400,00 AMD/);
        assert.match(text, /Отключить сводку: \/morning$/);
    } finally {
        restore.forEach((r) => r());
    }
});

test('текст сводки: если погода недоступна, курс всё равно приходит', async () => {
    const restore = [
        stub(weather, 'findPlace', async () => {
            throw new Error('нет сети');
        }),
        stub(currency, 'amdRatesText', async () => '💱 Курс драма сегодня'),
    ];
    try {
        const text = await morning.buildSummary(at(DAY1, '11:00'));
        assert.match(text, /Погоду сейчас узнать не удалось/);
        assert.match(text, /Курс драма сегодня/);
    } finally {
        restore.forEach((r) => r());
    }
});

// ---------- Команда /morning и кнопки ----------

test('/morning: включить, выключить, кнопка в меню', async () => {
    const cmd = commands.find((c) => c.command === 'morning');
    let last;
    const ctx = (data) => ({
        chatId: ALICE,
        callbackQuery: data ? { data, message: { message_id: 1, chat: { id: ALICE } } } : undefined,
        reply: async (text, o) => (last = { text, keyboard: o?.reply_markup }),
        api: { editMessageText: async ({ text, reply_markup }) => (last = { text, keyboard: reply_markup }) },
    });
    const buttons = () => last.keyboard.inline_keyboard.flat().map((b) => `${b.text}→${b.callback_data}`);

    await cmd.handler(ctx());
    assert.match(last.text, /Утренняя сводка: выключена/);
    assert.deepEqual(buttons(), ['🔔 Включить→morning:on', '👀 Показать сейчас→morning:preview', '📅 Только будни→morning:weekdays']);

    await cmd.callbacks.morning(ctx('morning:on'), 'on');
    assert.match(last.text, /Готово! Первая сводка — (сегодня|завтра) в 11:00[\s\S]*включена ✅/);
    assert.ok(morning.isSubscribed(ALICE));
    assert.deepEqual(buttons(), ['🔕 Выключить→morning:off', '👀 Показать сейчас→morning:preview', '📅 Только будни→morning:weekdays']);

    await cmd.callbacks.morning(ctx('morning:off'), 'off');
    assert.match(last.text, /Сводка выключена/);
    assert.ok(!morning.isSubscribed(ALICE));

    await cmd.callbacks.morning(ctx('morning')); // кнопка «☀️ Сводка» в главном меню
    assert.match(last.text, /Утренняя сводка: выключена/);

    const { mainMenu } = require('../src/keyboards');
    assert.ok(mainMenu().inline_keyboard.flat().some((b) => b.text === '☀️ Сводка' && b.callback_data === 'morning'));
});

// ---------- Только будни ----------

// 2026-11-12 — четверг, 13 — пятница, 14 — суббота, 15 — воскресенье, 16 — понедельник
const FRI = '2026-11-13';
const SAT = '2026-11-14';
const SUN = '2026-11-15';
const MON = '2026-11-16';

test('будни: в субботу и воскресенье не шлём, в понедельник — шлём', async () => {
    morning.subscribe(ALICE, at(DAY1, '08:00'));
    morning.setWeekdaysOnly(ALICE, true);
    morning.subscribe(BOB, at(DAY1, '08:00')); // Боб — каждый день
    const api = fakeApi();

    await tick(api, at(FRI, '11:00'));
    await tick(api, at(SAT, '11:00'));
    await tick(api, at(SUN, '11:00'));
    await tick(api, at(MON, '11:00'));

    const days = (id) => api.sent.filter((m) => m.chat_id === id).length;
    assert.equal(days(ALICE), 2, 'Алиса: пятница и понедельник');
    assert.equal(days(BOB), 4, 'Боб: все четыре дня');
});

test('будни: «следующая сводка — …» учитывает выходные', () => {
    morning.subscribe(ALICE, at(DAY1, '08:00'));
    morning.setWeekdaysOnly(ALICE, true);
    assert.equal(morning.nextDelivery(ALICE, at(FRI, '10:00')), 'сегодня');
    assert.equal(morning.nextDelivery(ALICE, at(FRI, '12:00')), 'в понедельник');
    assert.equal(morning.nextDelivery(ALICE, at(SAT, '09:00')), 'в понедельник');
    assert.equal(morning.nextDelivery(ALICE, at(SUN, '09:00')), 'завтра');
    assert.equal(morning.nextDelivery(ALICE, at(DAY1, '12:00')), 'завтра'); // чт → пт

    morning.setWeekdaysOnly(ALICE, false);
    assert.equal(morning.nextDelivery(ALICE, at(FRI, '12:00')), 'завтра'); // каждый день → в субботу

    // Подписался в пятницу после 11:00 с режимом «будни» — первая придёт в понедельник
    morning.setWeekdaysOnly(BOB, true);
    assert.equal(morning.subscribe(BOB, at(FRI, '11:30')), 'в понедельник');
});

test('будни: настройку можно выбрать до включения — сводка от этого не включается', async () => {
    morning.setWeekdaysOnly(ALICE, true);
    assert.ok(!morning.isSubscribed(ALICE));
    assert.ok(morning.isWeekdaysOnly(ALICE));
    const api = fakeApi();
    await tick(api, at(MON, '11:00'));
    assert.equal(api.sent.length, 0);

    morning.subscribe(ALICE, at(MON, '08:00'));
    assert.ok(morning.isWeekdaysOnly(ALICE), 'режим сохранился после включения');
    morning.unsubscribe(ALICE);
    assert.ok(morning.isWeekdaysOnly(ALICE), 'и после выключения');
});

test('/morning: кнопка «Только будни» ↔ «Каждый день»', async () => {
    const cmd = commands.find((c) => c.command === 'morning');
    let last;
    const ctx = () => ({
        chatId: ALICE,
        callbackQuery: { data: 'x', message: { message_id: 1, chat: { id: ALICE } } },
        reply: async (text, o) => (last = { text, keyboard: o?.reply_markup }),
        api: { editMessageText: async ({ text, reply_markup }) => (last = { text, keyboard: reply_markup }) },
    });
    const buttons = () => last.keyboard.inline_keyboard.flat().map((b) => b.callback_data);

    await cmd.callbacks.morning(ctx(), 'on');
    await cmd.callbacks.morning(ctx(), 'weekdays');
    assert.match(last.text, /сводка по будням \(пн–пт\) в 11:00/);
    assert.match(last.text, /Когда: по будням \(пн–пт\)/);
    assert.match(last.text, /Следующая — (сегодня|завтра|в понедельник) в 11:00/);
    assert.ok(buttons().includes('morning:daily'));

    await cmd.callbacks.morning(ctx(), 'daily');
    assert.match(last.text, /Когда: каждый день/);
    assert.ok(buttons().includes('morning:weekdays'));
});

test('база: старая таблица подписок получает новую колонку при запуске', () => {
    const { DatabaseSync } = require('node:sqlite');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bot-')), 'old.db');

    // База, созданная прошлой версией бота (без weekdays_only), с одной подпиской
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE morning_subscriptions (chat_id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1,
              last_sent_date TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
              INSERT INTO morning_subscriptions (chat_id, enabled) VALUES (555, 1);`);
    old.close();

    closeDatabase();
    try {
        openDatabase(file);
        const row = getDb().prepare('SELECT chat_id, enabled, weekdays_only FROM morning_subscriptions').get();
        assert.deepEqual({ ...row }, { chat_id: 555, enabled: 1, weekdays_only: 0 }, 'подписка сохранилась, режим — каждый день');
    } finally {
        closeDatabase();
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
        openDatabase(':memory:');
    }
});
