// A bounded arithmetic parser. It never evaluates JavaScript, and uses fractions
// so decimal money inputs and rounding do not inherit binary floating point errors.
export function validateCalculation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('计算参数无效。');
  const expression = typeof input.expression === 'string' ? input.expression.trim() : '';
  const precision = input.precision ?? 2;
  if (!expression || expression.length > 256 || !/^[\d.\s()+*/-]+$/.test(expression)) throw new Error('算式只能包含数字、小数点、四则运算和括号，且不能过长。');
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) throw new Error('计算精度只能是 0 到 6 位小数。');
  return { expression, precision };
}

const absolute = value => value < 0n ? -value : value;
function fraction(n, d = 1n) {
  if (d === 0n) throw new Error('不能除以零。');
  if (d < 0n) { n = -n; d = -d; }
  let a = absolute(n), b = d;
  while (b) [a, b] = [b, a % b];
  n /= a || 1n; d /= a || 1n;
  if (absolute(n).toString().length > 400 || d.toString().length > 400) throw new Error('计算数值过大。');
  return { n, d };
}

export function calculate(input) {
  const { expression, precision } = validateCalculation(input);
  const tokens = [];
  const pattern = /\s*(\d+(?:\.\d*)?|\.\d+|[()+*/-])/y;
  for (let index = 0; index < expression.length;) {
    pattern.lastIndex = index;
    const match = pattern.exec(expression);
    if (!match) throw new Error('算式格式无效。');
    tokens.push(match[1]); index = pattern.lastIndex;
    if (tokens.length > 128) throw new Error('算式过长。');
  }
  let cursor = 0;
  function primary(depth) {
    if (depth > 32) throw new Error('算式嵌套过多。');
    const token = tokens[cursor++];
    if (token === '+' || token === '-') {
      const value = primary(depth + 1);
      return token === '-' ? { n: -value.n, d: value.d } : value;
    }
    if (token === '(') {
      const value = sum(depth + 1);
      if (tokens[cursor++] !== ')') throw new Error('算式括号不匹配。');
      return value;
    }
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error('算式缺少有效数字。');
    const [whole, decimals = ''] = token.split('.');
    return fraction(BigInt((whole || '0') + decimals), 10n ** BigInt(decimals.length));
  }
  function product(depth) {
    let value = primary(depth);
    while (tokens[cursor] === '*' || tokens[cursor] === '/') {
      const operation = tokens[cursor++], right = primary(depth);
      value = operation === '*'
        ? fraction(value.n * right.n, value.d * right.d)
        : fraction(value.n * right.d, value.d * right.n);
    }
    return value;
  }
  function sum(depth) {
    let value = product(depth);
    while (tokens[cursor] === '+' || tokens[cursor] === '-') {
      const operation = tokens[cursor++], right = product(depth);
      value = fraction(value.n * right.d + (operation === '+' ? 1n : -1n) * right.n * value.d, value.d * right.d);
    }
    return value;
  }
  const value = sum(0);
  if (cursor !== tokens.length) throw new Error('算式格式无效。');
  const multiplier = 10n ** BigInt(precision);
  const scaled = absolute(value.n) * multiplier;
  let rounded = scaled / value.d;
  if ((scaled % value.d) * 2n >= value.d) rounded++;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('结果超出安全计算范围，请减少数值或精度。');
  const sign = value.n < 0n && rounded ? '-' : '';
  const digits = rounded.toString().padStart(precision + 1, '0');
  const formatted = sign + (precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}` : digits);
  return { expression, precision, result: Number(formatted), formatted };
}
