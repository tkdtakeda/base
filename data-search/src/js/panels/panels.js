/* =========================================================
   脇のパネル（データ・サンプル）。表示列は columns-panel.js
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
    watch: ['source', 'record'],
    badge(state) {
      const view = DS.views.describeCache(state.cache);
      if (view.tone === 'warning' || view.tone === 'danger') return { tone: view.tone, text: '!', title: view.text };
      if (state.cache.status && state.cache.status.available && !DS.domain.isReady()) {
        return { tone: 'danger', text: '!', title: '1 件を決める列を選んでください' };
      }
      return null;
    },
    mount(container, ctx) {
      const summary = el('div', { className: 'status-card' });
      const facts = el('dl', { className: 'facts' });
      const refreshButton = el('button', { type: 'button', className: 'btn btn--secondary btn--block' });
      const progress = el('p', { className: 'pane-note', 'aria-live': 'polite' });
      const sourceNote = el('p', { className: 'pane-note' });
      const configBox = el('div', { className: 'config-help', hidden: true });
      const sourceEditor = DS.views.createSourceEditor(ctx);
      const keyEditor = DS.views.createRecordKeyEditor(ctx);
      const keySection = section('1 件を決める列', [keyEditor.element]);
      refreshButton.addEventListener('click', () => ctx.cache.refresh());
      ctx.bus.on('record:edit', () => window.setTimeout(() => keyEditor.startEditing(), 0));

      container.append(
        summary,
        configBox,
        section('読み込み先', [sourceEditor.element]),
        keySection,
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
          sourceEditor.update(state);
          keyEditor.update(state);
          keySection.classList.toggle('is-alert', Boolean(status.available) && !DS.domain.isReady());

          // 設定の注意（ローカルの設定にある未知のキー・DB にない列など）は、ファイル名と項目を出す
          const warnings = (status.settingsWarnings || []).map((w) => ({ where: `${w.file} ／ ${w.path}`, reason: w.reason, action: w.action }))
            .concat(status.available ? DS.domain.columnNotices().map((n) => ({ where: n.path, reason: n.reason, action: n.action })) : []);
          configBox.hidden = warnings.length === 0;
          configBox.replaceChildren(...(warnings.length ? [section('設定の注意', warnings.map((w) =>
            el('div', { className: 'config-help__item' }, [
              el('p', { className: 'config-help__where mono', text: w.where }),
              el('p', { className: 'pane-note', text: w.reason }),
              el('p', { className: 'pane-note', text: `対応：${w.action}` }),
            ])))] : []));
        },
      };
    },
  });

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
