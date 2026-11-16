const currency = require('../services/currency');
const { commandArgs } = require('../utils/telegram');

const USAGE = '/rate 100 USD AMD';

// /rate без параметров — курс драма к популярным валютам и подсказка
async function popularRates(ctx) {
    await ctx.reply(
        [
            await currency.amdRatesText(),
            '',
            'Посчитать: /rate 100 USD AMD',
            'Можно и так: /rate 50 евро в рубли, /rate EUR USD',
        ].join('\n'),
    );
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
                    currency.sourceLine(r.updatedAt),
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
