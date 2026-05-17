// domain/learning.test.js —— learning.js 单元测试
//
// Node 端运行（无依赖）：
//   node --input-type=module -e "import('./src/domain/learning.test.js').then(m => m.runLearningTests())"
// 或者浏览器控制台：
//   import('./src/domain/learning.test.js').then(m => m.runLearningTests())

import {
  recordLearning, forgetLearning, clearLearning,
  findLearnedRule, applyLearnedRules, bumpHit,
} from "./learning.js";

let failed = 0;
let passed = 0;

function assertEq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}\n      expected ${e}\n      actual   ${a}`); }
}

function assertTrue(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

export function runLearningTests() {
  console.group("🎓 learning.js 单元测试");

  // ── recordLearning ──
  console.group("recordLearning");
  let rules = [];
  rules = recordLearning(rules, "外卖", "expense", "餐饮");
  assertEq(rules.length, 1, "首次添加 → 数组长 1");
  assertEq(rules[0].phrase, "外卖", "phrase 正确");
  assertEq(rules[0].type, "expense", "type 正确");
  assertEq(rules[0].category, "餐饮", "category 正确");
  assertEq(rules[0].hits, 1, "首次 hits=1");

  // 同 phrase + type 覆盖
  rules = recordLearning(rules, "外卖", "expense", "购物");
  assertEq(rules.length, 1, "同 (phrase,type) 不增长");
  assertEq(rules[0].category, "购物", "category 被覆盖");
  assertEq(rules[0].hits, 1, "hits 重置为 1");

  // 同 phrase 不同 type → 新条目
  rules = recordLearning(rules, "外卖", "income", "其他");
  assertEq(rules.length, 2, "同 phrase 不同 type → 新条目");

  // 短 phrase 拒收
  const before = rules.length;
  rules = recordLearning(rules, "的", "expense", "餐饮");
  assertEq(rules.length, before, "短 phrase（<2 字符）被拒");

  // 兜底 phrase "消费" 拒收
  rules = recordLearning(rules, "消费", "expense", "餐饮");
  assertEq(rules.length, before, "兜底 phrase '消费' 被拒");

  // 空/无效参数
  rules = recordLearning(rules, "", "expense", "餐饮");
  assertEq(rules.length, before, "空 phrase 被拒");
  rules = recordLearning(rules, "新词", "", "餐饮");
  assertEq(rules.length, before, "空 type 被拒");
  rules = recordLearning(rules, "新词", "expense", "");
  assertEq(rules.length, before, "空 category 被拒");

  // trim 处理
  rules = recordLearning([], "  外卖  ", "expense", "餐饮");
  assertEq(rules[0].phrase, "外卖", "trim 前后空格");

  console.groupEnd();

  // ── findLearnedRule / applyLearnedRules ──
  console.group("find/applyLearnedRules");
  const r1 = [
    { phrase: "外卖",     type: "expense", category: "餐饮",   hits: 1, lastUsed: 1 },
    { phrase: "外卖打车", type: "expense", category: "交通",   hits: 1, lastUsed: 1 },
    { phrase: "外卖",     type: "income",  category: "其他",   hits: 1, lastUsed: 1 },
    { phrase: "Starbucks", type: "expense", category: "餐饮", hits: 1, lastUsed: 1 },
  ];
  assertEq(applyLearnedRules("外卖35", "expense", r1), "餐饮", "命中 expense '外卖' → 餐饮");
  assertEq(applyLearnedRules("外卖打车30", "expense", r1), "交通", "更长 phrase 优先");
  assertEq(applyLearnedRules("外卖35", "income", r1), "其他", "type 隔离：income 走 income 的 '外卖'");
  assertEq(applyLearnedRules("我没说外卖", "income", r1), null, "无匹配 → null（income 没有匹配该文本的 phrase）");
  assertEq(applyLearnedRules("starbucks10", "expense", r1), "餐饮", "大小写不敏感");
  assertEq(applyLearnedRules("", "expense", r1), null, "空文本 → null");
  assertEq(applyLearnedRules("外卖", "expense", []), null, "空规则 → null");
  assertEq(applyLearnedRules("外卖", "expense", null), null, "null 规则 → null");
  console.groupEnd();

  // ── forgetLearning ──
  console.group("forgetLearning");
  let r2 = [
    { phrase: "外卖", type: "expense", category: "餐饮", hits: 1, lastUsed: 1 },
    { phrase: "外卖", type: "income",  category: "其他", hits: 1, lastUsed: 1 },
  ];
  r2 = forgetLearning(r2, "外卖", "expense");
  assertEq(r2.length, 1, "forgetLearning 删 expense 的，留 income 的");
  assertEq(r2[0].type, "income", "剩余条目是 income");
  console.groupEnd();

  // ── bumpHit ──
  console.group("bumpHit");
  let r3 = [{ phrase: "外卖", type: "expense", category: "餐饮", hits: 1, lastUsed: 0 }];
  r3 = bumpHit(r3, "外卖", "expense");
  assertEq(r3[0].hits, 2, "hits 从 1 → 2");
  assertTrue(r3[0].lastUsed > 0, "lastUsed 已更新");
  // 不存在的不变
  const r4 = [{ phrase: "X", type: "expense", category: "Y", hits: 5, lastUsed: 0 }];
  const r5 = bumpHit(r4, "Z", "expense");
  assertEq(r5, r4, "不存在的 phrase 不变（返回原数组）");
  console.groupEnd();

  // ── clearLearning ──
  console.group("clearLearning");
  assertEq(clearLearning(), [], "clearLearning 返回空数组");
  console.groupEnd();

  console.log(`\n通过 ${passed}/${passed+failed}` + (failed ? ` ❌` : ` ✓`));
  console.groupEnd();
  return { passed, failed };
}
