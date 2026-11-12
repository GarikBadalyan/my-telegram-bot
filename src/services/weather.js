// Погода через бесплатный API Open-Meteo (ключ не нужен).

// Расшифровка кодов погоды WMO, которые возвращает Open-Meteo
const WEATHER_CODES = {
    0: '☀️ Ясно',
    1: '🌤 Преимущественно ясно',
    2: '⛅ Переменная облачность',
    3: '☁️ Пасмурно',
    45: '🌫 Туман',
    48: '🌫 Изморозь',
    51: '🌦 Слабая морось',
    53: '🌦 Морось',
    55: '🌦 Сильная морось',
    56: '🌧 Ледяная морось',
    57: '🌧 Сильная ледяная морось',
    61: '🌧 Небольшой дождь',
    63: '🌧 Дождь',
    65: '🌧 Сильный дождь',
    66: '🌧 Ледяной дождь',
    67: '🌧 Сильный ледяной дождь',
    71: '🌨 Небольшой снег',
    73: '🌨 Снег',
    75: '❄️ Сильный снег',
    77: '🌨 Снежные зёрна',
    80: '🌦 Небольшой ливень',
    81: '🌧 Ливень',
    82: '⛈ Сильный ливень',
    85: '🌨 Снегопад',
    86: '❄️ Сильный снегопад',
    95: '⛈ Гроза',
    96: '⛈ Гроза с градом',
    99: '⛈ Сильная гроза с градом',
};

const DEFAULT_CITY = 'Ереван';

async function fetchJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.json();
}

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1';
const FORECAST_DAYS = 5;

// Город по названию: { id, name, country, latitude, longitude } или null
async function findPlace(city) {
    const geo = await fetchJson(`${GEO_URL}/search?count=1&language=ru&name=${encodeURIComponent(city)}`);
    return geo.results?.[0] ?? null;
}

// Город по его ID в Open-Meteo (ID хранится в кнопках «Завтра» / «5 дней»)
async function getPlace(id) {
    if (!/^\d{1,12}$/.test(String(id))) return null;
    try {
        const place = await fetchJson(`${GEO_URL}/get?language=ru&id=${id}`);
        return place?.id ? place : null;
    } catch (error) {
        if (/HTTP 4\d\d/.test(error.message)) return null; // такого ID нет
        throw error;
    }
}

// Текущая погода и прогноз по дням — одним запросом
async function getForecast(place) {
    return fetchJson(
        'https://api.open-meteo.com/v1/forecast' +
            `?latitude=${place.latitude}&longitude=${place.longitude}` +
            '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max' +
            `&wind_speed_unit=ms&timezone=auto&forecast_days=${FORECAST_DAYS + 1}`,
    );
}

// ---------- Оформление ----------

const describe = (code) => WEATHER_CODES[code] || '🌡 Без описания';
const temp = (t) => `${Math.round(t)}°C`;
const placeName = (place) => [place.name, place.country].filter(Boolean).join(', ');

// «2026-11-13» (дата в часовом поясе города) → «пт, 13 ноября»
function formatDay(isoDate, options = { weekday: 'short', day: 'numeric', month: 'long' }) {
    return new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(
        new Date(`${isoDate}T12:00:00Z`),
    );
}

function formatNow(place, forecast) {
    const c = forecast.current;
    return [
        `📍 ${placeName(place)} — сейчас`,
        describe(c.weather_code),
        `🌡 Температура: ${temp(c.temperature_2m)} (ощущается как ${temp(c.apparent_temperature)})`,
        `💧 Влажность: ${c.relative_humidity_2m}%`,
        `💨 Ветер: ${c.wind_speed_10m.toFixed(1)} м/с`,
    ].join('\n');
}

function formatTomorrow(place, forecast) {
    const d = forecast.daily;
    const i = 1; // 0 — сегодня, 1 — завтра
    return [
        `📍 ${placeName(place)} — завтра, ${formatDay(d.time[i])}`,
        describe(d.weather_code[i]),
        `🌡 Температура: от ${temp(d.temperature_2m_min[i])} до ${temp(d.temperature_2m_max[i])}`,
        `☔ Вероятность осадков: ${d.precipitation_probability_max[i] ?? '—'}%`,
        `💨 Ветер: до ${d.wind_speed_10m_max[i].toFixed(1)} м/с`,
    ].join('\n');
}

function formatDays(place, forecast) {
    const d = forecast.daily;
    const lines = [`📍 ${placeName(place)} — прогноз на ${FORECAST_DAYS} дней`, ''];
    for (let i = 1; i <= FORECAST_DAYS && i < d.time.length; i++) {
        const day = formatDay(d.time[i], { weekday: 'short', day: '2-digit', month: '2-digit' });
        lines.push(
            `${day} — ${describe(d.weather_code[i])}`,
            `      🌡 ${temp(d.temperature_2m_min[i])}…${temp(d.temperature_2m_max[i])}` +
                `  ☔ ${d.precipitation_probability_max[i] ?? '—'}%` +
                `  💨 ${d.wind_speed_10m_max[i].toFixed(1)} м/с`,
        );
    }
    return lines.join('\n');
}

const FORMATTERS = { now: formatNow, tomorrow: formatTomorrow, days: formatDays };
const MODES = Object.keys(FORMATTERS);

// Текст погоды для города в нужном режиме: now — сейчас, tomorrow — завтра, days — 5 дней
async function getWeatherText(place, mode = 'now') {
    const format = FORMATTERS[mode];
    if (!format) throw new Error(`Неизвестный режим погоды: ${mode}`);
    return format(place, await getForecast(place));
}

module.exports = { findPlace, getPlace, getWeatherText, MODES, DEFAULT_CITY, FORECAST_DAYS };
