/* =========================================================
   脇のパネル（データ・表示列・サンプル）
   1 パネル＝1 つの register()。パネルを足すときはこのファイルか別ファイルで register() する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  function section(titleText, children, extraClass) {
    return el('section', { className: `pane-section${extraClass ? ' ' + extraClass : ''}` }, [
      el('h3', { className: 'pane-section__title', text: titleText }),
    ].concat(children));
  }

  // ── データ（キャッシュの状態と更新） ─────────────────────────
  DS.panels.register({
    id: 'data',
    order: 10,
    icon: 'fa-database',
    label: 'データ',
    title: 'データの状態と更新',
    badge(state) {
      const view = DS.views.describeCache(state.cache);
      if (view.tone === 'warning' || view.tone === 'danger') return { tone: view.tone, text: '!', title: view.text };
      return null;
    },
    mount(container, ctx) {
      const summary = el('div', { className: 'status-card' });
      const facts = el('dl', { className: 'facts' });
      const refreshButton = el('button', { type: 'button', className: 'btn btn--secondary btn--block' });
      const progress = el('p', { className: 'pane-note', 'aria-live': 'polite' });
      const sourceNote = el('p', { className: 'pane-note' });
      const configBox = el('div', { className: 'config-help', hidden: true });
      refreshButton.addEventListener('click', () => ctx.cache.refresh());

      container.append(
        summary,
        configBox,
        section('根拠', [facts]),
        section('共有データから更新', [
          el('p', { className: 'pane-note', text: '共有データを手元にコピーし、検証してから入れ替えます。失敗したときは前回のデータをそのまま使います。' }),
          refreshButton,
          progress,
        ]),
        section('このモードについて', [sourceNote]),
      );

      let timer = null;
      function tick(state) {
        const started = state.cache.refreshStartedAt;
        if (!started) {
          progress.textContent = '';
          return;
        }
        const seconds = Math.floor((Date.now() - started) / 1000);
        progress.textContent = seconds >= 5
          ? `コピーと検証をしています（${seconds} 秒）。共有フォルダが遠いと時間がかかります。中途半端なデータを残さないため、途中では止められません。`
          : `コピーと検証をしています（${seconds} 秒）`;
      }

      function fact(label, value, extraClass) {
        return [el('dt', { text: label }), el('dd', { className: extraClass || '', text: value })];
      }

      return {
        update(state) {
          const status = state.cache.status || {};
          const view = DS.views.describeCache(state.cache);
          summary.className = `status-card status-card--${view.tone}`;
          summary.replaceChildren(
            el('span', { className: 'status-card__icon' }, [icon(view.icon, view.fallback, view.spin ? 'fa-spin' : '')]),
            el('div', {}, [
              el('strong', { className: 'status-card__title', text: view.text }),
              el('p', { className: 'status-card__text', text: status.message || '' }),
            ]),
          );
          facts.replaceChildren(...[]
            .concat(fact('検索しているデータ', status.cacheUpdatedAt ? `${DS.util.formatDateTime(status.cacheUpdatedAt)} 時点` : '—', 'mono'))
            .concat(fact('共有データの更新日時', DS.util.formatDateTime(status.sourceModifiedAt), 'mono'))
            .concat(fact('件数', status.rowCount == null ? '—' : `${DS.util.formatNumber(status.rowCount)} 件`, 'mono'))
            .concat(fact('前回の更新', status.lastRefreshAt
              ? `${status.lastRefreshSucceeded === false ? '失敗' : '成功'}（${DS.util.formatAgo(status.lastRefreshAt)}）`
              : '—'))
            .concat(fact('共有データへの接続', status.sourceReachable === false ? 'できません' : status.sourceReachable ? 'できます' : '—'))
            .concat(status.errorMessage ? fact('失敗の理由', status.errorMessage, 'is-warning') : []));

          const refreshing = state.cache.refreshing;
          refreshButton.disabled = refreshing;
          refreshButton.replaceChildren(
            icon('fa-rotate', '', refreshing ? 'fa-spin' : ''),
            el('span', { text: refreshing ? '更新しています…' : 'データを更新する' }));
          window.clearInterval(timer);
          tick(state);
          if (refreshing) timer = window.setInterval(() => tick(ctx.store.get()), 1000);
          sourceNote.textContent = state.mode.description;

          // 設定が未完了のとき・使わなかった項目があるときは、どこを直せばよいかを出す
          const ignored = status.ignoredSettings || [];
          configBox.hidden = !status.configIncomplete && ignored.length === 0;
          if (!status.configIncomplete && ignored.length) {
            configBox.replaceChildren(section('設定の確認', [
              el('p', { className: 'pane-note', text: `config/${status.configFile} の次の項目は config.sample.json にないため使っていません。書き間違いがないか確認してください。` }),
              el('ul', { className: 'config-help__list mono' }, ignored.map((path) => el('li', { text: path }))),
            ]));
          }
          refreshButton.disabled = refreshing || Boolean(status.configIncomplete);
          if (status.configIncomplete) {
            configBox.replaceChildren(
              section('設定の直し方', [
                el('p', { className: 'pane-note', text: status.configSource === 'sample'
                  ? 'config.local.json がないため、config.sample.json の初期値だけで起動しています。'
                  : `config.sample.json の初期値を config/${status.configFile} で上書きしています。` }),
                el('p', { className: 'pane-note', text: '次の項目が仮の値（<...>）のままです：' }),
                el('ul', { className: 'config-help__list mono' }, (status.incompleteSettings || []).map((path) => el('li', { text: path }))),
                el('ol', { className: 'config-help__steps' }, [
                  el('li', { text: 'config フォルダに config.local.json を作る（なければ）' }),
                  el('li', { text: '上の項目だけ実際の値を書く。ほかの項目は書かなくてよい（config.sample.json の値を使う）' }),
                  el('li', { text: 'start.bat を起動し直す' }),
                ]),
                el('p', { className: 'pane-note', text: '実データなしで試すときは start-dummy.bat を使ってください。' }),
              ]),
            );
          }
        },
      };
    },
  });

  // ── 表示列 ─────────────────────────────────────────────
  DS.panels.register({
    id: 'columns',
    order: 20,
    icon: 'fa-table-columns',
    label: '表示列',
    title: '一覧に表示する列',
    badge(state) {
      const hidden = DS.domain.fields.list().length - state.columns.visible.length;
      return hidden > 0 ? { tone: 'info', text: String(hidden), title: `${hidden} 列を隠しています` } : null;
    },
    mount(container, ctx) {
      const checks = new Map();
      const groups = DS.domain.fieldGroups.list().map((group) => {
        const items = DS.domain.fields.list().filter((field) => field.group === group.id).map((field) => {
          const box = el('input', { type: 'checkbox', value: field.id });
          box.addEventListener('change', () => toggle(field.id, box.checked, box.parentElement));
          checks.set(field.id, box);
          return el('label', { className: 'check' }, [box, el('span', { text: field.label })]);
        });
        return section(group.label, [el('div', { className: 'check-list' }, items)]);
      });
      const reset = el('button', { type: 'button', className: 'btn btn--ghost btn--block' }, [icon('fa-arrow-rotate-left', ''), el('span', { text: 'すべて表示する（既定に戻す）' })]);
      reset.addEventListener('click', () => {
        ctx.store.set({ columns: { visible: DS.controllers.defaultVisibleColumns() } });
        DS.util.flash(container);
      });
      container.append(
        el('p', { className: 'pane-note', text: 'チェックを外した列は一覧から隠れます。詳細にはすべて表示されます。設定は自動で保存されます。' }),
        ...groups,
        reset,
      );

      function toggle(id, checked, row) {
        const order = DS.domain.fields.list().map((field) => field.id);
        const current = new Set(ctx.store.get().columns.visible);
        if (checked) current.add(id);
        else current.delete(id);
        if (current.size === 0) {
          checks.get(id).checked = true;
          ctx.toast.show({ tone: 'warning', message: '少なくとも 1 列は表示してください' });
          return;
        }
        ctx.store.set({ columns: { visible: order.filter((x) => current.has(x)) } });
        DS.util.flash(row);
      }

      return {
        update(state) {
          checks.forEach((box, id) => { box.checked = state.columns.visible.includes(id); });
        },
      };
    },
  });

  // ── サンプル ───────────────────────────────────────────
  DS.panels.register({
    id: 'samples',
    order: 30,
    icon: 'fa-flask',
    label: 'サンプル',
    title: 'サンプルデータ',
    mount(container, ctx) {
      if (!ctx.samples.available) {
        container.append(el('div', { className: 'status-card status-card--neutral' }, [
          el('span', { className: 'status-card__icon' }, [icon('fa-ban', '×')]),
          el('div', {}, [
            el('strong', { className: 'status-card__title', text: 'このモードでは使えません' }),
            el('p', { className: 'status-card__text', text: 'サンプルデータは、index.html を直接開いて「画面だけで試す」ときに使えます。今は実際のデータを検索しています。' }),
          ]),
        ]));
        return null;
      }

      const rows = new Map();
      const sections = DS.sample.groups.list().map((group) => {
        const items = DS.sample.patterns.list().filter((pattern) => pattern.group === group.id).map((pattern) => {
          const state = el('span', { className: 'sample__state' });
          const button = el('button', { type: 'button', className: 'btn btn--secondary btn--sm' });
          button.addEventListener('click', () => ctx.samples.load(pattern.id));
          const count = ctx.samples.countOf(pattern.id);
          const node = el('li', { className: 'sample' }, [
            el('span', { className: 'sample__icon' }, [icon(pattern.icon, '')]),
            el('div', { className: 'sample__body' }, [
              el('strong', { className: 'sample__title', text: pattern.title }),
              el('span', { className: 'sample__desc', text: pattern.description }),
              el('span', { className: 'sample__meta' }, [
                count ? el('span', { className: 'mono', text: `${DS.util.formatNumber(count)} 件` }) : null,
                pattern.demoQuery ? el('span', { text: '読み込むと検索の例を実行します' }) : null,
                state,
              ]),
            ]),
            button,
          ]);
          rows.set(pattern.id, { node, button, state });
          return node;
        });
        return section(group.label, [el('ul', { className: 'sample-list' }, items)]);
      });

      const total = el('p', { className: 'pane-note mono' });
      const clear = el('button', { type: 'button', className: 'btn btn--danger-ghost btn--block' }, [icon('fa-trash-can', ''), el('span', { text: 'サンプルデータだけを消す' })]);
      clear.addEventListener('click', () => ctx.samples.clear());

      container.append(
        el('p', { className: 'pane-note', text: '目的に合わせて読み込むと、そのまま動きを確かめられます。毎回同じデータができます。' }),
        ...sections,
        section('片付け', [total, clear, el('p', { className: 'pane-note', text: '消したあと 10 秒間は「元に戻す」で戻せます。' })], 'pane-section--end'),
      );

      return {
        update() {
          const loaded = ctx.samples.loadedIds();
          rows.forEach((row, id) => {
            const isLoaded = loaded.includes(id);
            row.node.classList.toggle('is-loaded', isLoaded);
            row.state.replaceChildren(...(isLoaded ? [icon('fa-check', '✓'), el('span', { text: '読み込み済み' })] : []));
            row.button.textContent = isLoaded ? '読み直す' : '読み込む';
          });
          const rowsCount = ctx.store.get().cache.status ? ctx.store.get().cache.status.rowCount || 0 : 0;
          total.textContent = loaded.length ? `今あるサンプル：${DS.util.formatNumber(rowsCount)} 件` : '今あるサンプル：なし';
          clear.disabled = loaded.length === 0;
          clear.title = loaded.length === 0 ? '消すサンプルがありません' : '';
        },
      };
    },
  });
})();
