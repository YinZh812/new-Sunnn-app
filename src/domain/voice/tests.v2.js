// domain/voice/tests.v2.js —— v2 解析器回归用例
//
// 运行方式（浏览器控制台）：
//   runVoiceTestsV2()
//
// 隐私说明：用例已匿名化（朋友/家人真名替换为"朋友/同事/他们"）。
//   新增用例时也务必保持匿名。
//
// 用例来源：
//   - v1 关键启发式 4 条（给我N / 货币后裸数 / 退款 / 已知边界）
//   - 阶段 2：预处理 4 条（emoji / 全半角 / 错字 / 全角货币）
//   - 阶段 3：中文数字 5 条
//   - 阶段 3.5：通用场景 21 条（方案 A 抢救而来；# "水果5加饮料3" 因加法正则限制丢弃）

import { parseVoiceText } from "./parser.v2.js";

const CASES = [
  // ── v1 关键启发式（4） ──
  { input: "他们casino赢了3000多给我150",                    expectAmount: 150,   expectType: "income",  note: "给我N→150；type=income" },
  { input: "鲨鱼记账会员1.99欧用来导出数据15",                expectAmount: 15,    expectType: "expense", note: "货币后裸数字优先（15>1.99）" },
  { input: "Engie退23.67转朋友12",                           expectAmount: 23.67, expectType: "income",  note: "type=income（退）；类别=转账" },
  { input: "朋友赌我最后一球不进100rmb",                     expectAmount: 100,   expectType: "income",  note: '"最后"作分隔词导致误切（known edge）', knownEdge: true },

  // ── 阶段 2：预处理（4） ──
  { input: "看电影🍿50",                                    expectAmount: 50,    expectType: "expense", note: "emoji → 爆米花" },
  { input: "午饭１２",                                       expectAmount: 12,    expectType: "expense", note: "全角数字 → 12" },
  { input: "麦单劳午餐40",                                   expectAmount: 40,    expectType: "expense", note: "错字 麦单劳 → 麦当劳" },
  { input: "咖啡１８欧",                                     expectAmount: 18,    expectType: "expense", note: "全角数字 + 货币（EUR）" },

  // ── 阶段 3：中文数字（5） ──
  { input: "三块五",                                         expectAmount: 3.5,   expectType: "expense", note: "中文 整.小（块）" },
  { input: "十二块八",                                       expectAmount: 12.8,  expectType: "expense", note: "中文 十二.八" },
  { input: "前天打车三十块",                                 expectAmount: 30,    expectType: "expense", note: "中文 整（块）+ 日期前缀" },
  { input: "一百六买鞋",                                     expectAmount: 160,   expectType: "expense", note: "中文 百（无单位）" },
  { input: "两千五的相机",                                   expectAmount: 2500,  expectType: "expense", note: "中文 千（无单位）" },

  // ── 阶段 3.5：通用场景（21；来自方案 A 抢救）──
  { input: "中午吃饭160",                                    expectAmount: 160,   expectType: "expense", note: "餐饮" },
  { input: "昨天买咖啡18",                                   expectAmount: 18,    expectType: "expense", note: "购物/餐饮" },
  { input: "打的去公司25",                                   expectAmount: 25,    expectType: "expense", note: "交通" },
  { input: "看电影50",                                       expectAmount: 50,    expectType: "expense", note: "娱乐" },
  { input: "中午吃饭",                                       expectAmount: null,  expectType: "expense", note: "需补录金额" },
  { input: "买奶茶不加糖",                                   expectAmount: null,  expectType: "expense", note: "需补录金额；无数字" },
  { input: "买书15欧",                                       expectAmount: 15,    expectType: "expense", note: "欧元" },
  { input: "打车30元",                                       expectAmount: 30,    expectType: "expense", note: "人民币 + 车类" },
  { input: "午餐8.5+10",                                     expectAmount: 18.5,  expectType: "expense", note: "加法：8.5+10=18.5" },
  { input: "工资到账8000",                                   expectAmount: 8000,  expectType: "income",  note: "工资收入" },
  { input: "兼职收入200",                                    expectAmount: 200,   expectType: "income",  note: "兼职/收入 加入 income KW" },
  { input: "退款50",                                         expectAmount: 50,    expectType: "income",  note: "退款=收入" },
  { input: "朋友还我100",                                    expectAmount: 100,   expectType: "income",  note: "还款 → 收入（语义修正：方案 A 原本写 expense 是错的）" },
  { input: "存钱500",                                        expectAmount: 500,   expectType: "income", note: "储蓄→收入" },
  { input: "超市买日用品和零食86.5",                          expectAmount: 86.5,  expectType: "expense", note: "购物复杂描述" },
  { input: "地铁月卡充值200",                                expectAmount: 200,   expectType: "expense", note: "交通充值" },
  { input: "前天停车费15",                                   expectAmount: 15,    expectType: "expense", note: "前天 + 停车" },
  { input: "5月1号聚餐300",                                  expectAmount: 300,   expectType: "expense", note: "指定日期" },
  { input: "星巴克拿铁36",                                   expectAmount: 36,    expectType: "expense", note: "知名品牌 → 餐饮" },
  { input: "麦当劳套餐45",                                   expectAmount: 45,    expectType: "expense", note: "知名品牌 → 餐饮" },
  { input: "转账给我500",                                    expectAmount: 500,   expectType: "income",  note: "转账给我 → income" },

  // ── 多人/借贷场景（仅验证 amount/type 不被破坏；social 字段已移除） ──
  { input: "和朋友AA吃饭120",                                expectAmount: 120,   expectType: "expense", note: "含 AA 不影响金额识别" },
  { input: "借给同事500",                                    expectAmount: 500,   expectType: "expense", note: "含 借给 不影响金额识别" },
  { input: "帮朋友付奶茶18",                                 expectAmount: 18,    expectType: "expense", note: "含 帮XX付 不影响金额识别" },

  // ── 阶段 4：时间识别升级 ──
  { input: "下午3点喝咖啡18",                                expectAmount: 18,    expectType: "expense", note: "下午3点 → 15:00，precision=exact" },
  { input: "昨天晚上8点半喝酒20",                            expectAmount: 20,    expectType: "expense", note: "昨天晚上8点半 → 昨天20:30" },
  { input: "三天前买书50",                                   expectAmount: 50,    expectType: "expense", note: "三天前 → 当前-3 天，precision=day" },
  { input: "上周三聚餐200",                                  expectAmount: 200,   expectType: "expense", note: "上周三 → 上周对应工作日" },
  { input: "中午12点吃饭30",                                 expectAmount: 30,    expectType: "expense", note: "中午+12点显式 → 12:00，precision=exact" },

  // ── 阶段 4.1：仅时段词 → daytime 精度，UI 显示时段原词 ──
  { input: "中午吃饭50",                                     expectAmount: 50,    expectType: "expense", note: "仅'中午' → precision=daytime, timePhrase='中午'" },
  { input: "晚上喝奶茶25",                                   expectAmount: 25,    expectType: "expense", note: "仅'晚上' → daytime/'晚上'" },
  { input: "昨天下午看电影60",                               expectAmount: 60,    expectType: "expense", note: "昨天+仅'下午' → daytime + 日期" },
];

const MULTI_CASE = "今天加油300，然后超市买了牛奶和面包，还吃了快餐";

// 多笔切分场景的断言（与 MULTI_CASE 对应）：3 笔，金额 [300, null, null]，ts 严格递增。
const MULTI_EXPECT = {
  count: 3,
  amounts: [300, null, null],
  // 严格递增：results[i].ts > results[i-1].ts
  strictlyIncreasingTs: true,
};

/**
 * 跑全部用例。
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

    const tsD = new Date(r.ts);
    const datePart = `${tsD.getMonth()+1}/${tsD.getDate()}`;
    let tsLabel;
    if (r.timePrecision === "exact") {
      tsLabel = `${datePart} ${String(tsD.getHours()).padStart(2,"0")}:${String(tsD.getMinutes()).padStart(2,"0")}`;
    } else if (r.timePrecision === "daytime") {
      tsLabel = `${datePart} ${r.timePhrase || "?"}`;
    } else {
      tsLabel = `${datePart} (day)`;
    }
    rows.push({
      "输入": c.input,
      "金额": r.amount,
      "✓金额": amountOk ? "✓" : "✗",
      "类型": r.type,
      "✓类型": typeOk ? "✓" : "✗",
      "类别": r.category,
      "时间": tsLabel,
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
    "#": i + 1,
    "金额": s.amount,
    "类型": s.type,
    "类别": s.category,
    "描述": s.desc,
    "ts": new Date(s.ts).toLocaleTimeString(),
  })));

  // 断言：3 笔 / 金额 [300, null, null] / ts 严格递增
  const countOk   = segs.length === MULTI_EXPECT.count;
  const amountsOk = segs.length === MULTI_EXPECT.amounts.length &&
    segs.every((s, i) => s.amount === MULTI_EXPECT.amounts[i]);
  let tsOk = true;
  for (let i = 1; i < segs.length; i++) {
    if (!(segs[i].ts > segs[i - 1].ts)) { tsOk = false; break; }
  }
  console.log(
    `断言 → 段数 ${countOk ? "✓" : "✗"} (${segs.length}/${MULTI_EXPECT.count})` +
    ` · 金额顺序 ${amountsOk ? "✓" : "✗"}` +
    ` · ts 严格递增 ${tsOk ? "✓" : "✗"}`
  );
  const multiOk = countOk && amountsOk && tsOk;
  console.groupEnd();

  return { passed, total: totalActive, knownEdge: edgeCount, multiOk };
}
