// Ответ на неизвестную команду: «/tsks» → «Не знаю такой команды. Может, /tasks?»
//
// Сюда попадают только команды, которые не нашлись среди зарегистрированных:
// библиотека передаёт сообщение дальше, только если ни одна команда не подошла.

// Сколько опечаток отделяет одно слово от другого: замена, лишняя или пропущенная буква,
// перестановка соседних букв — по 1 («tsks» → «tasks» = 1, «hlep» → «help» = 1)
function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // перестановка
            }
        }
    }
    return d[a.length][b.length];
}

// Самая похожая команда, если она достаточно похожа (не больше 2 ошибок, и не в коротком слове)
function closestCommand(name, commandNames) {
    const lower = name.toLowerCase();
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of commandNames) {
        const d = editDistance(lower, candidate);
        if (d < bestDistance) {
            best = candidate;
            bestDistance = d;
        }
    }
    const allowed = Math.min(2, Math.floor(Math.max(lower.length, best?.length ?? 0) / 3));
    return bestDistance <= allowed ? best : null;
}

// Текст ответа или null, если отвечать не нужно
function unknownCommandReply(ctx, commandNames) {
    const text = ctx.message?.text ?? '';
    const m = /^\/([^\s@]+)(?:@(\S+))?/.exec(text);
    if (!m) return null;

    const [, name, addressedTo] = m;
    const ourName = ctx.me?.username?.toLowerCase();

    // «/start@other_bot» — команда другому боту, не наше дело
    if (addressedTo && addressedTo.toLowerCase() !== ourName) return null;

    // В группе голая «/команда» может быть для другого бота — отвечаем,
    // только если обратились именно к нам: «/команда@наш_бот»
    if (ctx.chat?.type !== 'private' && !addressedTo) return null;

    const shown = name.length > 32 ? `${name.slice(0, 32)}…` : name;
    const lines = [`🤔 Не знаю команды /${shown}.`];
    const suggestion = closestCommand(name, commandNames);
    if (suggestion) {
        lines.push(`Может, ты имел в виду /${suggestion}?`);
    }
    lines.push('', 'Все команды: /help');
    return lines.join('\n');
}

module.exports = { unknownCommandReply, closestCommand, editDistance };
