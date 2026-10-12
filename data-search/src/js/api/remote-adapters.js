/* =========================================================
   本物のバックエンドへつなぐアダプター（Tauri 版・Python 版）。
   どちらも同じ命令名・同じ入出力を使う（04_api_spec.md）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  // ── Tauri 版 ──────────────────────────────────────────
  // tauri.conf.json で app.withGlobalTauri を true にすると window.__TAURI__ が使える。
  // Rust 側の命令は引数 request で受け取る想定： #[tauri::command] fn search_lots(request: SearchRequest)
  DS.api.adapters.register({
    id: 'tauri',
    order: 10,
    detect: () => Boolean(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke),
    create: () => ({
      mode: 'tauri',
      label: 'デスクトップ版',
      description: '共有データのコピー（キャッシュ）を検索しています。',
      capabilities: { refresh: true, sampleData: false },
      unreachableMessage: '検索の処理に接続できません。アプリを起動し直してください。',
      invoke: (command, payload) => window.__TAURI__.core.invoke(command, { request: payload }),
    }),
  });

  // ── Python 版 ─────────────────────────────────────────
  DS.api.adapters.register({
    id: 'http',
    order: 20,
    detect: () => window.location.protocol === 'http:' || window.location.protocol === 'https:',
    create: () => ({
      mode: 'http',
      label: 'Python 版',
      description: 'start.bat で起動したサーバーを通して、共有データのコピー（キャッシュ）を検索しています。',
      capabilities: { refresh: true, sampleData: false },
      unreachableMessage: '検索サーバーに接続できません。start.bat の黒いウィンドウが開いているか確認し、閉じていれば起動し直してください。',
      async invoke(command, payload) {
        const response = await fetch(`api/${command}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return response.json();
      },
    }),
  });
})();
