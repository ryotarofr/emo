# tebiki セルフブートストラップ戦略

> tebiki自身がAIパイプラインを使って、自分のプロダクト方針を決定し、機能を生産していくための設計

---

## コンセプト

tebikiは「AIエージェントのオーケストレーションツール」である。
であれば、**tebiki自身の開発もtebikiでオーケストレーションできるべき**。

これを実現するには、tebikiに「思考」「調査」「判断」「実行」「検証」のループを回せる能力を持たせる必要がある。

```
┌─────────────────────────────────────────────────┐
│              tebiki セルフループ                   │
│                                                   │
│   調査 ──→ 分析 ──→ 判断 ──→ 生成 ──→ 検証 ──┐  │
│    ↑                                           │  │
│    └───────────── フィードバック ←──────────────┘  │
│                                                   │
└─────────────────────────────────────────────────┘
```

---

## 現状の能力と不足

### できること（既存）

| 能力 | 実装状態 | 活用例 |
|---|---|---|
| 自身のコード読み取り | Folderパネルで可能 | コードベース分析、技術的負債の発見 |
| 多段AIパイプライン | pipelineEngine.ts | Expert1→Expert2→統合の多角分析 |
| 構造化ビジュアル出力 | Mermaidダイアグラム | アーキテクチャ図の自動生成 |
| テンプレート保存・再実行 | templateManager.ts | 分析パイプラインの再利用 |
| サブエージェント生成 | orchestration tools | 専門AIの動的作成 |

### できないこと（追加が必要）

| 能力 | 不足の影響 | 優先度 |
|---|---|---|
| Web情報の取得 | 市場・競合調査ができない | **P0** |
| ファイル書き出し | 生成したコード/仕様を保存できない | **P0** |
| コマンド実行 | ビルド・テスト・Lintが回せない | **P1** |
| Git操作 | 変更のコミット・PR作成ができない | **P1** |
| 外部API呼び出し | GitHub Issues等との連携ができない | **P2** |
| 自己評価メトリクス | 改善の効果を測定できない | **P2** |

---

## 追加すべき6つのツール（Tool）

tebikiのAIエージェントが使える「ツール」として、以下を実装する。
これらはAnthropicのtool use APIを介してLLMが呼び出せる形にする。

### Tool 1: `web_fetch` — Web情報取得

```typescript
// AIエージェントがWebページを取得・解析できるツール
interface WebFetchTool {
  name: "web_fetch"
  input: {
    url: string
    extract: "full" | "text" | "structured"  // 取得モード
    selector?: string                         // CSS selector で部分抽出
  }
  output: {
    content: string
    title: string
    metadata: Record<string, string>
  }
}
```

**用途**: 競合サービスの調査、技術トレンドの収集、ドキュメント参照

### Tool 2: `web_search` — Web検索

```typescript
interface WebSearchTool {
  name: "web_search"
  input: {
    query: string
    num_results?: number  // デフォルト: 10
    site?: string         // 特定サイトに限定
  }
  output: {
    results: Array<{
      title: string
      url: string
      snippet: string
    }>
  }
}
```

**用途**: 「AI orchestration dashboard 2026 trends」等で市場調査

### Tool 3: `file_write` — ファイル書き出し

```typescript
interface FileWriteTool {
  name: "file_write"
  input: {
    path: string          // 書き込み先パス
    content: string       // ファイル内容
    mode: "create" | "append" | "overwrite"
  }
  output: {
    success: boolean
    path: string
    bytes_written: number
  }
}
```

**用途**: 生成した仕様書・コード・設定ファイルのディスク保存

### Tool 4: `shell_exec` — コマンド実行（サンドボックス付き）

```typescript
interface ShellExecTool {
  name: "shell_exec"
  input: {
    command: string
    working_dir?: string
    timeout_ms?: number       // デフォルト: 30000
    allowed_commands?: string[] // ホワイトリスト制御
  }
  output: {
    stdout: string
    stderr: string
    exit_code: number
  }
}
```

**用途**: `bun run build`, `cargo test`, `biome check` 等の実行と結果確認

**セキュリティ**: ホワイトリスト方式で許可するコマンドを制限。デフォルトは読み取り系のみ。ユーザーが明示的に許可した場合のみ書き込み系コマンドを実行可能。

### Tool 5: `git_ops` — Git操作

```typescript
interface GitOpsTool {
  name: "git_ops"
  input: {
    action: "status" | "diff" | "add" | "commit" | "branch" | "log"
    args?: Record<string, string>
    // commit: { message, files }
    // branch: { name, from? }
    // add: { files }
  }
  output: {
    result: string
    success: boolean
  }
}
```

**用途**: 生成コードのコミット、ブランチ作成、差分確認

### Tool 6: `self_eval` — 自己評価

```typescript
interface SelfEvalTool {
  name: "self_eval"
  input: {
    check_type: "build" | "test" | "lint" | "type_check" | "bundle_size"
    baseline?: Record<string, number>  // 比較用ベースライン
  }
  output: {
    passed: boolean
    metrics: Record<string, number>    // エラー数、テスト通過率等
    details: string
    regression: boolean                // ベースラインより悪化したか
  }
}
```

**用途**: 変更前後の品質比較、リグレッション検出

---

## これらのツールで実現できるパイプライン

### パイプライン1: 市場調査 → 機能提案

```
[Web検索: "AI orchestration trends 2026"]
        ↓
[Web取得: 上位5記事の本文取得]
        ↓
[AI: 市場トレンド分析エージェント]
  "取得した記事から、AIオーケストレーション分野の
   トレンドTop5を抽出してください"
        ↓
[AI: 競合差分分析エージェント]
  "トレンドとtebikiの現状機能を比較し、
   追加すべき機能を優先順位付きで提案してください"
        ↓
[ファイル書き出し: doc/market-analysis-YYYY-MM.md]
```

### パイプライン2: コードベース自己分析 → 技術的負債レポート

```
[フォルダ読み取り: src/ (TypeScript)]
        ↓ (並列)
┌─[AI: アーキテクチャ分析エージェント]─┐
│  "コードの構造的問題を指摘して"      │
│                                      │
├─[AI: パフォーマンス分析エージェント]─┤
│  "パフォーマンスボトルネックを特定して"│
│                                      │
├─[AI: セキュリティ分析エージェント]───┤
│  "セキュリティリスクを洗い出して"     │
└──────────────────────────────────────┘
        ↓
[AI: 統合レポートエージェント]
  "3つの分析結果を統合し、
   優先度付きの改善計画を作成してください"
        ↓
[Mermaidダイアグラム: 改善ロードマップ可視化]
        ↓
[ファイル書き出し: doc/tech-debt-report.md]
```

### パイプライン3: 機能仕様 → コード生成 → 検証（自律開発ループ）

```
[入力: "Toast通知にアニメーションを追加"]
        ↓
[フォルダ読み取り: src/components/Toast.tsx]
        ↓
[AI: 仕様策定エージェント]
  "既存コードを読み、要求を満たす実装仕様を
   TypeScriptの型定義とともに出力してください"
        ↓
[AI: コード生成エージェント]
  "仕様に基づいてコードを生成してください。
   既存のコードスタイルに合わせてください"
        ↓
[ファイル書き出し: 生成コードを該当ファイルに書き込み]
        ↓
[コマンド実行: bun run check]  ← 型チェック + Lint
        ↓
  ┌── 成功 → [Git: commit -m "feat: add toast animation"]
  │
  └── 失敗 → [AI: エラー修正エージェント] → (ループ: 最大3回)
                "以下のエラーを修正してください: {stderr}"
```

### パイプライン4: 週次セルフレビュー（定期実行）

```
[Git: log --since="1 week ago"]
        ↓
[フォルダ読み取り: src/ の変更ファイル]
        ↓
[AI: 週次レビューエージェント]
  "今週の変更を分析し、以下を報告してください:
   1. 追加された機能の要約
   2. 技術的リスク
   3. 来週やるべきこと
   4. プロダクトロードマップとの整合性"
        ↓
[自己評価: build + test + lint + bundle_size]
        ↓
[AI: ロードマップ更新エージェント]
  "レビュー結果とメトリクスに基づいて
   doc/strategy.md のロードマップを更新してください"
        ↓
[ファイル書き出し: doc/weekly-review-YYYY-WW.md]
```

---

## 実装のアーキテクチャ

### ツールの実装場所

```
src-tauri/src/
├── tools/                    # 新規ディレクトリ
│   ├── mod.rs               # ツールレジストリ
│   ├── types.rs             # ToolDefinition, ToolInput, ToolOutput
│   ├── web_fetch.rs         # reqwestベースのWeb取得
│   ├── web_search.rs        # 検索API連携 (SerpAPI / Brave Search)
│   ├── file_write.rs        # Tauriファイルシステム書き込み
│   ├── shell_exec.rs        # tokio::process::Command
│   ├── git_ops.rs           # git2-rs クレート活用
│   └── self_eval.rs         # ビルド/テスト結果の構造化
├── llm/
│   ├── mod.rs               # 既存: プロバイダーレジストリ
│   ├── types.rs             # ToolDefinition を追加
│   └── anthropic.rs         # tool_use パラメータ対応を追加
```

### LLMへのツール提供フロー

```
1. パイプライン実行開始
2. AIパネルに到達
3. パネル設定から有効なツールリストを取得
4. LLM APIリクエストに tools パラメータを付与
5. LLMが tool_use レスポンスを返す
6. Rustバックエンドでツールを実行
7. 結果をLLMに返す（tool_result）
8. LLMが最終回答を生成
9. 次のパネルへ出力を渡す
```

### セキュリティモデル

```
ツール実行の3層ガード:

Layer 1: パネル設定
  - 各AIパネルで有効にするツールを明示的に選択
  - デフォルトは全ツール無効

Layer 2: ワークスペース設定
  - file_write の許可ディレクトリ（allowlist）
  - shell_exec の許可コマンド（allowlist）
  - git_ops の許可操作（read-only / read-write）

Layer 3: 実行時確認（Human-in-the-Loop）
  - 破壊的操作（ファイル上書き、git push）は承認フロー経由
  - 既存のオーケストレーション承認UIを再利用
```

---

## 実装優先順位

### Phase 1: 調査能力（tebikiが「考える」ための目と耳）

| # | ツール | 工数目安 | 依存 |
|---|---|---|---|
| 1 | `web_fetch` | Rust: reqwest + HTML→text変換 | なし |
| 2 | `web_search` | Brave Search API連携 | なし |
| 3 | LLM tool_use 対応 | Anthropic APIのtoolsパラメータ統合 | なし |

**Phase 1完了で可能になること**: 市場調査パイプライン、競合分析の自動化

### Phase 2: 出力能力（tebikiが「手を動かす」ための手足）

| # | ツール | 工数目安 | 依存 |
|---|---|---|---|
| 4 | `file_write` | Tauri FSプラグイン拡張 | Phase 1 |
| 5 | `shell_exec` | tokio::process + サンドボックス | Phase 1 |
| 6 | `git_ops` | git2-rs or shell経由 | Tool 5 |

**Phase 2完了で可能になること**: コード生成→ファイル保存→ビルド検証の自動化

### Phase 3: 自律ループ（tebikiが「学ぶ」ための記憶と反省）

| # | ツール | 工数目安 | 依存 |
|---|---|---|---|
| 7 | `self_eval` | Tool 5のラッパー + メトリクス構造化 | Phase 2 |
| 8 | パイプラインスケジューラ | cron的な定期実行 | Phase 2 |
| 9 | 実行履歴→学習フィードバック | 過去の成功/失敗パターン参照 | Phase 2 |

**Phase 3完了で可能になること**: 週次セルフレビュー、自律的な改善提案

---

## ゴールイメージ

```
Phase 1 完了後:
  tebikiが「次に何を作るべきか」を自分で調査・提案できる

Phase 2 完了後:
  tebikiが提案した機能を、自分でコード生成・保存・検証できる

Phase 3 完了後:
  tebikiが定期的に自分を評価し、改善サイクルを自律的に回せる
```

最終的に、開発者（あなた）の役割は：
- パイプラインの承認・却下（Human-in-the-Loop）
- 品質の最終判断
- プロダクトビジョンの方向づけ

**tebikiが自分で考え、手を動かし、学ぶ。人間はビジョンを示し、承認する。**
