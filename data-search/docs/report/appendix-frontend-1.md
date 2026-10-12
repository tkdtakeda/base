## 付録：画面側の修正ファイルの全文（1/4）

`src/css/components.css`

```css
/* =========================================================
   部品：ボタン・切り替え・入力・札・通知・パネルの中身・説明書
   値はすべてトークン（tokens.css）を参照する。
   ========================================================= */

/* ── 反映の合図 ── */
@keyframes flash {
  0% { background-color: var(--color-flash); }
  100% { background-color: transparent; }
}

.is-flash {
  animation: flash var(--dur-flash) var(--ease);
}

.muted {
  color: var(--color-text-subtle);
}

/* ── ボタン ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  height: var(--h-control);
  padding: 0 var(--sp-4);
  border: var(--bw) solid transparent;
  border-radius: var(--r-md);
  font-weight: var(--fw-bold);
  white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}

.btn--sm {
  height: var(--h-control-sm);
  padding: 0 var(--sp-3);
  font-size: var(--fs-sm);
}

.btn--lg {
  height: var(--h-control-lg);
  padding: 0 var(--sp-5);
}

.btn--block {
  width: 100%;
}

.btn--primary {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn--primary:active:not(:disabled) {
  background: var(--color-primary-active);
}

.btn--primary:disabled {
  background: var(--color-surface-sunken);
  color: var(--color-text-subtle);
  border-color: var(--color-border);
}

.btn--secondary {
  background: var(--color-surface);
  border-color: var(--color-primary-border);
  color: var(--color-primary);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--color-primary-soft);
}

.btn--secondary:disabled,
.btn--ghost:disabled,
.btn--danger-ghost:disabled {
  color: var(--color-text-subtle);
  border-color: var(--color-border);
  background: var(--color-surface-alt);
}

.btn--ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--color-surface-sunken);
}

.btn--danger-ghost {
  background: transparent;
  border-color: var(--color-border-strong);
  color: var(--color-danger);
}

.btn--danger-ghost:hover:not(:disabled) {
  background: var(--color-danger-bg);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--h-control-sm);
  height: var(--h-control-sm);
  padding: 0;
  border: var(--bw) solid transparent;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--color-text-muted);
}

.icon-btn:hover:not(:disabled) {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}

.icon-btn:disabled {
  color: var(--color-border-strong);
}

/* ── 切り替え（セグメント） ── */
.seg {
  display: inline-flex;
  flex-shrink: 0;
  padding: 2px;
  border-radius: var(--r-md);
  background: var(--color-surface-sunken);
}

.seg__item {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  height: calc(var(--h-control-lg) - 4px);
  padding: 0 var(--sp-3);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--color-text-muted);
  white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}

.seg__item:hover {
  color: var(--color-text);
}

.seg__item[aria-checked="true"] {
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: var(--fw-bold);
  box-shadow: var(--shadow-1);
}

.seg--compact .seg__item {
  padding: 0 var(--sp-2);
  font-size: var(--fs-sm);
}

/* ── 入力 ── */
.input {
  height: var(--h-control);
  padding: 0 var(--sp-3);
  border: var(--bw) solid var(--color-border-strong);
  border-radius: var(--r-md);
  background: var(--color-surface);
}

.input--sm {
  height: var(--h-control-sm);
  font-size: var(--fs-sm);
  width: 100%;
}

.input:focus {
  border-color: var(--color-focus);
  outline: none;
  box-shadow: 0 0 0 var(--bw-strong) var(--color-primary-soft-strong);
}

.check-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-1) var(--sp-2);
}

.check {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-sm);
  cursor: pointer;
}

.check:hover {
  background: var(--color-surface-sunken);
}

.check input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-primary);
}

/* ── 札（状態） ── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 0 var(--sp-2);
  border-radius: var(--r-pill);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  line-height: 1.8;
  white-space: nowrap;
}

.badge--success { background: var(--color-success-bg); color: var(--color-success); }
.badge--warning { background: var(--color-warning-bg); color: var(--color-warning); }
.badge--danger { background: var(--color-danger-bg); color: var(--color-danger); }
.badge--info { background: var(--color-info-bg); color: var(--color-info); }
.badge--neutral { background: var(--color-neutral-bg); color: var(--color-neutral); }

/* ── チップ（上部バー右） ── */
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--h-control);
  padding: 0 var(--sp-3);
  border: var(--bw) solid var(--color-border);
  border-radius: var(--r-pill);
  background: var(--color-surface);
  font-size: var(--fs-sm);
  white-space: nowrap;
}

.chip--mode-mock { background: var(--color-mode-mock-bg); border-color: transparent; color: var(--color-mode-mock); font-weight: var(--fw-bold); }
.chip--mode-http,
.chip--mode-tauri { background: var(--color-primary-soft); border-color: transparent; color: var(--color-primary); font-weight: var(--fw-bold); }

.chip--status { cursor: pointer; }
.chip--status:hover { border-color: var(--color-border-strong); }
.chip__text { font-weight: var(--fw-bold); }
.chip__sub { color: var(--color-text-muted); }
.chip--success .chip__icon { color: var(--color-success); }
.chip--warning { background: var(--color-warning-bg); }
.chip--warning .chip__icon,
.chip--warning .chip__text { color: var(--color-warning); }
.chip--danger { background: var(--color-danger-bg); }
.chip--danger .chip__icon,
.chip--danger .chip__text { color: var(--color-danger); }
.chip--info .chip__icon { color: var(--color-info); }
.chip--neutral .chip__icon { color: var(--color-neutral); }

/* ── 通知 ── */
.toast-host {
  position: fixed;
  right: var(--sp-5);
  bottom: var(--sp-5);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: var(--w-toast);
  max-width: calc(100vw - 2 * var(--sp-5));
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
  border-left: var(--bw-bar) solid var(--color-info);
  border-radius: var(--r-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
  animation: toast-in var(--dur-base) var(--ease);
  transition: opacity var(--dur-base) var(--ease);
}

.toast.is-leaving { opacity: 0; }
.toast--success { border-left-color: var(--color-success); }
.toast--success .toast__icon { color: var(--color-success); }
.toast--warning { border-left-color: var(--color-warning); }
.toast--warning .toast__icon { color: var(--color-warning); }
.toast--danger { border-left-color: var(--color-danger); }
.toast--danger .toast__icon { color: var(--color-danger); }
.toast--info .toast__icon { color: var(--color-info); }

.toast__icon { font-size: var(--fs-lg); line-height: var(--lh-base); }
.toast__body { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.toast__detail { color: var(--color-text-subtle); font-size: var(--fs-xs); }

.toast__action {
  flex-shrink: 0;
  height: var(--h-control-sm);
  padding: 0 var(--sp-3);
  border: var(--bw) solid var(--color-primary-border);
  border-radius: var(--r-md);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: var(--fw-bold);
}

.toast__close {
  flex-shrink: 0;
  width: var(--h-control-sm);
  height: var(--h-control-sm);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--color-text-subtle);
}

.toast__close:hover { background: var(--color-surface-sunken); }

/* ── パネルの中身 ── */
.pane-section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) 0;
  border-top: var(--bw) solid var(--color-border);
}

.pane-section--end { margin-top: var(--sp-2); }

.pane-section__title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  color: var(--color-text-muted);
}

.pane-note {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: var(--lh-base);
}

.status-card {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--r-md);
  background: var(--color-neutral-bg);
}

.status-card__icon { font-size: var(--fs-xl); line-height: 1.2; color: var(--color-neutral); }
.status-card__title { display: block; }
.status-card__text { font-size: var(--fs-sm); color: var(--color-text-muted); }
.status-card--success { background: var(--color-success-bg); }
.status-card--success .status-card__icon,
.status-card--success .status-card__title { color: var(--color-success); }
.status-card--warning { background: var(--color-warning-bg); }
.status-card--warning .status-card__icon,
.status-card--warning .status-card__title { color: var(--color-warning); }
.status-card--danger { background: var(--color-danger-bg); }
.status-card--danger .status-card__icon,
.status-card--danger .status-card__title { color: var(--color-danger); }
.status-card--info { background: var(--color-info-bg); }
.status-card--info .status-card__icon,
.status-card--info .status-card__title { color: var(--color-info); }

.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-1) var(--sp-3);
  font-size: var(--fs-sm);
}

.facts dt { color: var(--color-text-muted); white-space: nowrap; }
.facts dd { min-width: 0; overflow-wrap: anywhere; }
.facts .is-warning { color: var(--color-warning); }

.sample-list { display: flex; flex-direction: column; gap: var(--sp-2); }

.sample {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: var(--sp-2);
  padding: var(--sp-2);
  border: var(--bw) solid var(--color-border);
  border-radius: var(--r-md);
  background: var(--color-surface);
}

.sample.is-loaded { border-color: var(--color-primary-border); background: var(--color-primary-soft); }
.sample__icon { width: 20px; color: var(--color-primary); text-align: center; line-height: var(--lh-base); }
.sample__body { display: flex; flex-direction: column; min-width: 0; }
.sample__title { font-size: var(--fs-md); }
.sample__desc { font-size: var(--fs-sm); color: var(--color-text-muted); }
.sample__meta { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3); font-size: var(--fs-xs); color: var(--color-text-subtle); }
.sample__state { display: inline-flex; gap: var(--sp-1); color: var(--color-success); font-weight: var(--fw-bold); }

.inline-note {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  background: var(--color-info-bg);
  color: var(--color-info);
  font-size: var(--fs-sm);
}

.inline-note--warning { background: var(--color-warning-bg); color: var(--color-warning); }
.inline-note--danger { background: var(--color-danger-bg); color: var(--color-danger); }

.copy-btn {
  margin-left: var(--sp-1);
  padding: 0 var(--sp-1);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--color-text-subtle);
}

.copy-btn:hover { background: var(--color-surface-sunken); color: var(--color-primary); }
.copy-btn.is-done { color: var(--color-success); }

/* ── 取扱説明書（背景を覆わない窓） ── */
.manual {
  position: fixed;
  right: var(--sp-5);
  bottom: var(--sp-5);
  z-index: var(--z-manual);
  display: flex;
  flex-direction: column;
  width: var(--w-manual);
  max-width: calc(100vw - 2 * var(--sp-5));
  height: var(--h-manual);
  max-height: calc(100dvh - 2 * var(--sp-5));
  border: var(--bw) solid var(--color-border);
  border-radius: var(--r-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}

.manual__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-4);
  border-bottom: var(--bw) solid var(--color-border);
}

.manual__title { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-lg); color: var(--color-primary); }
.manual__main { display: grid; grid-template-columns: 200px 1fr; min-height: 0; flex: 1; }
.manual__side { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); border-right: var(--bw) solid var(--color-border); overflow: auto; background: var(--color-surface-alt); }
.manual__toc { display: flex; flex-direction: column; }
.manual__group { margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--color-text-subtle); }

.manual__link {
  padding: var(--sp-1) var(--sp-2);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
}

.manual__link:hover { background: var(--color-surface-sunken); }
.manual__link.is-active { background: var(--color-primary-soft); color: var(--color-primary); font-weight: var(--fw-bold); }
.manual__content { padding: var(--sp-4) var(--sp-5); overflow: auto; }
.manual__content p,
.manual__content ul,
.manual__content ol,
.manual__content table { margin: 0 0 var(--sp-3); }
.manual__content ul,
.manual__content ol { padding-left: var(--sp-5); list-style: revert; }
.manual__content li { margin-bottom: var(--sp-1); }
.manual__chapter { margin-bottom: var(--sp-3); font-size: var(--fs-xl); }
.manual-table { border-collapse: collapse; font-size: var(--fs-sm); }
.manual-table th,
.manual-table td { padding: var(--sp-1) var(--sp-3); border: var(--bw) solid var(--color-border); text-align: left; }
.manual-table th { background: var(--color-surface-alt); }
.manual-icon { font-family: var(--font-mono); color: var(--color-primary); }

/* ── 設定の注意（データのパネル） ── */
.config-help__item { padding: var(--sp-2); border-left: var(--bw-bar) solid var(--color-warning); border-radius: var(--r-sm); background: var(--color-warning-bg); }
.config-help__where { font-size: var(--fs-xs); font-weight: var(--fw-bold); color: var(--color-warning); overflow-wrap: anywhere; }

/* ── 読み込み先（データ パネル） ── */
.source { display: flex; flex-direction: column; gap: var(--sp-2); }
.source__path { margin: 0; font-size: var(--fs-sm); word-break: break-all; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-sm); background: var(--color-surface-sunken); }
.source__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.source__actions[hidden], .source__edit[hidden] { display: none; }
.source__edit { display: flex; flex-direction: column; gap: var(--sp-2); }
.source__input { width: 100%; }
.pane-note.is-warning { color: var(--color-warning); }
.source-result.is-stale { opacity: 0.5; }
.source-result__summary { margin: 0 0 var(--sp-1); font-weight: 600; font-size: var(--fs-sm); }
.source-result__summary.is-ok { color: var(--color-success); }
.source-result__summary.is-ng { color: var(--color-danger); }
.source-result__summary.is-warn { color: var(--color-warning); }
.source-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
.source-step { display: grid; grid-template-columns: 1.4em 1fr; gap: var(--sp-1); font-size: var(--fs-sm); }
.source-step__mark { line-height: 1.5; }
.source-step--ok .source-step__mark { color: var(--color-success); }
.source-step--ng .source-step__mark { color: var(--color-danger); }
.source-step--warn .source-step__mark,
.source-step--warn .source-step__action { color: var(--color-warning); }
.source-step--skip { color: var(--color-text-muted); }
.source-step__label { display: block; }
.source-step__text, .source-step__action { margin: 0; }
.source-step--ng .source-step__action { color: var(--color-danger); }

/* ── 1 件を決める列（データ パネル） ── */
.record-key { display: flex; flex-direction: column; gap: var(--sp-2); border-radius: var(--r-sm); }
.record-key__current { display: flex; flex-direction: column; gap: var(--sp-1); }
.record-key__missing { display: flex; align-items: baseline; gap: var(--sp-2); margin: 0; color: var(--color-danger); font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.key-chips { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.key-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  max-width: 100%;
  padding: 2px var(--sp-2);
  border: var(--bw) solid var(--color-primary-border);
  border-radius: var(--r-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.record-key__slots { display: flex; flex-direction: column; gap: var(--sp-1); margin: 0; padding-left: var(--sp-5); }
.record-key__slots .input { width: 100%; }
.record-key__search { display: flex; flex-direction: column; gap: 2px; }
.record-key__search .input { width: 100%; }
.pane-section.is-alert { padding: var(--sp-2); border-left: var(--bw-bar) solid var(--color-danger); border-radius: var(--r-sm); background: var(--color-danger-bg); }
```

`src/css/layout.css`

```css
/* =========================================================
   画面の領域：上部バー・アイコン列・脇のパネル・検索結果・詳細
   ========================================================= */

/* ── 上部バー ── */
.topbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--sp-4);
  padding: var(--sp-2) var(--sp-4) var(--sp-1);
  border-bottom: var(--bw) solid var(--color-border);
  background: var(--color-surface);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--h-control-lg);
}

.brand__icon { color: var(--color-primary); font-size: var(--fs-xl); }
.brand__name { font-size: var(--fs-lg); white-space: nowrap; }
.brand__version { color: var(--color-text-subtle); font-size: var(--fs-xs); }

.topbar__status {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--h-control-lg);
}

.search { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.search__row { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }

.search__box {
  position: relative;
  display: flex;
  flex: 1 1 var(--w-input-search);
  align-items: center;
  min-width: 200px;
}

.search__icon {
  position: absolute;
  left: var(--sp-3);
  color: var(--color-text-subtle);
  pointer-events: none;
}

.search__input {
  width: 100%;
  height: var(--h-control-lg);
  padding: 0 calc(var(--sp-8) + var(--sp-1)) 0 calc(var(--sp-8) + var(--sp-1));
  border: var(--bw-strong) solid var(--color-border-strong);
  border-radius: var(--r-md);
  background: var(--color-surface);
  font-size: var(--fs-lg);
}

.search__input:focus {
  border-color: var(--color-focus);
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-soft-strong);
}

.search__input::placeholder { color: var(--color-text-subtle); font-family: var(--font-sans); font-size: var(--fs-md); }
.search__input::-webkit-calendar-picker-indicator { display: none !important; }

.search__clear {
  position: absolute;
  right: var(--sp-2);
  width: var(--h-control-sm);
  height: var(--h-control-sm);
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--color-text-subtle);
}

.search__clear:hover { background: var(--color-surface-sunken); color: var(--color-text); }
.cta { flex-shrink: 0; min-width: 132px; }
.cta.is-busy { opacity: 0.85; }

.search__hint {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 20px;
  padding-left: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
}

.search__hint.is-blocked { color: var(--color-primary); font-weight: var(--fw-bold); }
.search__sep { color: var(--color-border-strong); }

/* ── アイコン列 ── */
.rail {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--sp-2) 0;
  border-right: var(--bw) solid var(--color-border);
  background: var(--color-surface);
}

.rail__group { display: flex; flex-direction: column; align-items: center; gap: var(--sp-1); }

.rail__btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: calc(var(--w-rail) - var(--sp-2));
  padding: var(--sp-2) 0;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--icon-rail);
}

.rail__btn:hover { background: var(--color-surface-sunken); color: var(--color-text); }

.rail__btn.is-active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.rail__btn.is-active::before {
  content: "";
  position: absolute;
  left: calc(-1 * var(--sp-1));
  top: var(--sp-2);
  bottom: var(--sp-2);
  width: var(--bw-bar);
  border-radius: var(--r-pill);
  background: var(--color-primary);
}

.rail__label { font-size: var(--fs-xs); line-height: 1.2; }

.rail__badge {
  position: absolute;
  top: 2px;
  right: var(--sp-2);
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: var(--r-pill);
  font-size: 10px;
  font-weight: var(--fw-bold);
  line-height: 16px;
  color: var(--color-text-inverse);
  background: var(--color-info);
}

.rail__badge--warning { background: var(--color-warning); }
.rail__badge--danger { background: var(--color-danger); }

/* ── 脇のパネル ── */
.sidepanel {
  display: flex;
  flex-direction: column;
  width: var(--w-sidepanel);
  min-height: 0;
  border-right: var(--bw) solid var(--color-border);
  background: var(--color-surface-alt);
  animation: panel-in var(--dur-base) var(--ease);
}

@keyframes panel-in {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: none; }
}

.sidepanel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-3) var(--sp-2) var(--sp-4);
}

.sidepanel__title { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-md); color: var(--color-primary); }
.sidepanel__body { flex: 1; min-height: 0; padding: 0 var(--sp-4) var(--sp-4); overflow: auto; }

/* ── 検索結果 ── */
.results {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--color-surface);
}

.results__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  min-height: 44px;
  padding: var(--sp-2) var(--sp-4);
  border-bottom: var(--bw) solid var(--color-border);
}

.results__summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2) var(--sp-3); min-width: 0; }
.results__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--fw-bold); }
.results__count { padding: 0 var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-lg); color: var(--color-primary); }

.pager { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; font-size: var(--fs-sm); color: var(--color-text-muted); }
.results__body { position: relative; min-height: 0; display: grid; }

.table-wrap {
  min-height: 0;
  overflow: auto;
  transition: opacity var(--dur-base) var(--ease);
}

.results.is-loading .table-wrap { opacity: 0.45; }

.grid {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--fs-md);
}

.grid thead th {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  padding: 0;
  border-bottom: var(--bw) solid var(--color-border-strong);
  background: var(--color-surface-alt);
  text-align: left;
}

.grid thead th.is-searched { background: var(--color-primary-soft); }

.th-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  width: 100%;
  height: var(--h-row);
  padding: 0 var(--sp-3);
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}

.th-btn:hover { color: var(--color-text); background: var(--color-surface-sunken); }
.th-btn__icon { color: var(--color-border-strong); }
.th-btn__icon.is-active { color: var(--color-primary); }

.grid tbody td {
  height: var(--h-row);
  padding: 0 var(--sp-3);
  border-bottom: var(--bw) solid var(--color-border);
  white-space: nowrap;
}

.grid tbody td.is-searched { background: var(--color-surface-alt); }
.grid tbody tr { cursor: pointer; }
.grid tbody tr:hover td { background: var(--color-row-hover); }
.grid tbody tr.is-selected td { background: var(--color-row-selected); }
.grid tbody tr.is-selected td:first-child { box-shadow: inset var(--bw-bar) 0 0 var(--color-row-selected-bar); }

.grid mark {
  padding: 0 1px;
  border-radius: 2px;
  background: var(--color-highlight-bg);
  color: var(--color-highlight-text);
  text-decoration: underline;
  text-decoration-color: var(--color-warning);
  text-underline-offset: 3px;
}

.results__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-height: 30px;
  padding: var(--sp-1) var(--sp-4);
  border-top: var(--bw) solid var(--color-border);
  background: var(--color-surface-alt);
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}

.results__foot .is-warning { color: var(--color-warning); font-weight: var(--fw-bold); }
.results__sep { color: var(--color-border-strong); }

/* ── 空のときの案内 ── */
.empty { display: grid; place-items: center; padding: var(--sp-6); overflow: auto; }

.empty__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  max-width: 560px;
  text-align: center;
}

.empty__icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--r-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--fs-2xl);
}

.empty__title { font-size: var(--fs-xl); }
.empty__text { color: var(--color-text-muted); }
.empty__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--sp-2); }

.steps {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  counter-reset: step;
  list-style: none;
  text-align: left;
}

.steps li {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  counter-increment: step;
}

.steps li::before {
  content: counter(step);
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-right: var(--sp-2);
  border-radius: var(--r-pill);
  background: var(--color-primary);
  color: var(--color-text-inverse);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}

/* ── 詳細 ── */
.detail {
  display: flex;
  flex-direction: column;
  width: var(--w-detail);
  min-height: 0;
  border-left: var(--bw) solid var(--color-border);
  background: var(--color-surface-alt);
  animation: detail-in var(--dur-base) var(--ease);
}

@keyframes detail-in {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: none; }
}

.detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
  border-bottom: var(--bw) solid var(--color-border);
  background: var(--color-surface);
}

.detail__title { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-1); min-width: 0; border-radius: var(--r-sm); }
.detail__label { font-size: var(--fs-xs); color: var(--color-text-subtle); }
.detail__lot { font-size: var(--fs-xl); line-height: var(--lh-tight); overflow-wrap: anywhere; }
.detail__notice { display: flex; flex-direction: column; gap: var(--sp-2); padding: 0 var(--sp-4); }
.detail__notice:not(:empty) { padding-top: var(--sp-3); }
.detail__body { flex: 1; min-height: 0; padding: var(--sp-2) var(--sp-4) var(--sp-4); overflow: auto; }
.detail__group { padding: var(--sp-3) 0; border-bottom: var(--bw) solid var(--color-border); }
.detail__group:last-child { border-bottom: 0; }
.detail__group-title { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); font-size: var(--fs-sm); color: var(--color-primary); }
.facts--detail { font-size: var(--fs-md); row-gap: var(--sp-2); }
.facts--detail dd { display: flex; align-items: center; }

/* ── 画面が狭いとき：説明の文字を省き、詳細を細くする ── */
@media (max-width: 1440px) {
  .brand__version { display: none; }
  .chip__sub { display: none; }
}

@media (max-width: 1280px) {
  :root { --w-detail: 320px; --w-sidepanel: 280px; }
  .brand__name { display: none; }
}

/* ── 起動できないとき ── */
.fatal { max-width: 640px; margin: 15vh auto 0; padding: var(--sp-6); text-align: center; }
.fatal__title { margin-bottom: var(--sp-3); font-size: var(--fs-xl); color: var(--color-danger); }
.fatal__text { color: var(--color-text-muted); }
.fatal__id { margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--color-text-subtle); }

/* ── 詳細：鍵の 2 つ目以降・開閉できるまとまり ── */
.detail__subkeys { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3); font-size: var(--fs-md); }
.detail__group > summary { cursor: pointer; list-style: none; user-select: none; }
.detail__group > summary::-webkit-details-marker { display: none; }
.detail__chevron { width: 12px; color: var(--color-text-subtle); transition: transform var(--dur-fast) var(--ease); }
.detail__group[open] .detail__chevron { transform: rotate(90deg); }
.detail__group:not([open]) > summary { margin-bottom: 0; }
.detail__count { margin-left: auto; padding: 0 var(--sp-2); border-radius: var(--r-pill); background: var(--color-surface-sunken); color: var(--color-text-muted); font-size: var(--fs-xs); font-weight: var(--fw-normal); }

/* ── 探す列（上部バーの左。押すと「1 件を決める列」で変えられる） ── */
.search__column {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--sp-2);
  max-width: 14em;
  height: var(--h-control-lg);
  padding: 0 var(--sp-3);
  border: var(--bw) solid var(--color-primary-border);
  border-radius: var(--r-md);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: var(--fw-bold);
}
.search__column:hover { background: var(--color-primary-soft-strong); }
.search__column-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search__column.is-missing { border-color: var(--color-danger); background: var(--color-danger-bg); color: var(--color-danger); }
.search__input:disabled { background: var(--color-surface-sunken); cursor: not-allowed; }

/* ── 全列の一覧：道具・左端の固定・列幅・行の高さ ── */
.grid-tools { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; }
.grid-tools__find { display: inline-flex; align-items: center; gap: var(--sp-1); color: var(--color-text-muted); }
.grid-tools__finder { width: 14em; }
.grid th, .grid tbody td { max-width: 320px; }
.grid tbody td { overflow: hidden; text-overflow: ellipsis; }
.th-btn__text { overflow: hidden; text-overflow: ellipsis; }
.grid th.is-pinned, .grid td.is-pinned { position: sticky; left: 0; z-index: 1; }
.grid thead th.is-pinned { z-index: calc(var(--z-sticky) + 1); }
.grid tbody td.is-pinned { background: var(--color-surface); }
.grid tbody tr:hover td.is-pinned { background: var(--color-row-hover); }
.grid tbody tr.is-selected td.is-pinned { background: var(--color-row-selected); }
.grid .is-pinned-last { box-shadow: inset calc(-1 * var(--bw)) 0 0 var(--color-border-strong), var(--shadow-pinned); }
.col-resize { position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; }
.col-resize:hover, body.is-resizing .col-resize:hover { background: var(--color-primary-soft); }
body.is-resizing { cursor: col-resize; user-select: none; }
.grid--comfortable tbody td { height: calc(var(--h-row) + 12px); }
.columns-panel__count { font-weight: var(--fw-bold); }
.check[hidden], .pane-section[hidden] { display: none; }
```

`src/css/tokens.css`

```css
/* =========================================================
   デザイントークン
   生の値（色・寸法・時間）はこのファイルだけに書く。
   1 段目：基本の値（--c-*, --sp-* …）
   2 段目：意味づけ（--color-* …）  ← 部品はこちらだけを参照する
   ========================================================= */
:root {
  /* ── 基本の色：落ち着いた青（主）と、わずかに青みのあるグレー ── */
  --c-blue-50: #eef4fa;
  --c-blue-100: #dbe7f4;
  --c-blue-200: #b8cfe8;
  --c-blue-300: #8eb1d8;
  --c-blue-500: #3d6fa8;
  --c-blue-600: #2f5d92;
  --c-blue-700: #264c78;
  --c-blue-800: #1d3a5c;

  /* 類似色（補助）：青緑 */
  --c-teal-50: #e7f4f3;
  --c-teal-600: #23807c;

  /* 分裂補色（注意・強調）：琥珀 */
  --c-amber-50: #fdf6e7;
  --c-amber-100: #fbe6b8;
  --c-amber-200: #f4d081;
  --c-amber-600: #a66a10;
  --c-amber-700: #84540b;

  --c-green-50: #e9f5ee;
  --c-green-600: #2b7a4b;
  --c-red-50: #fcecec;
  --c-red-600: #b3392f;

  --c-gray-0: #ffffff;
  --c-gray-25: #fafbfd;
  --c-gray-50: #f3f5f8;
  --c-gray-100: #eaeef3;
  --c-gray-200: #dce2e9;
  --c-gray-300: #c4ccd6;
  --c-gray-400: #98a3b2;
  --c-gray-500: #6a7688;
  --c-gray-600: #4f5a6b;
  --c-gray-700: #384251;
  --c-gray-900: #1b2230;

  /* ── 意味づけ ── */
  --color-bg: var(--c-gray-50);
  --color-surface: var(--c-gray-0);
  --color-surface-alt: var(--c-gray-25);
  --color-surface-sunken: var(--c-gray-100);
  --color-border: var(--c-gray-200);
  --color-border-strong: var(--c-gray-300);
  --color-text: var(--c-gray-900);
  --color-text-muted: var(--c-gray-600);
  --color-text-subtle: var(--c-gray-500);
  --color-text-inverse: var(--c-gray-0);

  --color-primary: var(--c-blue-600);
  --color-primary-hover: var(--c-blue-700);
  --color-primary-active: var(--c-blue-800);
  --color-primary-soft: var(--c-blue-50);
  --color-primary-soft-strong: var(--c-blue-100);
  --color-primary-border: var(--c-blue-200);
  --color-focus: var(--c-blue-500);

  --color-row-hover: var(--c-blue-50);
  --color-row-selected: var(--c-blue-100);
  --color-row-selected-bar: var(--c-blue-600);

  --color-highlight-bg: var(--c-amber-100);
  --color-highlight-text: var(--c-gray-900);
  --color-flash: var(--c-amber-200);

  --color-success: var(--c-green-600);
  --color-success-bg: var(--c-green-50);
  --color-warning: var(--c-amber-700);
  --color-warning-bg: var(--c-amber-50);
  --color-warning-border: var(--c-amber-200);
  --color-danger: var(--c-red-600);
  --color-danger-bg: var(--c-red-50);
  --color-info: var(--c-blue-600);
  --color-info-bg: var(--c-blue-50);
  --color-neutral: var(--c-gray-600);
  --color-neutral-bg: var(--c-gray-100);
  --color-mode-mock: var(--c-teal-600);
  --color-mode-mock-bg: var(--c-teal-50);

  --color-overlay-shadow: rgba(27, 34, 48, 0.16);
  --shadow-pinned: 4px 0 6px -4px rgba(29, 58, 92, 0.25); /* 左端に固定した列の影 */

  /* ── 文字 ── */
  --font-sans: "BIZ UDPGothic", "Yu Gothic UI", "Meiryo UI", "Meiryo", system-ui, sans-serif;
  --font-mono: "BIZ UDGothic", "Cascadia Mono", "Consolas", monospace;
  --fs-xs: 11px;
  --fs-sm: 12px;
  --fs-md: 14px;
  --fs-lg: 16px;
  --fs-xl: 20px;
  --fs-2xl: 26px;
  --fw-normal: 400;
  --fw-bold: 700;
  --lh-tight: 1.3;
  --lh-base: 1.6;

  /* ── 余白・角丸・寸法 ── */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --r-sm: 4px;
  --r-md: 6px;
  --r-lg: 10px;
  --r-pill: 999px;
  --bw: 1px;
  --bw-strong: 2px;
  --bw-bar: 3px;

  --h-control-sm: 28px;
  --h-control: 34px;
  --h-control-lg: 40px;
  --h-row: 34px;
  --w-rail: 64px;
  --w-sidepanel: 300px;
  --w-detail: 360px;
  --w-input-search: 300px;
  --w-manual: 720px;
  --h-manual: 520px;
  --w-toast: 420px;
  --w-col-min: 72px;
  --icon-rail: 18px;

  /* ── 影・重なり ── */
  --shadow-1: 0 1px 2px var(--color-overlay-shadow);
  --shadow-2: 0 6px 24px var(--color-overlay-shadow);
  --z-sticky: 2;
  --z-panel: 10;
  --z-manual: 900;
  --z-toast: 1000;

  /* ── 動き（反映の合図は 0.4 秒以内に返す） ── */
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-flash: 700ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
```

`src/index.html`

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>対象データ検索</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='13' cy='13' r='8' fill='none' stroke='%232f5d92' stroke-width='4'/%3E%3Cpath d='M19 19l8 8' stroke='%232f5d92' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E">
  <link rel="stylesheet" href="assets/vendor/fontawesome/css/all.min.css">
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/filters.css">
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <i class="fa-solid fa-magnifying-glass-chart brand__icon" aria-hidden="true" data-fallback="検"></i>
        <h1 class="brand__name">対象データ検索</h1>
        <span class="brand__version mono" id="app-version"></span>
      </div>
      <div class="topbar__search" id="search-host"></div>
      <div class="topbar__status" id="status-host"></div>
    </header>

    <div class="workspace">
      <nav class="rail" id="rail" aria-label="設定とデータ"></nav>
      <aside class="sidepanel" id="sidepanel" hidden></aside>
      <main class="main">
        <section class="results" id="results" aria-label="ロット一覧">
          <div class="tagbar" id="tagbar"></div>
        </section>
        <aside class="detail" id="detail" hidden></aside>
      </main>
    </div>
  </div>

  <div class="toast-host" id="toast-host"></div>
  <div id="manual-host"></div>

  <!-- 核 -->
  <script src="js/core/core.js"></script>
  <script src="js/core/util.js"></script>
  <!-- 列と絞り込みの決まり -->
  <script src="js/domain/fields.js"></script>
  <script src="js/domain/status-tones.js"></script>
  <script src="js/domain/filters.js"></script>
  <!-- サンプルデータと API -->
  <script src="js/sample/sample-data.js"></script>
  <script src="js/sample/sample-view.js"></script>
  <script src="js/api/api-client.js"></script>
  <script src="js/api/remote-adapters.js"></script>
  <script src="js/api/mock-adapter.js"></script>
  <!-- 操作 -->
  <script src="js/controllers/app-state.js"></script>
  <script src="js/controllers/search-controller.js"></script>
  <script src="js/controllers/data-controller.js"></script>
  <script src="js/controllers/tag-controller.js"></script>
  <script src="js/controllers/source-controller.js"></script>
  <script src="js/controllers/record-controller.js"></script>
  <!-- 画面の部品 -->
  <script src="js/views/toast.js"></script>
  <script src="js/views/status-chips.js"></script>
  <script src="js/views/side-panel.js"></script>
  <script src="js/views/source-editor.js"></script>
  <script src="js/views/record-key-editor.js"></script>
  <script src="js/views/filter-editors.js"></script>
  <script src="js/views/column-filter.js"></script>
  <script src="js/panels/filter-panel.js"></script>
  <script src="js/panels/panels.js"></script>
  <script src="js/panels/columns-panel.js"></script>
  <script src="js/views/search-bar.js"></script>
  <script src="js/views/tag-bar.js"></script>
  <script src="js/views/grid-tools.js"></script>
  <script src="js/views/results-view.js"></script>
  <script src="js/views/detail-view.js"></script>
  <script src="js/manual/manual-content.js"></script>
  <script src="js/manual/manual-view.js"></script>
  <!-- 起動 -->
  <script src="js/app.js"></script>
</body>
</html>
```

`src/js/api/api-client.js`

```javascript
/* =========================================================
   API の窓口。画面はここだけを呼び、実体（アダプター）は起動のしかたで切り替える。

     Tauri の中で動く      → tauri  （invoke）
     start.bat から開く    → http   （Python 版の POST /api/<命令名>）
     index.html を直接開く → mock   （サンプルデータ）

   アダプターを増やすときは adapters.register() を足すだけでよい。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const adapters = DS.core.createRegistry('apiAdapters');

  /** 画面に出すエラー。技術的な詳細は持たない */
  class ApiError extends Error {
    constructor(code, userMessage, detailId) {
      super(userMessage);
      this.code = code;
      this.userMessage = userMessage;
      this.detailId = detailId || null;
    }
  }

  const COMMANDS = ['get_view_config', 'search_lots', 'list_lots', 'get_filter_values', 'get_lot_detail', 'refresh_cache', 'get_cache_status', 'get_application_info',
    'get_data_source', 'test_data_source', 'update_data_source', 'check_record_key', 'update_record_settings'];

  function createClient(adapter) {
    return {
      adapter,
      mode: adapter.mode,
      capabilities: adapter.capabilities || {},
      async call(command, payload) {
        if (!COMMANDS.includes(command)) throw new ApiError('UNKNOWN_COMMAND', 'この操作には対応していません。');
        let result;
        try {
          result = await adapter.invoke(command, payload || {});
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new ApiError(
            'BACKEND_UNREACHABLE',
            adapter.unreachableMessage || '検索の処理に接続できません。アプリを起動し直してください。'
          );
        }
        if (result && result.success === false) {
          const err = result.error || {};
          throw new ApiError(err.code || 'INTERNAL_ERROR', err.userMessage || '処理できませんでした。', err.detailId);
        }
        return result;
      },
    };
  }

  /** 使えるアダプターのうち、order が小さいものを選ぶ */
  function selectAdapter() {
    const found = adapters.list().find((adapter) => adapter.detect());
    if (!found) throw new Error('使えるアダプターがありません');
    return found.create();
  }

  DS.api = DS.api || {};
  DS.api.adapters = adapters;
  DS.api.ApiError = ApiError;
  DS.api.createClient = createClient;
  DS.api.selectAdapter = selectAdapter;
})();
```

