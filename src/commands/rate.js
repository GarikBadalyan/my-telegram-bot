const currency = require('../services/currency');
const { commandArgs } = require('../utils/telegram');

const USAGE = '/rate 100 USD AMD';

const formatDate = (date) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Yerevan', dateStyle: 'short', timeStyle: 'short' }).format(date);

const footer = (updatedAt) => `🕒 Курс на ${formatDate(updatedAt)} · источник: exchangerate-api.com`;

// /rate без параметров — курс драма к популярным валютам и подсказка
async function popularRates(ctx) {
    const lines = ['💱 Курс драма сегодня:', ''];
    let updatedAt;
    for (const code of ['USD', 'EUR', 'RUB', 'GEL']) {
        const r = await currency.convert(1, code, 'AMD');
        updatedAt = r.updatedAt;
        lines.push(`1 ${code} = ${currency.formatMoney(r.result)} AMD`);
    }
    lines.push(
        '',
        footer(updatedAt),
        '',
        'Посчитать: /rate 100 USD AMD',
        'Можно и так: /rate 50 евро в рубли, /rate EUR USD',
    );
    await ctx.reply(lines.join('\n'));
}

module.exports = {
    command: 'rate',
    description: 'Конвертер валют: /rate 100 USD AMD',

    async handler(ctx) {
        const input = commandArgs(ctx);
        try {
            if (!input) {
                await popularRates(ctx);
                return;
            }
            const { amount, from, to } = currency.parseQuery(input);
            const r = await currency.convert(amount, from, to);
            await ctx.reply(
                [
                    `💱 ${currency.formatMoney(amount, true)} ${from} = ${currency.formatMoney(r.result)} ${to}`,
                    '',
                    `1 ${from} = ${currency.formatMoney(r.rate)} ${to}`,
                    `1 ${to} = ${currency.formatMoney(1 / r.rate)} ${from}`,
                    `(${currency.currencyName(from)} → ${currency.currencyName(to)})`,
                    '',
                    footer(r.updatedAt),
                ].join('\n'),
            );
        } catch (error) {
            if (error instanceof currency.CurrencyError) {
                await ctx.reply(`⚠️ ${error.message}\n\nПример: ${USAGE}`);
                return;
            }
            console.error('Currency error:', error);
            await ctx.reply('😔 Не удалось получить курс валют. Попробуй позже.');
        }
    },
};
