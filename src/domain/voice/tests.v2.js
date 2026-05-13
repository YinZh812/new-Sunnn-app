// domain/voice/tests.v2.js —— v2 解析器回归用例
//
// 运行方式（浏览器控制台）：
//   runVoiceTestsV2()
//
// 隐私说明：用例已匿名化（朋友/家人真名替换为"朋友"/"他们"）。
//   阶段 2~6 新增用例时也务必保持匿名。
//
// 阶段 1 用例与 v1 等价（v2 行为 ≡ v1）。阶段 2~6 会扩充覆盖：
//   - 阶段 2：emoji → 文字、全角数字、错字
//   - 阶段 3：中文数字金额（三块五 / 一百六 / 两千五 / 十二块八）
//   - 阶段 4：时间扩展（中午 / 下午3点半 / 上周三 / 三天前）
//   - 阶段 5：商家识别（独立 merchant 字段）

import { parseVoiceText } from "./parser.v2.js";

/**
 * 与 v1 同结构的回归用例，但人名已匿名化。
 * 每条 input 至少需要：金额识别正确、类型合理。
 */
const CASES = [
  { input: "羽毛球 5.2",                                   expectAmount: 5.2,   expectType: "expense", note: "运动" },
  { input: "4个smash fernand",                              expectAmount: null,  expectType: "expense", note: "需补录金额；类别=吃" },
  { input: "orange运营商22.99",                             expectAmount: 22.99, expectType: "expense", note: "其他（运营商）" },
  { input: "朋友这边宠物店给狗狗买吃的13.84",                expectAmount: 13.84, expectType: "expense", note: "买（宠物/买）" },
  { input: "鲨鱼记账会员1.99欧用来导出数据15",              expectAmount: 15,    expectType: "expense", note: "货币后裸数字优先（15>1.99）" },
  { input: "打球加球线8.5+10",                              expectAmount: 18.5,  expectType: "expense", note: "加法式：8.5+10=18.5" },
  { input: "他们casino赢了3000多给我150",                    expectAmount: 150,   expectType: "income",  note: "给我N→150；type=income" },
  { input: "跟朋友吃印度菜35",                               expectAmount: 35,    expectType: "expense", note: "吃（印度菜）" },
  { input: "朋友请我zzyxlj吃饭",                             expectAmount: null,  expectType: "expense", note: "需补录金额；类别=吃（zzyxlj）" },
  { input: "朋友帮我付驾校510",                              expectAmount: 510,   expectType: "expense", note: "其他（驾校）" },
  { input: "Engie退23.67转朋友12",                           expectAmount: 23.67, expectType: "income",  note: "type=income（退）；类别=转账" },
  // ── 已知边界 case（同 v1，标 knownEdge 不计失败） ──
  { input: "朋友赌我最后一球不进100rmb",                    expectAmount: 100,   expectType: "income",  note: '"最后"被误切（known edge）', knownEdge: true },
];

const MULTI_CASE = "今天加油，然后买了orange，还吃了kebab";

/**
 * 跑全部用例并打印结果。
 * @param {Object} [options]
 * @param {"EUR"|"CNY"} [options.defaultCurrency="EUR"]
 * @returns {{passed:number, total:number, knownEdge:number}}
 */
export function runVoiceTestsV2(options = {}) {
  const opts = { defaultCurrency: "EUR", ...options };

  console.group("🎙 v2 一句话记账 · 单笔回归");
  const rows = [];
  let passed = 0;
  let edgeCount = 0;
  let totalActive = 0;
  for (const c of CASES) {
    const [r] = parseVoiceText(c.input, opts);
    const amountOk = c.expectAmount === null
      ? r.amount === null
      : Math.abs((r.amount ?? -1) - c.expectAmount) < 1e-6;
    const typeOk = r.type === c.expectType;
    const ok = amountOk && typeOk;

    if (c.knownEdge) {
      edgeCount++;
    } else {
      totalActive++;
      if (ok) passed++;
    }

    rows.push({
      "输入": c.input,
      "金额": r.amount,
      "✓金额": amountOk ? "✓" : "✗",
      "类型": r.type,
      "✓类型": typeOk ? "✓" : "✗",
      "类别": r.category,
      "描述": r.desc,
      "备注": c.note + (c.knownEdge ? " [known edge]" : ""),
    });
  }
  console.table(rows);
  console.log(`通过 ${passed}/${totalActive}` + (edgeCount ? ` （另 ${edgeCount} 条已知边界，不计入）` : ""));
  console.groupEnd();

  console.group("🎙 v2 多笔切分");
  const segs = parseVoiceText(MULTI_CASE, opts);
  console.log(`输入：${MULTI_CASE}`);
  console.log(`切出 ${segs.length} 笔：`);
  console.table(segs.map((s, i) => ({
    "#": i + 1, "金额": s.amount, "类型": s.type, "类别": s.category, "描述": s.desc,
  })));
  console.groupEnd();

  return { passed, total: totalActive, knownEdge: edgeCount };
}
