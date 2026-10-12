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
