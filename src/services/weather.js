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

// Погода через бесплатный API Open-Meteo (ключ не нужен)
async function getWeather(city = DEFAULT_CITY) {
    const geo = await fetchJson(
        'https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=' +
            encodeURIComponent(city),
    );
    const place = geo.results?.[0];
    if (!place) {
        return `🤷 Не нашёл город «${city}». Проверь название.`;
    }

    const forecast = await fetchJson(
        'https://api.open-meteo.com/v1/forecast' +
            `?latitude=${place.latitude}&longitude=${place.longitude}` +
            '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code' +
            '&wind_speed_unit=ms&timezone=auto',
    );
    const c = forecast.current;
    const description = WEATHER_CODES[c.weather_code] || 'Без описания';
    const location = [place.name, place.country].filter(Boolean).join(', ');

    return [
        `📍 ${location}`,
        description,
        `🌡 Температура: ${Math.round(c.temperature_2m)}°C (ощущается как ${Math.round(c.apparent_temperature)}°C)`,
        `💧 Влажность: ${c.relative_humidity_2m}%`,
        `💨 Ветер: ${c.wind_speed_10m.toFixed(1)} м/с`,
    ].join('\n');
}

module.exports = { getWeather, DEFAULT_CITY };
