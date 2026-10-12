/* =========================================================
   「データ」パネルの「1 件を決める列」：今の列の表示・確認・変更

   ふだんは今の列（左端に固定する列）と、番号で探す列だけを出す。
   変更では、列名を入れて Enter で次の欄へ → 「確かめる」で 1 件に決まるかを数える
   → 確かめた組み合わせなら「保存」できる（重なりがあれば △ で知らせる。保存はできる）。
   入力を変えたら、前の結果は使えない（もう一度確かめる）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;
  const KEY_MAX = 3;

  function button(className, iconName, text) {
    const node = el('button', { type: 'button', className: `btn ${className}` });
    node.dataset.icon = iconName;
    node.replaceChildren(icon(iconName, ''), el('span', { text }));
    return node;
  }

  function setBusy(node, busy, busyText, text) {
    node.replaceChildren(icon(busy ? 'fa-spinner' : node.dataset.icon, '', busy ? 'fa-spin' : ''), el('span', { text: busy ? busyText : text }));
  }

  /** 入力された列名 → 列（大文字小文字・全角半角を区別しない完全一致）。空なら null、ないときは undefined */
  function fieldByName(text) {
    const needle = DS.util.foldForCompare(text);
    if (!needle) return null;
    return DS.domain.listFields().find((field) => DS.util.foldForCompare(field.label) === needle);
  }

  function chip(field, iconName) {
    return el('span', { className: 'key-chip mono', title: field.label }, [icon(iconName, ''), el('span', { text: field.label })]);
  }

  function renderResult(result) {
    if (!result) return [];
    const total = DS.util.formatNumber(result.rowCount);
    const nodes = [];
    if (result.unique) {
      nodes.push(el('p', { className: 'source-result__summary is-ok' }, [icon('fa-circle-check', '○'),
        el('span', { text: ` 1 件に決まります（${total} 行すべて）` })]));
    } else {
      const example = result.example
        ? Object.values(result.example.values).map((value) => (value === null || value === '' ? '（空欄）' : value)).join('・')
        : '';
      nodes.push(el('p', { className: 'source-result__summary is-warn' }, [icon('fa-triangle-exclamation', '△'),
        el('span', { text: ` 同じ組み合わせが ${DS.util.formatNumber(result.duplicateGroups)} 組（${DS.util.formatNumber(result.duplicateRows)} 行）あります` })]));
      if (example) nodes.push(el('p', { className: 'pane-note mono', text: `例：${example}（${DS.util.formatNumber(result.example.count)} 行）` }));
      nodes.push(el('p', { className: 'pane-note', text: '保存はできますが、詳細には重なった中の最初の 1 件を出します。列を足すと 1 件に決まることがあります。' }));
    }
    if (result.blankRows) {
      nodes.push(el('p', { className: 'pane-note is-warning', text: `選んだ列がすべて空欄の行が ${DS.util.formatNumber(result.blankRows)} 行あります。` }));
    }
    return nodes;
  }

  function createRecordKeyEditor(ctx) {
    const { record, store } = ctx;
    const root = el('div', { className: 'record-key' });
    const current = el('div', { className: 'record-key__current' });
    const editButton = button('btn--secondary btn--sm', 'fa-pen', '変更');
    const viewRow = el('div', { className: 'source__actions' }, [editButton]);

    const names = el('datalist', { id: 'record-column-names' });
    const slotInput = (index) => el('input', { type: 'text', className: 'input input--sm mono', list: 'record-column-names', autocomplete: 'off', spellcheck: 'false',
      placeholder: index === 0 ? '列名（必須）' : '列名（なくてよい）', 'aria-label': `1 件を決める列の ${index + 1} つ目` });
    const slots = Array.from({ length: KEY_MAX }, (_, index) => slotInput(index));
    const searchInput = el('input', { type: 'text', className: 'input input--sm mono', list: 'record-column-names', autocomplete: 'off', spellcheck: 'false',
      'aria-label': '番号で探す列' });
    const message = el('p', { className: 'tag-editor__msg', 'aria-live': 'polite' });
    const testButton = button('btn--secondary btn--sm', 'fa-list-check', '確かめる');
    const saveButton = button('btn--primary btn--sm', 'fa-floppy-disk', '保存');
    const cancelButton = button('btn--ghost btn--sm', 'fa-xmark', 'やめる');
    const stale = el('p', { className: 'pane-note is-warning', hidden: true, text: '入力が変わりました。もう一度確かめてください。' });
    const editBox = el('div', { className: 'source__edit', hidden: true }, [
      el('p', { className: 'pane-note', text: '1 件を決める列を 1〜3 つ、DB の列名で選びます。Enter で次の欄へ移ります。' }),
      el('ol', { className: 'record-key__slots' }, slots.map((input) => el('li', {}, [input]))),
      el('label', { className: 'record-key__search' }, [el('span', { className: 'pane-note', text: '番号で探す列（上部バーの入力欄）' }), searchInput]),
      message,
      el('div', { className: 'source__actions' }, [testButton, saveButton, cancelButton]),
      stale,
      names,
    ]);
    const resultBox = el('div', { className: 'source-result', 'aria-live': 'polite' });
    const savedTo = el('p', { className: 'pane-note' });
    root.append(current, viewRow, editBox, resultBox, savedTo);
    DS.util.autoAdvance(slots.concat([searchInput, testButton]));

    let editing = false;

    /** 入力から列を読む。誤りがあれば { error } */
    function readInput() {
      const picked = [];
      for (let index = 0; index < slots.length; index += 1) {
        const field = fieldByName(slots[index].value);
        if (field === undefined) return { error: `「${slots[index].value}」という列はありません。候補から選んでください`, node: slots[index] };
        if (field && picked.includes(field.id)) return { error: `「${field.label}」が重なっています`, node: slots[index] };
        if (field) picked.push(field.id);
      }
      if (picked.length === 0) return { error: '1 つ目の列を入れてください', node: slots[0] };
      const search = fieldByName(searchInput.value);
      if (search === undefined) return { error: `「${searchInput.value}」という列はありません`, node: searchInput };
      return { names: picked, searchColumn: search ? search.id : picked[0] };
    }

    function setEditing(on) {
      editing = on;
      editBox.hidden = !on;
      viewRow.hidden = on;
      message.textContent = '';
      record.reset();
      if (!on) return;
      names.replaceChildren(...DS.domain.listFields().map((field) => el('option', { value: field.label })));
      const keys = DS.domain.keyFields();
      slots.forEach((input, index) => { input.value = keys[index] ? keys[index].label : ''; });
      const search = DS.domain.searchField();
      searchInput.value = search && (!keys[0] || search.id !== keys[0].id) ? search.label : '';
      searchInput.placeholder = '空欄なら 1 つ目の列で探す';
      slots[0].focus();
    }

    editButton.addEventListener('click', () => setEditing(true));
    cancelButton.addEventListener('click', () => setEditing(false));
    testButton.addEventListener('click', async () => {
      const input = readInput();
      if (input.error) {
        message.textContent = input.error;
        DS.util.flash(message);
        input.node.focus();
        return;
      }
      message.textContent = '';
      const result = await record.check(input.names);
      if (result) saveButton.focus();
    });
    saveButton.addEventListener('click', () => {
      const input = readInput();
      if (!input.error) record.save(input.names, input.searchColumn);
    });
    editBox.addEventListener('input', () => update(store.get()));
    editBox.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      setEditing(false);
    });

    function update(state) {
      const info = state.record;
      const keys = DS.domain.keyFields();
      const search = DS.domain.searchField();
      const nodes = [];
      if (keys.length) {
        nodes.push(el('div', { className: 'key-chips' }, keys.map((field) => chip(field, 'fa-thumbtack'))));
      } else {
        nodes.push(el('p', { className: 'record-key__missing' }, [icon('fa-circle-exclamation', '!'),
          el('span', { text: '決まっていません。行の詳細を開くには、下の「変更」から 1 件を決める列を選んでください。' })]));
      }
      nodes.push(el('p', { className: 'pane-note' }, search
        ? [el('span', { text: '番号で探す列：' }), el('strong', { className: 'mono', text: search.label })]
        : [el('span', { text: '番号で探す列：決まっていません' })]));
      current.replaceChildren(...nodes);
      editButton.disabled = !(state.cache.status && state.cache.status.available);
      editButton.title = editButton.disabled ? 'データがあるときに選べます' : '';

      const input = editing ? readInput() : null;
      testButton.disabled = info.status !== 'idle';
      setBusy(testButton, info.status === 'checking', '数えています…', '確かめる');
      saveButton.disabled = !input || Boolean(input.error) || !record.canSave(input.names);
      setBusy(saveButton, info.status === 'saving', '保存しています…', '保存');
      const changed = editing && info.result && (!input || input.error || !record.canSave(input.names)) && info.status === 'idle';
      stale.hidden = !changed;
      resultBox.classList.toggle('is-stale', Boolean(changed));
      resultBox.replaceChildren(...(editing ? renderResult(info.result) : []));
      const file = DS.domain.recordSettingsFile();
      savedTo.textContent = file ? `保存先：${file}（recordKey・searchColumn）` : '';
    }

    return {
      element: root,
      update,
      /** 「1 件を決める列を選ぶ」から呼ばれる：変更を始めて、その場所を見せる */
      startEditing() {
        if (editButton.disabled) return;
        if (!editing) setEditing(true);
        root.scrollIntoView({ block: 'nearest' });
        DS.util.flash(root);
      },
    };
  }

  DS.views.createRecordKeyEditor = createRecordKeyEditor;
})();
