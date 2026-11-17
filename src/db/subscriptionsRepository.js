// SQL-запросы к таблице morning_subscriptions (подписки на утреннюю сводку).
// Только параметризованные запросы — значения передаются через «?».

const { getDb } = require('./database');

function getSubscription(chatId) {
    const row = getDb()
        .prepare(
            'SELECT chat_id, enabled, last_sent_date, weekdays_only FROM morning_subscriptions WHERE chat_id = ?',
        )
        .get(chatId);
    return row ? { ...row, enabled: row.enabled === 1, weekdays_only: row.weekdays_only === 1 } : undefined;
}

// Включить или выключить. lastSentDate — чтобы при включении после 11:00
// не прислать сводку за сегодня (первая придёт завтра).
function setSubscription(chatId, enabled, lastSentDate = null) {
    getDb()
        .prepare(
            `INSERT INTO morning_subscriptions (chat_id, enabled, last_sent_date) VALUES (?, ?, ?)
             ON CONFLICT (chat_id) DO UPDATE SET
                 enabled = excluded.enabled,
                 last_sent_date = COALESCE(excluded.last_sent_date, morning_subscriptions.last_sent_date)`,
        )
        .run(chatId, enabled ? 1 : 0, lastSentDate);
}

// «Только будни» / «каждый день». Если подписки ещё нет — запоминаем настройку,
// но сводку не включаем.
function setWeekdaysOnly(chatId, weekdaysOnly) {
    getDb()
        .prepare(
            `INSERT INTO morning_subscriptions (chat_id, enabled, weekdays_only) VALUES (?, 0, ?)
             ON CONFLICT (chat_id) DO UPDATE SET weekdays_only = excluded.weekdays_only`,
        )
        .run(chatId, weekdaysOnly ? 1 : 0);
}

// Чаты, которым сегодня сводка ещё не ушла. В выходные — без тех, кто выбрал «только будни».
function listDue(today, isWeekend = false) {
    return getDb()
        .prepare(
            `SELECT chat_id FROM morning_subscriptions
             WHERE enabled = 1
               AND (last_sent_date IS NULL OR last_sent_date < ?)
               AND (weekdays_only = 0 OR ? = 0)
             ORDER BY chat_id`,
        )
        .all(today, isWeekend ? 1 : 0)
        .map((row) => row.chat_id);
}

function markSent(chatId, today) {
    getDb().prepare('UPDATE morning_subscriptions SET last_sent_date = ? WHERE chat_id = ?').run(today, chatId);
}

module.exports = { getSubscription, setSubscription, setWeekdaysOnly, listDue, markSent };
