// ui/components/swipe.js —— 列表手势：边缘换月 + 单行左滑删除
//
// 两套独立机制：
//   1. attachListEdgeMonthSwipe(list)
//      列表滚到顶/底再下/上拉 → 切换月份。带视觉指示器 + 阻尼回弹。
//      防重复绑定（通过 dataset.edgeBound 标记）。
//
//   2. attachRowSwipeDelete(row, callbacks)
//      单行左滑露出删除按钮。同时只允许一行打开（自动收起其他）。
//
// 都不直接操作 store —— 通过 callbacks 把"换月" / "确认删除"反向通知到调用方。

const SWIPE_DEL_MAX     = 120;
const SWIPE_ACTIVATE_PX = 10;
const SWIPE_SNAP_HALF   = 40;

// ── 1. 列表边缘换月 ──────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} list 滚动容器
 * @param {Object} cb
 * @param {() => boolean} cb.canGoNext  能否切到下个月（一般校验是否有未来记录）
 * @param {(step: 1|-1) => void} cb.onChange  step=1 下个月、step=-1 上个月
 * @param {(msg: string) => void} [cb.onBlocked]  禁止时的提示文字回调（"还没有未来记录"）
 */
export function attachListEdgeMonthSwipe(list, cb) {
  if (!list || list.dataset.edgeBound === "true") return;
  list.dataset.edgeBound = "true";

  let startY = 0, currentY = 0, isEdgeDrag = false, edgeDir = 0;
  let edgeTop = null, edgeBot = null;
  let atTop = false, atBot = false;

  const ensureIndicators = () => {
    if (!edgeTop) {
      edgeTop = document.createElement("div");
      edgeTop.className = "list-edge-indicator top";
      edgeTop.textContent = "▼ 下个月";
      list.appendChild(edgeTop);
    }
    if (!edgeBot) {
      edgeBot = document.createElement("div");
      edgeBot.className = "list-edge-indicator bottom";
      edgeBot.textContent = "▲ 上个月";
      list.appendChild(edgeBot);
    }
  };

  const removeIndicators = () => {
    if (edgeTop) { edgeTop.remove(); edgeTop = null; }
    if (edgeBot) { edgeBot.remove(); edgeBot = null; }
  };

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    atTop = list.scrollTop <= 1;
    atBot = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
    if (!atTop && !atBot) {
      isEdgeDrag = false; edgeDir = 0; removeIndicators();
      return;
    }
    isEdgeDrag = true; edgeDir = 0;
    startY = e.touches[0].clientY;
    currentY = startY;
  };

  const onTouchMove = (e) => {
    if (!isEdgeDrag) return;
    currentY = e.touches[0].clientY;
    let dy = currentY - startY;

    if (edgeDir === 0) {
      if (Math.abs(dy) < 5) return;
      if (dy > 0 && atTop) edgeDir = -1;
      else if (dy < 0 && atBot) edgeDir = 1;
      else { isEdgeDrag = false; return; }

      ensureIndicators();
      (edgeDir === -1 ? edgeTop : edgeBot).classList.add("show");
    }

    if ((edgeDir === -1 && dy < 0) || (edgeDir === 1 && dy > 0)) dy *= 0.3;
    const clamped = Math.max(-80, Math.min(80, Math.abs(dy))) * Math.sign(dy);
    const target = edgeDir === -1 ? edgeTop : edgeBot;
    if (target) {
      target.style.transform = `translate(-50%, ${clamped * 0.5}px)`;
      target.style.opacity   = Math.min(1, Math.abs(clamped) / 30);
    }
    if (Math.abs(dy) > SWIPE_ACTIVATE_PX && e.cancelable) e.preventDefault();
  };

  const onTouchEnd = (e) => {
    if (!isEdgeDrag) return;
    isEdgeDrag = false;
    if (edgeDir === 0) return;

    const finalY = e.changedTouches ? e.changedTouches[0].clientY : currentY;
    const dy = finalY - startY;

    if (Math.abs(dy) > 40) {
      let step = 0;
      if (edgeDir === -1 && dy > 0) step = 1;
      else if (edgeDir === 1 && dy < 0) step = -1;

      if (step === 1) {
        if (cb.canGoNext && !cb.canGoNext()) {
          if (cb.onBlocked) cb.onBlocked("还没有未来记录");
          removeIndicators(); edgeDir = 0;
          return;
        }
      }
      if (step !== 0) cb.onChange(step);
    }
    removeIndicators();
    edgeDir = 0;
  };

  list.addEventListener("touchstart", onTouchStart, { passive: true });
  list.addEventListener("touchmove",  onTouchMove,  { passive: false });
  list.addEventListener("touchend",   onTouchEnd);
}

// ── 2. 单行左滑删除 ──────────────────────────────────────────────────────────

let _openRow = null;

/** 关掉除 keep 之外的所有左滑行。 */
export function closeOtherRowSwipes(keep) {
  if (!_openRow || _openRow === keep) return;
  const prev = _openRow;
  const c = prev.querySelector(".ti-content");
  if (c) {
    c.style.transition = "transform .45s cubic-bezier(0.25, 1, 0.5, 1)";
    c.style.transform  = "translateX(0)";
  }
  prev.classList.remove("is-open", "is-sliding");
  _openRow = null;
}

/** 全部收起。 */
export const resetAllRowSwipes = () => closeOtherRowSwipes(null);

/**
 * 给单行交易绑定左滑删除手势 + 内容点击分发。
 *
 * @param {HTMLElement} row .ti 元素
 * @param {Object} cb
 * @param {(idx:number) => void} [cb.onIconTap]  点击类别图标
 * @param {(idx:number, row:HTMLElement) => void} [cb.onDescTap]  点击描述
 * @param {(idx:number, row:HTMLElement) => void} [cb.onAmountTap]  点击金额
 * @param {(idx:number) => void} [cb.onDeleteTap]  点击删除按钮
 */
export function attachRowSwipeDelete(row, cb = {}) {
  const content = row.querySelector(".ti-content");
  const delBtn  = row.querySelector(".ti-delete-btn");
  if (!content) return;

  let startX = 0, startY = 0, currentX = 0;
  let isSliding = false, isOpen = false;

  row.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    content.style.transition = "none";
    isSliding = false;
  }, { passive: true });

  row.addEventListener("touchmove", (e) => {
    const dX = e.touches[0].clientX - startX;
    const dY = e.touches[0].clientY - startY;
    if (!isSliding && Math.abs(dX) > 15 && Math.abs(dX) > Math.abs(dY)) {
      isSliding = true;
      row.classList.add("is-sliding");
      if (dX < 0) closeOtherRowSwipes(row);
    }
    if (isSliding) {
      let baseMove = isOpen ? dX - 80 : dX;
      let raw = Math.min(0, Math.max(-SWIPE_DEL_MAX - 40, baseMove));
      if (raw < -80) raw = -80 + (raw + 80) * 0.25;
      currentX = raw;
      content.style.transform = `translateX(${currentX}px)`;
      const btnW = Math.max(60, Math.min(120, Math.abs(currentX) + 20));
      if (delBtn) delBtn.style.width = `${btnW}px`;
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  row.addEventListener("touchend", () => {
    content.style.transition = "transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)";
    row.classList.remove("is-sliding");
    if (!isSliding) return;
    if (currentX < -SWIPE_SNAP_HALF) {
      content.style.transform = "translateX(-80px)";
      row.classList.add("is-open");
      isOpen = true;
      _openRow = row;
      if (delBtn) delBtn.style.width = "80px";
    } else {
      content.style.transform = "translateX(0)";
      row.classList.remove("is-open");
      isOpen = false;
      if (_openRow === row) _openRow = null;
      if (delBtn) delBtn.style.width = "80px";
    }
    setTimeout(() => { isSliding = false; }, 100);
  });

  content.onclick = (e) => {
    if (isSliding) return;
    if (isOpen) {
      content.style.transform = "translateX(0)";
      row.classList.remove("is-open");
      isOpen = false;
      if (delBtn) delBtn.style.width = "80px";
      return;
    }
    const idx = parseInt(row.getAttribute("data-idx"));
    if (e.target.closest(".tic")) cb.onIconTap?.(idx);
    else if (e.target.closest(".tid")) cb.onDescTap?.(idx, row);
    else if (e.target.closest(".tia")) cb.onAmountTap?.(idx, row);
  };

  if (delBtn) {
    delBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const idx = parseInt(row.getAttribute("data-idx"));
      cb.onDeleteTap?.(idx);
    };
  }
}
