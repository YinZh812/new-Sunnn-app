// domain/categories.js —— 类别配置（默认值 + 兼容旧分类）
//
// 项目历史上有两套分类体系：
//   旧（v1）：餐饮/超市/购物/交通/运动/娱乐/医疗/生活/工资/储蓄/彩票/其他（12 个，平铺）
//   新（v2）：按类型分组 —— expense=吃/买/车/运动/其他，income=工资/现金/转账/其他，savings=储蓄/股票/资产/其他
//
// 现役 UI 用新的；分析页/历史 CSV 导入仍可能见到旧的，所以两套都保留。

export const CAT_DEFAULTS_VERSION = "2026-05-14-v3";

/**
 * 按类型分组的默认类别。手动记账面板按 mType 选取这里的列表，
 * 末尾会再追加一个"设置"按钮（UI 层负责）。
 *
 * 这是当前 UI 主用的"新分类组"。
 *
 * 2026-05-14 v3：把 v2 的"吃/买/车"三个单字名换成更通用的"餐饮/购物/交通"，
 * 让其他用户使用时不被作者的个人偏好命名困扰。版本号 bump 触发本地
 * customCategoriesByType 重置 + 已存 tx 的 category 字段一次性重命名。
 */
export const DEFAULT_CATS_BY_TYPE = {
  expense: [
    { name: "餐饮", icon: "lucide:utensils" },
    { name: "购物", icon: "lucide:shopping-bag" },
    { name: "交通", icon: "lucide:car" },
    { name: "运动", icon: "lucide:dumbbell" },
    { name: "其他", icon: "lucide:package" },
  ],
  income: [
    { name: "工资", icon: "lucide:wallet" },
    { name: "现金", icon: "lucide:gift" },
    { name: "转账", icon: "lucide:ticket" },
    { name: "其他", icon: "lucide:package" },
  ],
  savings: [
    { name: "储蓄", icon: "lucide:piggy-bank" },
    { name: "股票", icon: "lucide:gem" },
    { name: "资产", icon: "lucide:star" },
    { name: "其他", icon: "lucide:package" },
  ],
};

/** 旧版 12 类别清单，分析页着色与历史 CSV 导入用。 */
export const LEGACY_CAT_LIST = [
  "餐饮","超市","购物","交通","运动","娱乐","医疗","生活","工资","储蓄","彩票","其他",
];

/** 旧分类 → Lucide 图标名（含 v2→v3 重命名前的旧名兜底，确保历史 tx 仍能正确显示图标） */
export const LEGACY_CAT_LUCIDE = {
  "餐饮":"utensils","超市":"store","购物":"shopping-bag","交通":"car",
  "运动":"dumbbell","娱乐":"film","医疗":"heart-pulse","生活":"home",
  "工资":"wallet","储蓄":"piggy-bank","彩票":"ticket","其他":"package",
  // v2 旧默认名（已被 v3 重命名替换；保留以兼容历史 tx / 用户旧 customCategories）
  "吃":"utensils","买":"shopping-bag","车":"car",
  "玩":"gamepad-2",
};

// ── v2 → v3 重命名映射（用于已存 tx 迁移） ─────────────────────────────────
//
// 这次重命名是因为单字名"吃/买/车"是作者个人偏好，对其他人不友好。
// migrateLegacyTxCategoryNames 在 store.hydrate 里调一次，把已存 tx 的
// category 字段全局替换。一次性副作用，幂等。

export const CATEGORY_RENAME_V3 = Object.freeze({
  "吃": "餐饮",
  "买": "购物",
  "车": "交通",
});

/**
 * 把 tx 数组里旧名 category 替换成新名。返回 { changed, txs }。
 * @param {Array} txs
 */
export function migrateLegacyTxCategoryNames(txs) {
  if (!Array.isArray(txs) || txs.length === 0) return { changed: false, txs };
  let changed = false;
  const out = txs.map((t) => {
    if (t && t.category && CATEGORY_RENAME_V3[t.category]) {
      changed = true;
      return { ...t, category: CATEGORY_RENAME_V3[t.category] };
    }
    return t;
  });
  return { changed, txs: out };
}

/** 旧分类 → 着色（分析页饼图、排行榜进度条） */
export const LEGACY_CAT_COLOR = {
  "餐饮":"#E8845A","超市":"#5BAF72","购物":"#6B8FD4","交通":"#D4A843",
  "运动":"#7B6BD4","娱乐":"#D46B8F","医疗":"#54B8C8","生活":"#8B8B8B",
  "彩票":"#C8A854","其他":"#AAAAAA",
};

/**
 * 取某类型的默认类别清单（深拷贝，避免外部修改）。
 * @param {"expense"|"income"|"savings"} type
 */
export function getDefaultCatsByType(type) {
  const t = type || "expense";
  return (DEFAULT_CATS_BY_TYPE[t] || DEFAULT_CATS_BY_TYPE.expense).map((c) => ({ ...c }));
}

// ── 类别图标查找 ────────────────────────────────────────────────────────────

import { renderIcon, lucideSvg } from "../utils/icons.js";

/**
 * 找出类别名对应的 SVG 图标字串。
 * 查找顺序：① customCategoriesByType（用户自定义） ② LEGACY_CAT_LUCIDE → lucide ③ "📦" 兜底
 *
 * 与原 inline getCatIcon(name) 行为一致。
 *
 * @param {string} name 类别名
 * @param {{expense:Array,income:Array,savings:Array}} customByType
 * @param {Object} [opts]
 * @param {number} [opts.size=22]
 * @param {number} [opts.strokeWidth=1.6]
 * @returns {string}
 */
export function getCategoryIcon(name, customByType, opts = {}) {
  const size = opts.size ?? 22;
  const sw   = opts.strokeWidth ?? 1.6;

  // ① 自定义优先
  if (customByType) {
    for (const list of [customByType.expense, customByType.income, customByType.savings]) {
      if (!Array.isArray(list)) continue;
      for (const c of list) {
        if (c && c.name === name) return renderIcon(c.icon, size, sw);
      }
    }
  }
  // ② 旧 LEGACY 类别
  const lucideName = LEGACY_CAT_LUCIDE[name];
  if (lucideName) return lucideSvg(lucideName, size, sw);
  // ③ 兜底
  return "📦";
}
