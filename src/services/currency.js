// Конвертер валют. Курсы — бесплатный API ExchangeRate-API (open.er-api.com, ключ не нужен).
// Курсы там обновляются раз в сутки, поэтому храним их в памяти час и не дёргаем API зря.
// Берём курсы к доллару и считаем любую пару через него: 100 EUR → AMD = 100 × AMD/EUR.

const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 час
const MAX_AMOUNT = 1e12;

// Ошибка, которую можно показать пользователю как есть
class CurrencyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CurrencyError';
    }
}

// Как ещё пользователь может назвать валюту → код ISO
const ALIASES = {
    $: 'USD', доллар: 'USD', доллара: 'USD', долларов: 'USD', доллары: 'USD', долл: 'USD', бакс: 'USD',
    '€': 'EUR', евро: 'EUR',
    '₽': 'RUB', рубль: 'RUB', рубля: 'RUB', рублей: 'RUB', рубли: 'RUB', руб: 'RUB', ruble: 'RUB',
    '֏': 'AMD', драм: 'AMD', драма: 'AMD', драмов: 'AMD', драмы: 'AMD', դրամ: 'AMD', dram: 'AMD',
    '£': 'GBP', фунт: 'GBP', фунтов: 'GBP', фунты: 'GBP',
    лари: 'GEL', юань: 'CNY', юаней: 'CNY', юани: 'CNY', тенге: 'KZT',
    гривна: 'UAH', гривен: 'UAH', гривны: 'UAH',
    лира: 'TRY', лир: 'TRY', лиры: 'TRY', дирхам: 'AED', дирхамов: 'AED', дирхамы: 'AED',
};

// Слова-связки, которые можно писать между валютами: «100 USD в AMD», «100 usd to amd»
const FILLERS = new Set(['в', 'во', 'to', 'in', '->', '→', '=', 'на']);

const NAMES = {
    USD: 'доллар США', EUR: 'евро', RUB: 'российский рубль', AMD: 'армянский драм',
    GBP: 'британский фунт', GEL: 'грузинский лари', CNY: 'китайский юань',
    KZT: 'казахстанский тенге', UAH: 'украинская гривна', TRY: 'турецкая лира', AED: 'дирхам ОАЭ',
};

let cache = null; // { rates, updatedAt, fetchedAt }

async function getRates() {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        return cache;
    }
    try {
        const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.result !== 'success' || !data.rates) throw new Error(`API error: ${data['error-type']}`);
        cache = {
            rates: data.rates,
            updatedAt: new Date(data.time_last_update_unix * 1000),
            fetchedAt: Date.now(),
        };
        return cache;
    } catch (error) {
        // Сервис недоступен — отвечаем по последним известным курсам, если они есть
        if (cache) {
            console.error('Currency API error, using cached rates:', error.message);
            return cache;
        }
        throw error;
    }
}

function toCode(word) {
    const lower = word.toLowerCase();
    return ALIASES[lower] ?? word.toUpperCase();
}

// «100 USD AMD», «USD AMD», «100,5 usd в amd», «100 долларов в драмы» → { amount, from, to }
function parseQuery(input) {
    const words = String(input ?? '')
        .trim()
        .replace(/(\d)([$€₽֏£])/g, '$1 $2') // «100$» → «100 $»
        .split(/\s+/)
        .filter((w) => w && !FILLERS.has(w.toLowerCase()));

    if (words.length && /^-[\d.,]+$/.test(words[0])) {
        throw new CurrencyError('Сумма должна быть больше нуля.');
    }

    let amount = 1;
    if (words.length && /^[\d.,]+$/.test(words[0])) {
        const raw = words.shift();
        if (!/^(\d+([.,]\d+)?|[.,]\d+)$/.test(raw)) {
            throw new CurrencyError(`«${raw}» — не число. Пример суммы: 100 или 99,50`);
        }
        amount = Number(raw.replace(',', '.'));
    }
    if (words.length !== 2) {
        throw new CurrencyError('Укажи сумму и две валюты.');
    }
    if (!(amount > 0)) {
        throw new CurrencyError('Сумма должна быть больше нуля.');
    }
    if (amount > MAX_AMOUNT) {
        throw new CurrencyError('Слишком большая сумма.');
    }
    const [from, to] = words.map(toCode);
    for (const [code, original] of [[from, words[0]], [to, words[1]]]) {
        if (!/^[A-Z]{3}$/.test(code)) {
            throw new CurrencyError(`Не знаю валюту «${original.slice(0, 20)}». Пиши код из 3 букв: USD, EUR, AMD, RUB…`);
        }
    }
    return { amount, from, to };
}

async function convert(amount, from, to) {
    const { rates, updatedAt } = await getRates();
    for (const code of [from, to]) {
        if (!rates[code]) {
            throw new CurrencyError(`Не знаю валюту «${code}». Пиши код из 3 букв: USD, EUR, AMD, RUB…`);
        }
    }
    const rate = rates[to] / rates[from];
    return { amount, from, to, rate, result: amount * rate, updatedAt };
}

// 38750.5 → «38 750,50»; маленькие числа — со значащими цифрами: 0.002773 → «0,002773».
// exact = true — для суммы, которую ввёл пользователь: 1000 → «1 000», 99.5 → «99,5»
function formatMoney(n, exact = false) {
    const options = exact
        ? { maximumFractionDigits: 6 }
        : Math.abs(n) >= 1 || n === 0
          ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          : { maximumSignificantDigits: 4 };
    return new Intl.NumberFormat('ru-RU', options).format(n);
}

const currencyName = (code) => NAMES[code] ?? code;

module.exports = {
    CurrencyError,
    parseQuery,
    convert,
    getRates,
    formatMoney,
    currencyName,
    // для тестов: подменить или сбросить кэш курсов
    _setCache: (value) => {
        cache = value;
    },
};
