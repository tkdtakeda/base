/* =========================================================
   「データ」パネルの「読み込み先」：今のパスの表示・接続テスト・変更

   ふだんは今のパスと 2 つのボタン（接続を確かめる／変更）だけ。
   変更では、貼り付け → Enter で確かめる → × がなければ「保存して更新」へ移る（Enter で押せる）。
   △（1 件を決める列がないなど）は、保存してから「1 件を決める列」で直せる。
   入力を変えたら、前の結果は使えない（もう一度確かめる）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  const MARKS = {
    ok: { icon: 'fa-circle-check', fallback: '○', label: '○' },
    warn: { icon: 'fa-triangle-exclamation', fallback: '△', label: '△' },
    ng: { icon: 'fa-circle-xmark', fallback: '×', label: '×' },
    skip: { icon: 'fa-circle-minus', fallback: '－', label: '－' },
  };

  function button(className, iconName, text) {
    const node = el('button', { type: 'button', className: `btn ${className}` });
    node.dataset.icon = iconName;
    node.replaceChildren(icon(iconName, ''), el('span', { text }));
    return node;
  }

  function setBusy(node, busy, busyText, text) {
    node.replaceChildren(icon(busy ? 'fa-spinner' : node.dataset.icon, '', busy ? 'fa-spin' : ''), el('span', { text: busy ? busyText : text }));
  }

  function renderSteps(result) {
    if (!result) return [];
    const warned = result.steps.some((step) => step.status === 'warn');
    const summary = result.ok
      ? el('p', { className: `source-result__summary ${warned ? 'is-warn' : 'is-ok'}` }, [icon(warned ? 'fa-triangle-exclamation' : 'fa-circle-check', warned ? '△' : '○'), el('span', {
        text: ` ${warned ? '× はありません（△ は保存してから直せます）' : 'すべて ○'}（${DS.util.formatNumber(result.rowCount)} 件・${DS.util.formatDateTime(result.modifiedAt)} 更新）` })])
      : el('p', { className: 'source-result__summary is-ng' }, [icon('fa-circle-xmark', '×'), el('span', { text: ' × があります。対応を見て直してください' })]);
    const list = el('ol', { className: 'source-steps' }, result.steps.map((step) => {
      const mark = MARKS[step.status] || MARKS.skip;
      return el('li', { className: `source-step source-step--${step.status}` }, [
        el('span', { className: 'source-step__mark', title: mark.label }, [icon(mark.icon, mark.fallback)]),
        el('div', {}, [
          el('strong', { className: 'source-step__label', text: step.label }),
          el('p', { className: 'source-step__text', text: step.message }),
          step.action ? el('p', { className: 'source-step__action', text: `対応：${step.action}` }) : null,
        ].filter(Boolean)),
      ]);
    }));
    return [summary, list];
  }

  function createSourceEditor(ctx) {
    const { source } = ctx;
    const root = el('div', { className: 'source' });
    const current = el('p', { className: 'source__path mono' });
    const checkButton = button('btn--secondary btn--sm', 'fa-plug-circle-check', '接続を確かめる');
    const editButton = button('btn--secondary btn--sm', 'fa-pen', '変更');
    const viewRow = el('div', { className: 'source__actions' }, [checkButton, editButton]);

    const input = el('input', { type: 'text', className: 'input source__input mono', spellcheck: 'false', autocomplete: 'off',
      placeholder: '例：\\\\server\\share\\data.sqlite3', 'aria-label': '読み込み先のパス' });
    const hint = el('p', { className: 'pane-note', text: 'エクスプローラーでファイルを Shift＋右クリック →「パスとしてコピー」して貼り付け。前後の " は自動で外します。' });
    const testButton = button('btn--secondary btn--sm', 'fa-plug-circle-check', '確かめる');
    const saveButton = button('btn--primary btn--sm', 'fa-floppy-disk', '保存して更新');
    const cancelButton = button('btn--ghost btn--sm', 'fa-xmark', 'やめる');
    const stale = el('p', { className: 'pane-note is-warning', hidden: true, text: '入力が変わりました。もう一度確かめてください。' });
    const editBox = el('div', { className: 'source__edit', hidden: true }, [
      input, hint, el('div', { className: 'source__actions' }, [testButton, saveButton, cancelButton]), stale,
    ]);
    const resultBox = el('div', { className: 'source-result', 'aria-live': 'polite' });
    const savedTo = el('p', { className: 'pane-note' });
    root.append(current, viewRow, editBox, resultBox, savedTo);

    let editing = false;
    function setEditing(on) {
      editing = on;
      editBox.hidden = !on;
      viewRow.hidden = on;
      source.reset();
      if (on) {
        input.value = ctx.store.get().source.path || '';
        input.focus();
      }
    }

    checkButton.addEventListener('click', () => source.test(null));
    editButton.addEventListener('click', () => setEditing(true));
    cancelButton.addEventListener('click', () => setEditing(false));
    testButton.addEventListener('click', async () => {
      const result = await source.test(input.value);
      input.value = source.normalizePath(input.value);
      if (result && result.ok) saveButton.focus();
    });
    saveButton.addEventListener('click', async () => {
      if (await source.save(input.value)) {
        setEditing(false);
        DS.util.flash(current);
      }
    });
    input.addEventListener('focus', () => window.setTimeout(() => { if (document.activeElement === input) input.select(); }, 0));
    input.addEventListener('paste', () => window.setTimeout(() => { input.value = source.normalizePath(input.value); }, 0));
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        testButton.click();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setEditing(false);
      }
    });
    input.addEventListener('input', () => update(ctx.store.get()));

    function update(state) {
      const info = state.source;
      current.textContent = info.path || (info.loaded ? '（未設定）' : '読み込み中…');
      editButton.hidden = !info.editable;
      checkButton.disabled = info.status !== 'idle' || !info.loaded;
      setBusy(checkButton, info.status === 'checking' && !editing, '確かめています…', '接続を確かめる');
      testButton.disabled = info.status !== 'idle';
      setBusy(testButton, info.status === 'checking' && editing, '確かめています…', '確かめる');
      saveButton.disabled = !source.canSave(input.value);
      setBusy(saveButton, info.status === 'saving', '保存して更新しています…', '保存して更新');
      const changed = editing && info.result && info.testedPath !== source.normalizePath(input.value);
      stale.hidden = !changed;
      resultBox.classList.toggle('is-stale', Boolean(changed));
      resultBox.replaceChildren(...renderSteps(info.result));
      savedTo.textContent = info.editable && info.localFile ? `保存先：${info.localFile}（dataSource.sourcePath）` : (info.loadError || '');
    }

    return { element: root, update };
  }

  DS.views.createSourceEditor = createSourceEditor;
})();
