// Тесты конвертера валют и ответа на неизвестные команды. Запуск: npm test
// Курсы подставляются вручную — тесты не ходят в интернет.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const currency = require('../src/services/currency');
const rate = require('../src/commands/rate');
const { unknownCommandReply, closestCommand, editDistance } = require('../src/utils/unknownCommand');
const { commands } = require('../src/commands');

const FAKE_RATES = { USD: 1, AMD: 400, EUR: 0.8, RUB: 80, GEL: 2.5 };

beforeEach(() => {
    currency._setCache({ rates: FAKE_RATES, updatedAt: new Date('2026-11-12T00:00:00Z'), fetchedAt: Date.now() });
});

async function rateReply(text) {
    let reply;
    await rate.handler({ message: { text }, reply: async (t) => (reply = t) });
    return reply;
}

// ---------- Валюты ----------

test('валюты: разбор запроса', () => {
    assert.deepEqual(currency.parseQuery('100 USD AMD'), { amount: 100, from: 'USD', to: 'AMD' });
    assert.deepEqual(currency.parseQuery('usd amd'), { amount: 1, from: 'USD', to: 'AMD' });
    assert.deepEqual(currency.parseQuery('99,5 евро в рубли'), { amount: 99.5, from: 'EUR', to: 'RUB' });
    assert.deepEqual(currency.parseQuery('100$ драм'), { amount: 100, from: 'USD', to: 'AMD' });
    assert.deepEqual(currency.parseQuery('10 usd to eur'), { amount: 10, from: 'USD', to: 'EUR' });
});

test('валюты: ошибки ввода', () => {
    const bad = {
        '': /две валюты/,
        '100 USD': /две валюты/,
        '100 USD AMD EUR': /две валюты/,
        '-5 USD AMD': /больше нуля/,
        '0 USD AMD': /больше нуля/,
        '1.2.3 USD AMD': /не число/,
        '1e99 USD AMD': /две валюты/,
        '9999999999999 USD AMD': /большая сумма/,
        '100 доллары1 AMD': /Не знаю валюту/,
        '100 US AMD': /Не знаю валюту/,
    };
    for (const [input, pattern] of Object.entries(bad)) {
        assert.throws(
            () => currency.parseQuery(input),
            (e) => e instanceof currency.CurrencyError && pattern.test(e.message),
            input,
        );
    }
});

test('валюты: расчёт через доллар', async () => {
    const r = await currency.convert(100, 'EUR', 'AMD'); // 100 EUR = 100 / 0.8 USD = 125 USD = 50 000 AMD
    assert.equal(r.result, 50000);
    assert.equal(r.rate, 500);
    await assert.rejects(currency.convert(1, 'USD', 'XYZ'), /Не знаю валюту «XYZ»/);
});

test('валюты: ответ команды /rate', async () => {
    // Тысячи Intl разделяет неразрывным пробелом (U+202F) — в регулярке это \s
    assert.match(await rateReply('/rate 100 USD AMD'), /^💱 100 USD = 40\s000,00 AMD\n\n1 USD = 400,00 AMD\n1 AMD = 0,0025 USD/);
    assert.match(await rateReply('/rate 1000 AMD RUB'), /^💱 1\s000 AMD = 200,00 RUB/);
    assert.match(await rateReply('/rate'), /Курс драма сегодня[\s\S]*1 EUR = 500,00 AMD/);
    assert.match(await rateReply('/rate 100 USD XYZ'), /⚠️ Не знаю валюту «XYZ»[\s\S]*Пример: \/rate 100 USD AMD/);
});

test('валюты: без интернета и без кэша — понятная ошибка, бот не падает', async () => {
    currency._setCache(null);
    const realFetch = global.fetch;
    global.fetch = async () => {
        throw new Error('нет сети');
    };
    const realError = console.error;
    console.error = () => {};
    try {
        assert.match(await rateReply('/rate 100 USD AMD'), /Не удалось получить курс/);
    } finally {
        global.fetch = realFetch;
        console.error = realError;
    }
});

test('валюты: сервис упал — отвечаем по последним известным курсам', async () => {
    currency._setCache({ rates: FAKE_RATES, updatedAt: new Date(), fetchedAt: 0 }); // кэш устарел
    const realFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 503 });
    const realError = console.error;
    console.error = () => {};
    try {
        assert.match(await rateReply('/rate 1 USD AMD'), /1 USD = 400,00 AMD/);
    } finally {
        global.fetch = realFetch;
        console.error = realError;
    }
});

// ---------- Неизвестные команды ----------

const names = commands.map((c) => c.command);
const reply = (text, chatType = 'private') =>
    unknownCommandReply({ message: { text }, chat: { type: chatType }, me: { username: 'My_Bot' } }, names);

test('опечатки: расстояние и подсказка', () => {
    assert.equal(editDistance('tsks', 'tasks'), 1);
    assert.equal(editDistance('hlep', 'help'), 1); // перестановка — одна ошибка
    assert.equal(closestCommand('tsks', names), 'tasks');
    assert.equal(closestCommand('hlep', names), 'help');
    assert.equal(closestCommand('wether', names), 'weather');
    assert.equal(closestCommand('START', names), 'start');
    assert.equal(closestCommand('xyz', names), null);
    assert.equal(closestCommand('a', names), null); // слишком коротко, чтобы гадать
});

test('неизвестные команды: когда отвечаем, а когда молчим', () => {
    assert.match(reply('/tsks'), /Не знаю команды \/tsks\.\nМожет, ты имел в виду \/tasks\?\n\nВсе команды: \/help/);
    assert.match(reply('/qwerty'), /^🤔 Не знаю команды \/qwerty\.\n\nВсе команды: \/help$/);
    assert.match(reply('/tsks@my_bot'), /\/tasks/); // имя бота без учёта регистра
    assert.equal(reply('/start@other_bot'), null); // команда другому боту
    assert.equal(reply('/tsks', 'group'), null); // в группе — только если обратились к нам
    assert.match(reply('/tsks@My_Bot', 'supergroup'), /\/tasks/);
    assert.equal(reply('просто текст'), null);
    assert.ok(reply('/' + 'a'.repeat(200)).length < 200, 'длинная команда обрезана');
});
