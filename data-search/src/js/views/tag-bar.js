/* =========================================================
   タグの列（一覧のすぐ上・いつも見える）
   [すべて] [タグ…] [＋今の条件を保存]
   よく使う操作（タグを押す）は 1 クリック。名前の変更・並べ替え・削除は選んだタグの ⋮ の中。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createTagBar(root, { store, bus, tags, openPanel }) {
    const { el, icon } = DS.util;
    let editing = null; // { mode: 'save' } | { mode: 'rename', id }
    let menuFor = null;
    let pendingFocus = null;

    const list = el('div', { className: 'tagbar__list', role: 'toolbar', 'aria-label': '絞り込みタグ' });
    const tools = el('div', { className: 'tagbar__tools' });
    root.append(el('span', { className: 'tagbar__label' }, [icon('fa-tags', ''), el('span', { text: 'タグ' })]), list, tools);

    // Esc：開いているタグの操作メニューだけを閉じる（パネルや詳細は閉じない）
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuFor) {
        event.preventDefault();
        menuFor = null;
        render(store.get());
      }
    }, true);

    document.addEventListener('click', (event) => {
      if (menuFor && !event.target.closest('.tag-menu, .tag__more')) {
        menuFor = null;
        render(store.get());
      }
    });

    function chip(label, active, onClick, extra) {
      const button = el('button', {
        type: 'button',
        className: `tag${active ? ' is-active' : ''}`,
        'aria-pressed': String(active),
        title: active && extra && extra.title ? extra.title : label,
      }, [active ? icon('fa-check', '✓') : null, el('span', { className: 'tag__name', text: label })]);
      button.addEventListener('click', onClick);
      return button;
    }

    /** 名前を入れる欄（保存・名前の変更で共通） */
    function nameEditor(initial, onSubmit) {
      const input = el('input', {
        type: 'text',
        className: 'input input--sm tag-editor__input',
        maxlength: String(tags.NAME_MAX),
        placeholder: 'タグの名前（例：架空商事の仕掛品）',
        'aria-label': 'タグの名前',
      });
      input.value = initial || '';
      const message = el('span', { className: 'tag-editor__msg' });
      const ok = el('button', { type: 'button', className: 'btn btn--primary btn--sm' }, [icon('fa-check', '✓'), el('span', { text: '保存' })]);
      const cancel = el('button', { type: 'button', className: 'icon-btn', title: 'やめる（Esc）', 'aria-label': 'やめる' }, [icon('fa-xmark', '×')]);
      const submit = () => {
        const result = onSubmit(input.value);
        if (result && !result.ok) {
          message.textContent = result.reason;
          DS.util.flash(message);
          input.focus();
          return;
        }
        editing = null;
        render(store.get());
      };
      input.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          editing = null;
          render(store.get());
        }
      });
      ok.addEventListener('click', submit);
      cancel.addEventListener('click', () => {
        editing = null;
        render(store.get());
      });
      pendingFocus = input; // 画面に置いた直後に入力欄へ移す（打ち始めた文字を取りこぼさない）
      return el('div', { className: 'tag-editor' }, [input, ok, cancel, message]);
    }

    function menu(tag, index, count) {
      const item = (iconName, label, onClick, options) => {
        const button = el('button', { type: 'button', className: `tag-menu__item${options && options.danger ? ' is-danger' : ''}`, disabled: options && options.disabled }, [icon(iconName, ''), el('span', { text: label })]);
        button.addEventListener('click', () => {
          menuFor = null;
          onClick();
          render(store.get());
        });
        return button;
      };
      return el('div', { className: 'tag-menu', role: 'menu' }, [
        item('fa-pen', '名前を変える', () => { editing = { mode: 'rename', id: tag.id }; }),
        item('fa-arrow-left', '左へ動かす', () => tags.move(tag.id, -1), { disabled: index === 0 }),
        item('fa-arrow-right', '右へ動かす', () => tags.move(tag.id, 1), { disabled: index === count - 1 }),
        el('hr', { className: 'tag-menu__sep' }),
        item('fa-trash-can', 'このタグを消す', () => tags.remove(tag.id), { danger: true }),
      ]);
    }

    function render(state) {
      const activeId = state.tags.activeId;
      const items = state.tags.items;
      const modified = tags.isModified();
      const nodes = [chip('すべて', !activeId, () => tags.apply(null), { title: '絞り込みをしない' })];

      items.forEach((tag, index) => {
        if (editing && editing.mode === 'rename' && editing.id === tag.id) {
          nodes.push(nameEditor(tag.name, (name) => tags.rename(tag.id, name)));
          return;
        }
        const active = tag.id === activeId;
        const describe = Object.entries(tag.filters).map(([fieldId, spec]) => (DS.domain.filters.allowed(DS.domain.fields.get(fieldId), spec)
          ? `${DS.domain.fields.get(fieldId).label}：${DS.domain.filters.describe(fieldId, spec)}`
          : `${fieldId}：（今のデータにない列）`)).join(' / ');
        const group = el('span', { className: `tag-group${active ? ' is-active' : ''}` }, [
          chip(tag.name, active, () => tags.apply(tag.id), { title: describe }),
        ]);
        group.firstChild.title = describe;
        if (active) {
          if (modified) {
            const overwrite = el('button', { type: 'button', className: 'tag__overwrite', title: '今の条件でこのタグを上書きする' }, [
              el('span', { className: 'tag__modified' }, [icon('fa-circle', '●'), el('span', { text: '変更あり' })]),
              el('span', { text: '上書き保存' }),
            ]);
            overwrite.addEventListener('click', () => tags.overwrite(tag.id));
            group.appendChild(overwrite);
          }
          const more = el('button', { type: 'button', className: 'tag__more', title: 'このタグの操作', 'aria-label': 'このタグの操作', 'aria-haspopup': 'menu' }, [icon('fa-ellipsis-vertical', '⋮')]);
          more.addEventListener('click', (event) => {
            event.stopPropagation();
            menuFor = menuFor === tag.id ? null : tag.id;
            render(store.get());
          });
          group.appendChild(more);
          if (menuFor === tag.id) {
            const node = menu(tag, index, items.length);
            group.appendChild(node);
            // タグの列は横にスクロールするため、メニューは画面に固定し、⋮ の真下に出す
            window.requestAnimationFrame(() => {
              const rect = more.getBoundingClientRect();
              node.style.top = `${rect.bottom + 4}px`;
              node.style.left = `${Math.min(rect.left, window.innerWidth - node.offsetWidth - 8)}px`;
            });
          }
        }
        nodes.push(group);
      });

      if (editing && editing.mode === 'save') {
        nodes.push(nameEditor('', (name) => tags.save(name)));
      }
      list.replaceChildren(...nodes);
      if (pendingFocus) {
        pendingFocus.focus();
        pendingFocus.select();
        pendingFocus = null;
      }

      // 右側：保存ボタン（できないときは理由を文字で出す）
      const can = tags.canSave();
      const toolNodes = [];
      if (!editing || editing.mode !== 'save') {
        const save = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', disabled: !can.ok }, [icon('fa-plus', '+'), el('span', { text: '今の条件をタグにする' })]);
        save.addEventListener('click', () => {
          editing = { mode: 'save' };
          render(store.get());
        });
        if (!can.ok) toolNodes.push(el('span', { className: 'tagbar__hint', text: can.reason }));
        toolNodes.push(save);
      }
      const filterButton = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', title: '絞り込みのパネルを開く' }, [icon('fa-filter', ''), el('span', { text: '絞り込み' })]);
      filterButton.addEventListener('click', () => openPanel('filters'));
      toolNodes.push(filterButton);
      tools.replaceChildren(...toolNodes);
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.some((key) => ['tags', 'filters'].includes(key))) render(state);
    });
    render(store.get());
  }

  DS.views.createTagBar = createTagBar;
})();
