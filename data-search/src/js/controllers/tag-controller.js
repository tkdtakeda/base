/* =========================================================
   絞り込みタグ：今の絞り込み条件に名前を付けて保存し、次回以降は押すだけで使う。
   ブラウザに自動で保存し、JSON ファイルへの書き出し・読み込みもできる（ほかの人と共有するため）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const STORAGE_KEY = 'tags';
  const FILE_KIND = 'data-search/filter-tags';
  const FILE_VERSION = 1;
  const NAME_MAX = 30;
  const TAGS_MAX = 50;

  /**
   * 保存したタグを読む。以前の形（別名＝論理名）で保存した列の名前は、DB の列名に読み替えて保存し直す。
   * 今の DB にない列の条件は消さずに残す（別の読み込み先へ戻したときに使えるように）。押したときに外す。
   */
  DS.controllers.loadTags = () => {
    const stored = DS.core.storage.read(STORAGE_KEY, []);
    const items = Array.isArray(stored) ? stored.filter(isValidTag) : [];
    let migrated = false;
    const result = items.map((tag) => {
      const filters = {};
      Object.entries(tag.filters).forEach(([fieldId, spec]) => {
        const id = DS.domain.migrateId(fieldId);
        if (id !== fieldId) migrated = true;
        filters[id] = spec;
      });
      return Object.assign({}, tag, { filters });
    });
    if (migrated) DS.core.storage.write(STORAGE_KEY, result);
    return result;
  };

  /** 知らない項目や壊れた条件は捨てる（設定ファイルを手で直した場合などに備える） */
  function isValidTag(tag) {
    return tag && typeof tag.id === 'string' && typeof tag.name === 'string' && tag.filters && typeof tag.filters === 'object';
  }

  /** 今の列で使える条件だけを残す（以前の形の列名は読み替える。ない列・種類の違う条件は外す） */
  function sanitizeFilters(filters) {
    const result = {};
    Object.entries(filters || {}).forEach(([name, spec]) => {
      const fieldId = DS.domain.migrateId(name);
      const field = DS.domain.fields.get(fieldId);
      if (field && field.filter && spec && spec.type === field.filter) result[fieldId] = spec;
    });
    return DS.domain.filters.compact(result);
  }

  function createTagController({ store, bus, toast, search }) {
    const items = () => store.get().tags.items;

    // 絞り込みがすべて外れたら、タグの選択も外す
    bus.on('state', ({ state, changed }) => {
      if (changed.includes('filters') && state.tags.activeId && Object.keys(DS.domain.filters.compact(state.filters)).length === 0) {
        store.merge('tags', { activeId: null });
      }
    });

    function commit(nextItems, activeId) {
      const result = DS.core.storage.write(STORAGE_KEY, nextItems);
      store.set({ tags: { items: nextItems, activeId: activeId === undefined ? store.get().tags.activeId : activeId } });
      if (!result.ok) toast.show({ tone: 'warning', message: `タグをブラウザに保存できませんでした：${result.reason}` });
      return result.ok;
    }

    /** 今の条件と、選んでいるタグの条件が違うか */
    function isModified() {
      const tag = items().find((item) => item.id === store.get().tags.activeId);
      return Boolean(tag) && !DS.domain.filters.sameFilters(tag.filters, store.get().filters);
    }

    /** 名前を確かめる。問題があれば理由を返す */
    function validateName(name, exceptId) {
      const value = DS.util.normalize(name);
      if (!value) return { ok: false, reason: 'タグの名前を入れてください' };
      if (value.length > NAME_MAX) return { ok: false, reason: `名前は ${NAME_MAX} 文字以内にしてください` };
      if (items().some((item) => item.id !== exceptId && item.name === value)) return { ok: false, reason: '同じ名前のタグがあります' };
      return { ok: true, value };
    }

    function canSave() {
      if (Object.keys(DS.domain.filters.compact(store.get().filters)).length === 0) return { ok: false, reason: '絞り込みを選ぶと、その条件をタグにできます' };
      if (items().length >= TAGS_MAX) return { ok: false, reason: `タグは ${TAGS_MAX} 個までです。使わないタグを消してください` };
      return { ok: true };
    }

    function save(name) {
      const check = validateName(name);
      if (!check.ok) return check;
      const tag = {
        id: 'tag-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: check.value,
        filters: DS.domain.filters.compact(store.get().filters),
        createdAt: new Date().toISOString(),
      };
      commit(items().concat(tag), tag.id);
      toast.show({ tone: 'success', message: `タグ「${tag.name}」を保存しました。次回からは押すだけで同じ絞り込みになります` });
      return { ok: true, tag };
    }

    function overwrite(id) {
      const filters = DS.domain.filters.compact(store.get().filters);
      const target = items().find((item) => item.id === id);
      commit(items().map((item) => (item.id === id ? Object.assign({}, item, { filters, updatedAt: new Date().toISOString() }) : item)), id);
      toast.show({ tone: 'success', message: `タグ「${target.name}」を今の条件で上書きしました` });
    }

    function rename(id, name) {
      const check = validateName(name, id);
      if (!check.ok) return check;
      commit(items().map((item) => (item.id === id ? Object.assign({}, item, { name: check.value }) : item)));
      return { ok: true };
    }

    /** 消す。確認ダイアログではなく「元に戻す」を出す */
    function remove(id) {
      const before = items();
      const target = before.find((item) => item.id === id);
      const wasActive = store.get().tags.activeId === id;
      commit(before.filter((item) => item.id !== id), wasActive ? null : undefined);
      toast.show({
        tone: 'info',
        message: `タグ「${target.name}」を消しました`,
        actionLabel: '元に戻す',
        timeout: 10000,
        onAction: () => commit(before, wasActive ? id : undefined),
      });
    }

    /** タグを押す：その条件で絞り込む。選んでいるタグをもう一度押すと解除（すべて） */
    function apply(id) {
      if (id === null || store.get().tags.activeId === id && !isModified()) {
        store.merge('tags', { activeId: null });
        return search.setFilters({});
      }
      const tag = items().find((item) => item.id === id);
      const filters = sanitizeFilters(JSON.parse(JSON.stringify(tag.filters)));
      const skipped = Object.keys(tag.filters).length - Object.keys(filters).length;
      if (skipped > 0) toast.show({ tone: 'warning', message: `タグ「${tag.name}」の条件のうち ${skipped} 列は、今のデータにないため外して絞り込みました` });
      store.merge('tags', { activeId: id });
      return search.setFilters(filters);
    }

    function move(id, delta) {
      const list = items().slice();
      const index = list.findIndex((item) => item.id === id);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= list.length) return;
      [list[index], list[next]] = [list[next], list[index]];
      commit(list);
    }

    // ── ファイル ──
    function exportFile() {
      if (items().length === 0) {
        toast.show({ tone: 'warning', message: '書き出すタグがありません' });
        return;
      }
      const data = { kind: FILE_KIND, version: FILE_VERSION, exportedAt: new Date().toISOString(), tags: items() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = DS.util.el('a', { href: URL.createObjectURL(blob), download: `絞り込みタグ_${DS.domain.filters.todayIso()}.json` });
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast.show({ tone: 'success', message: `タグ ${items().length} 個をファイルに書き出しました` });
    }

    /** 読み込み：同じ名前は上書きせず「(2)」を付けて足す */
    async function importFile(file) {
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch (error) {
        toast.show({ tone: 'danger', message: 'ファイルを読めませんでした。書き出したタグのファイル（.json）を選んでください' });
        return;
      }
      if (!data || data.kind !== FILE_KIND || !Array.isArray(data.tags)) {
        toast.show({ tone: 'danger', message: 'タグのファイルではありません。このツールで書き出したファイルを選んでください' });
        return;
      }
      const current = items().slice();
      let added = 0;
      let skipped = 0;
      data.tags.filter(isValidTag).forEach((tag) => {
        const filters = sanitizeFilters(tag.filters);
        if (Object.keys(filters).length === 0 || current.length >= TAGS_MAX) {
          skipped += 1;
          return;
        }
        let name = DS.util.normalize(tag.name).slice(0, NAME_MAX);
        for (let n = 2; current.some((item) => item.name === name); n += 1) name = `${DS.util.normalize(tag.name).slice(0, NAME_MAX - 4)}(${n})`;
        current.push({ id: 'tag-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, filters, createdAt: new Date().toISOString() });
        added += 1;
      });
      commit(current);
      toast.show({
        tone: added ? 'success' : 'warning',
        message: `タグを ${added} 個読み込みました${skipped ? `（${skipped} 個は条件が使えないか上限のため読み込みませんでした）` : ''}`,
      });
    }

    return { isModified, validateName, canSave, save, overwrite, rename, remove, apply, move, exportFile, importFile, NAME_MAX };
  }

  DS.controllers.createTagController = createTagController;
})();
