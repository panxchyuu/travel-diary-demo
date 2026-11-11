// Fast path for dated lists of explicit prices. Free-form prose stays on the model path.
export function readDatedExpenseList(text, year) {
  const lines = text.normalize('NFKC').split(/\r?\n/).map(line => line.trim());
  const dateHead = /^(?:(\d{4})[-./年])?(\d{1,2})[-./月](\d{1,2})(?:日)?(?=[\s:])/;
  if (lines.filter(line => dateHead.test(line)).length < 2 ||
      /预算|预计|报价|计划|还没|没买|免费|退款|找零|折合|相当于|小计|合计|总计|一共|大约|左右|约\s*\d|\d[几多]|[+\-]\s*\d+(?:\.\d+)?\s*(?:人民币|拉菲亚|美元|刀|元)/.test(text)) return null;
  const currency = { 刀:'USD', 美刀:'USD', 美金:'USD', 美元:'USD', 拉菲亚:'MVR', 人民币:'CNY', 元:'CNY' };
  const trim = value => value.replace(/^[\s:、,;。]+|[\s:、,;。]+$/g, '');
  const rows = [];
  let date = null;
  for (let line of lines) {
    if (!line) { date = null; continue; }
    const head = line.match(dateHead);
    if (head) {
      date = `${head[1] || year}-${head[2].padStart(2,'0')}-${head[3].padStart(2,'0')}`;
      const check = new Date(date + 'T00:00:00Z');
      if (isNaN(check.getTime()) || check.toISOString().slice(0,10) !== date) return null;
      line = trim(line.slice(head[0].length));
    }
    if (!line || /^[^\d:]{1,24}:$/.test(line)) continue;
    if (/^[^\d:]{1,18}:[\s]*(?=\D)/.test(line)) line = line.replace(/^[^\d:]+:\s*/, '');
    const matches = [...line.matchAll(/(?<![\d.,+\-])([0-9]+(?:\.[0-9]+)?)\s*(人民币|拉菲亚|美刀|美金|美元|刀|元)(\s*\((?:visa|现金|刷卡)[^)]*\))?/gi)];
    if (!matches.length) return null;
    const gaps = matches.map((match,index) => trim(line.slice(index ? matches[index-1].index+matches[index-1][0].length : 0,match.index)));
    gaps.push(trim(line.slice(matches.at(-1).index+matches.at(-1)[0].length)));
    let notes = gaps.slice(0,-1);
    if (!gaps[0]) {
      if (matches.length > 1 && /:$/.test(line.slice(matches[0].index+matches[0][0].length,matches[1].index).trim())) {
        const pair = gaps[1].match(/^(.+)\s+(\S+)$/);
        if (!pair || gaps.at(-1)) return null;
        notes = [pair[1],pair[2],...gaps.slice(2,-1)];
      } else notes = gaps.slice(1);
    } else if (gaps.at(-1)) return null;
    if (notes.some(note => note.length > 60 || /[。！？]|(?:^|[\s,;:])\d+(?:\.\d+)?(?=$|[\s,;:])/.test(note))) return null;
    matches.forEach((match,index) => {
      const note = notes[index] || '用途未注明';
      const category = /轮渡|车费|打车/.test(note) ? '交通' : /海钓|浮潜/.test(note) ? '娱乐'
        : /午饭|午餐|晚餐|冷萃|啤酒|可乐|生啤|机场水|面包/.test(note) ? '餐饮'
        : /冰箱贴|头绳|渔具|便利店|咖啡豆|金枪鱼干/.test(note) ? '购物'
        : /行李寄存/.test(note) ? '交通' : '其他';
      rows.push({ date, amount:Number(match[1]), currency:currency[match[2]], category, note,
        payMethod:/visa|刷卡/i.test(match[3]||'')?'visa':/现金/.test(match[3]||'')?'cash':'' });
    });
  }
  return rows.length && rows.length <= 100 && rows.every(row => row.amount > 0 && row.amount <= 1e9) ? rows : null;
}
