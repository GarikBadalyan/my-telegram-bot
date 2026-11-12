// Безопасный калькулятор выражений (без eval).

// Никогда не используем eval() для пользовательского ввода: через него можно
// выполнить любой код на сервере. Вместо этого разбираем выражение сами.

const CALC_MAX_LENGTH = 200;

// Шаг 1. Разбиваем строку на «токены»: числа, операторы и скобки
function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        const ch = input[i];
        if (/\s/.test(ch)) {
            i++;
        } else if (/[0-9.,]/.test(ch)) {
            let num = '';
            while (i < input.length && /[0-9.,]/.test(input[i])) {
                num += input[i] === ',' ? '.' : input[i]; // 2,5 → 2.5
                i++;
            }
            if (!/^(\d+\.?\d*|\.\d+)$/.test(num)) {
                throw new Error(`Неправильное число: «${num}»`);
            }
            tokens.push({ type: 'num', value: Number(num) });
        } else if ('+-*/%^()'.includes(ch)) {
            tokens.push({ type: 'op', value: ch });
            i++;
        } else if ('×·xх'.includes(ch)) {
            tokens.push({ type: 'op', value: '*' }); // 2 × 3, 2 x 3
            i++;
        } else if (ch === '−' || ch === '–') {
            tokens.push({ type: 'op', value: '-' }); // типографские минус и тире
            i++;
        } else if (ch === '÷' || ch === ':') {
            tokens.push({ type: 'op', value: '/' });
            i++;
        } else {
            throw new Error(`Непонятный символ: «${ch}»`);
        }
    }
    return tokens;
}

// Шаг 2. Считаем с учётом приоритета операций (рекурсивный спуск):
//   expr   = term   { (+|-) term }
//   term   = power  { (*|/|%) power }
//   power  = unary  [ ^ power ]
//   unary  = [-|+] unary | primary
//   primary = число | ( expr )
function evaluate(input) {
    const tokens = tokenize(input);
    if (tokens.length === 0) {
        throw new Error('Пустое выражение');
    }
    let pos = 0;
    const peek = () => tokens[pos];
    const isOp = (v) => peek()?.type === 'op' && peek().value === v;

    function expr() {
        let left = term();
        while (isOp('+') || isOp('-')) {
            const op = tokens[pos++].value;
            const right = term();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    function term() {
        let left = power();
        while (isOp('*') || isOp('/') || isOp('%')) {
            const op = tokens[pos++].value;
            const right = power();
            if ((op === '/' || op === '%') && right === 0) {
                throw new Error('Делить на ноль нельзя');
            }
            if (op === '*') left *= right;
            else if (op === '/') left /= right;
            else left %= right;
        }
        return left;
    }

    function power() {
        const base = unary();
        if (isOp('^')) {
            pos++;
            return base ** power(); // 2^3^2 = 2^(3^2)
        }
        return base;
    }

    function unary() {
        if (isOp('-')) {
            pos++;
            return -unary();
        }
        if (isOp('+')) {
            pos++;
            return unary();
        }
        return primary();
    }

    function primary() {
        const token = peek();
        if (!token) {
            throw new Error('Выражение оборвалось — не хватает числа');
        }
        if (token.type === 'num') {
            pos++;
            return token.value;
        }
        if (token.value === '(') {
            pos++;
            const value = expr();
            if (!isOp(')')) {
                throw new Error('Не хватает закрывающей скобки «)»');
            }
            pos++;
            return value;
        }
        throw new Error(`Неожиданный символ «${token.value}»`);
    }

    const result = expr();
    if (pos < tokens.length) {
        throw new Error(`Лишний символ «${tokens[pos].value}»`);
    }
    if (!Number.isFinite(result)) {
        throw new Error('Слишком большое число');
    }
    return result;
}

// Красиво показываем результат: без «0.30000000000000004»
function formatNumber(n) {
    const rounded = Number(n.toPrecision(12));
    return Object.is(rounded, -0) ? '0' : String(rounded);
}

module.exports = { evaluate, formatNumber, CALC_MAX_LENGTH };
