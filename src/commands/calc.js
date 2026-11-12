const { evaluate, formatNumber, CALC_MAX_LENGTH } = require('../utils/calculator');
const { commandArgs } = require('../utils/telegram');

const CALC_HELP = [
    '🧮 Калькулятор',
    '',
    'Напиши выражение после команды, например:',
    '/calc 25 + 30',
    '/calc (2 + 3) * 4',
    '/calc 2^10',
    '/calc 7,5 / 2',
    '',
    'Можно: + − * / % ^ и скобки.',
].join('\n');

module.exports = {
    command: 'calc',
    description: 'Калькулятор: /calc 25 + 30',

    async handler(ctx) {
        // 1. Достаём то, что пользователь написал после /calc
        const input = commandArgs(ctx);

        // 2. Пустой ввод — показываем подсказку
        if (!input) {
            await ctx.reply(CALC_HELP);
            return;
        }

        // 3. Ограничиваем длину, чтобы никто не прислал гигантское выражение
        if (input.length > CALC_MAX_LENGTH) {
            await ctx.reply(`⚠️ Слишком длинное выражение (максимум ${CALC_MAX_LENGTH} символов).`);
            return;
        }

        // 4. Считаем; любую ошибку ввода объясняем пользователю понятным текстом
        try {
            await ctx.reply(`🧮 ${input} = ${formatNumber(evaluate(input))}`);
        } catch (error) {
            await ctx.reply(`⚠️ ${error.message}\n\nПример: /calc 25 + 30`);
        }
    },
};
