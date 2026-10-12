/* =========================================================
   核：名前空間・イベント（購読と通知）・状態・登録簿・保存
   普通の <script> で読み込み、window.DS に登録する（file:// で動かすため）。
   ========================================================= */
(function () {
  'use strict';

  const DS = (window.DS = window.DS || {});
  DS.core = DS.core || {};

  // ── EventBus ──────────────────────────────────────────
  // 部品どうしは直接呼び合わず、通知を購読してつなぐ。
  function createEventBus() {
    const handlers = new Map();
    return {
      on(type, handler) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(handler);
        return () => handlers.get(type).delete(handler);
      },
      emit(type, detail) {
        (handlers.get(type) || []).forEach((handler) => {
          try {
            handler(detail);
          } catch (error) {
            console.error('[EventBus]', type, error);
          }
        });
      },
    };
  }

  // ── Store ─────────────────────────────────────────────
  // 状態は 1 か所で持つ。変更は set() だけで行い、変わったキーを通知する。
  function createStore(initialState, bus) {
    let state = initialState;
    return {
      get() {
        return state;
      },
      set(patch) {
        const changed = Object.keys(patch).filter((key) => state[key] !== patch[key]);
        if (changed.length === 0) return;
        state = Object.assign({}, state, patch);
        bus.emit('state', { state, changed });
      },
      /** ネストしたオブジェクトの一部だけを変える */
      merge(key, partial) {
        this.set({ [key]: Object.assign({}, state[key], partial) });
      },
    };
  }

  // ── Registry ──────────────────────────────────────────
  // 「仲間を足していくもの」（項目・パネル・サンプル・説明書の章…）は登録するだけで増やせる。
  function createRegistry(name) {
    const items = new Map();
    return {
      name,
      register(item) {
        if (!item || !item.id) throw new Error(`[${name}] id が必要です`);
        items.set(item.id, item);
        return item;
      },
      get(id) {
        return items.get(id);
      },
      has(id) {
        return items.has(id);
      },
      list() {
        return Array.from(items.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
      },
    };
  }

  // ── Storage ───────────────────────────────────────────
  // ブラウザへの保存。使えない環境（保存禁止など）でも画面は動くようにする。
  const STORAGE_PREFIX = 'data-search:v1:';
  const STORAGE_LIMIT_BYTES = 200 * 1024;

  const storage = {
    read(key, fallback) {
      try {
        const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    },
    /** 保存できたら true。上限を超えたら理由を返す */
    write(key, value) {
      try {
        const raw = JSON.stringify(value);
        if (raw.length > STORAGE_LIMIT_BYTES) return { ok: false, reason: '保存できる量（200KB）を超えています' };
        window.localStorage.setItem(STORAGE_PREFIX + key, raw);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: 'ブラウザに保存できません（保存が禁止されている可能性があります）' };
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(STORAGE_PREFIX + key);
      } catch (error) {
        /* 何もしない */
      }
    },
  };

  DS.core.createEventBus = createEventBus;
  DS.core.createStore = createStore;
  DS.core.createRegistry = createRegistry;
  DS.core.storage = storage;
})();
