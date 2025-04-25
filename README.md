# MCP Task Scheduler

## 概要

このプロジェクトは、Model Context Protocol (MCP) を利用したタスクスケジューリングアプリケーションのサンプルです。ユーザーが自然言語でタスクを入力すると、AI (Google Gemini) がサブタスクに分解し、Google ドキュメントに計画を出力、Google カレンダーの空き時間を見つけてスケジュールを登録します。

クライアント・サーバーモデルを採用しており、サーバーは MCP サーバーとして機能し、クライアントは CLI (コマンドラインインターフェース) で操作します。

## 機能

-   自然言語によるタスク入力
-   Gemini API を利用したサブタスクへの自動分解と所要時間見積もり
-   Google ドキュメントへの計画リスト自動生成
-   Google カレンダーの空き時間に基づいた自動スケジューリング (Earliest-Fit アルゴリズム)
-   タスク間のバッファ時間設定
-   CLI による対話的な操作（サブタスク確認ステップあり）
-   Google OAuth 2.0 による安全な認証

## 技術スタック

-   Node.js
-   TypeScript
-   Model Context Protocol SDK (`@modelcontextprotocol/sdk`)
-   Google Gemini API (`@google/generative-ai`)
-   Google Docs API (`googleapis`)
-   Google Calendar API (`googleapis`)
-   Google Authentication Library (`google-auth-library`, `@google-cloud/local-auth`)
-   Zod (スキーマ検証)
-   Dotenv (環境変数管理)

## 前提条件

-   Node.js (v18 以降推奨)
-   npm (Node.js に同梱)
-   Google Cloud Platform プロジェクト
-   Google Cloud プロジェクトで有効化された以下の API:
    -   Google Docs API
    -   Google Calendar API
-   OAuth 2.0 クライアント ID (タイプ: **デスクトップ アプリ**)
    -   Google Cloud Console の「API とサービス」->「認証情報」で作成します。
    -   作成した認証情報の JSON ファイルをダウンロードしておきます。
-   Gemini API キー
    -   [Google AI Studio](https://aistudio.google.com/app/apikey) などで取得します。

## セットアップ手順

1.  **リポジトリのクローン:**
    ```bash
    git clone <リポジトリURL>
    cd <リポジトリ名>
    ```

2.  **依存関係のインストール:**
    ```bash
    npm install
    ```

3.  **環境変数の設定:**
    *   プロジェクトのルートディレクトリに `.env` という名前のファイルを作成します。
    *   Google Cloud Console からダウンロードした OAuth 2.0 クライアント ID の JSON ファイルを、プロジェクトのルートディレクトリに配置します。ファイル名は任意ですが、後で `.env` ファイルに指定します。
    *   `.env` ファイルに以下の内容を記述し、取得した Gemini API キーと、配置したクライアントシークレットファイルの **ファイル名** を設定します。
        ```dotenv
        # Gemini API Key
        GEMINI_API_KEY=YOUR_GEMINI_API_KEY

        # Path to your Google Cloud OAuth 2.0 Client ID file (relative to project root)
        # Replace 'client_secret_xxxxxxxx.apps.googleusercontent.com.json'
        # with the actual filename of the JSON key file you downloaded and placed in the root.
        GOOGLE_CREDENTIALS_PATH=client_secret_xxxxxxxx.apps.googleusercontent.com.json
        ```
    *   **注意:** `.env` ファイルおよびクライアントシークレットの JSON ファイルは機密情報です。`.gitignore` に `.env` と `*.json` (または具体的なファイル名パターン) が含まれていることを確認し、Git リポジトリにコミットしないでください。

4.  **ビルド:**
    *   TypeScript コードを JavaScript にコンパイルします。
        ```bash
        npm run build
        ```
    *   これにより `dist` ディレクトリに必要なファイルが生成されます。

5.  **初回 Google 認証:**
    *   初めてクライアントを実行する際、Google Docs および Calendar へのアクセス許可を求める認証フローが開始されます。
    *   サーバー（クライアント内部で起動）のコンソールに認証用 URL が表示されるので、ブラウザで開き、指示に従って Google アカウントでログインし、アクセスを許可してください。
    *   **重要:** アプリが Google の審査を受けていないため、「確認されていないアプリ」という警告が表示される場合があります。アクセスを許可するには、ご自身の Google アカウントを Google Cloud Console の「OAuth 同意画面」->「テストユーザー」に追加する必要があります。（詳細は [Google Cloud ドキュメント](https://developers.google.com/identity/protocols/oauth2/web-server#handlingresponse) 等を参照）
    *   認証に成功すると、アクセストークン（リフレッシュトークン含む）がプロジェクトルートに `token.json` として保存され、次回以降はこのファイルが使用されます。
    *   スコープを変更した場合など、再認証が必要な場合は `token.json` を削除してから再度実行してください。

## 使い方

1.  **サーバーの起動 (バックグラウンド):**
    *   以下のコマンドを実行して MCP サーバーを起動します。クライアントからの接続を待ち受けます。
        ```bash
        npm run start
        ```
    *   **注意:** クライアントを実行する前に、サーバーが起動している必要があります。

2.  **クライアントの実行:**
    *   別のターミナルを開き、以下の形式でコマンドを実行します。
        ```bash
        npm run client "<計画・スケジュールしたいタスクの説明>"
        ```
        **例:**
        ```bash
        npm run client "来週のチームミーティングの準備をする"
        ```

3.  **実行フロー:**
    *   クライアントがサーバーに接続し、`plan_task` ツールを呼び出します。
    *   サーバーが Gemini API を呼び出し、サブタスクリストを生成します。
    *   クライアントが生成されたサブタスクリストをコンソールに表示します。
    *   コンソールに `Do you want to schedule these tasks? (Y/n):` と表示され、確認を求められます。
        *   `y` または `Y` (または Enter) を入力すると、スケジューリング処理に進みます。
        *   `n` または `N` を入力すると、処理をキャンセルして終了します。
    *   スケジュールが選択されると、クライアントは `schedule_tasks` ツールを呼び出します。
    *   サーバーが Google Docs に計画を作成し、Google Calendar にサブタスクをスケジュールします。
    *   クライアントが最終結果（Google Docs の URL、スケジュール結果の概要）をコンソールに表示します。

4.  **結果の確認:**
    *   コンソールに出力された Google Docs の URL にアクセスして計画内容を確認します。
    *   ご自身の Google Calendar を確認し、タスクがスケジュールされているか確認します。

## 設定項目 (オプション)

以下の項目は必要に応じてソースコード内で直接変更できます。

-   **スケジューリング設定 (`src/server.ts`):**
    -   `SCHEDULING_START_OFFSET_DAYS`: 何日後からスケジュール検索を開始するか。
    -   `SCHEDULING_WINDOW_DAYS`: 何日間の範囲で空き時間を検索するか。
    -   `SCHEDULING_WORK_DAY_START_HOUR` / `SCHEDULING_WORK_DAY_END_HOUR`: スケジュール対象とする作業時間帯。
    -   `SCHEDULING_BUFFER_MINUTES`: タスク間に挿入するバッファ時間。
-   **Gemini モデル (`src/server.ts`):**
    -   `geminiModel = genAI.getGenerativeModel({ model: "..." })` の `model` 名。
-   **Google API スコープ (`src/auth.ts`):**
    -   `SCOPES` 配列に必要な権限を追加・変更できます（変更後は `token.json` の削除が必要）。

## 注意点

-   **API キー・認証情報ファイルの管理:** `.env` ファイルおよび Google Cloud からダウンロードしたクライアントシークレットの JSON ファイル (`.json`) は絶対に公開しないでください。`.gitignore` で適切に除外してください。
-   **Google 認証:** 初回認証フローとテストユーザー登録が必要です。
-   **エラーハンドリング:** API のレート制限や予期せぬエラーが発生する可能性があります。エラーメッセージを確認し、必要に応じて時間をおいて再試行してください。
-   **進捗通知:** 現在、サーバーからクライアントへのリアルタイム進捗通知機能は実装されていません（コードはコメントアウトされています）。 