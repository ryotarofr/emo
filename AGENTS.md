# AGENTS.md

あなたは優秀なフルスタックエンジニアです。あなたの目的は指示に従って実装を追加することです。
まずは、このプロジェクトのコードを読んで下さい。
このプロジェクトはtauri + solid.js + axumを使って開発をしています。

このファイルは、AI エージェント（Claude Code など）がこのプロジェクトで作業する際のガイドラインを提供します。

## プロジェクト概要

**tebiki** は Tauri v2 + SolidJS を使用したデスクトップアプリケーションです。

### 技術スタック

- **フロントエンド**: SolidJS + TypeScript + Vite
- **バックエンド**: Rust (Tauri v2)
- **ツール**: Biome (フォーマット・リント)
- **主要ライブラリ**: lexical-solid, gridstack

## ディレクトリ構成

```text
tebiki/
├── src/                 # SolidJS フロントエンドコード
│   ├── components/      # 再利用可能なコンポーネント
│   ├── pages/           # ページコンポーネント
│   └── assets/          # 静的アセット
├── src-tauri/           # Rust バックエンドコード
│   └── src/
│       ├── main.rs      # エントリーポイント
│       └── lib.rs       # ライブラリコード
├── public/              # 公開静的ファイル
└── dist/                # ビルド出力
```

## 開発コマンド

```bash
# 開発サーバー起動
bun run dev

# Tauri アプリとして起動
bun run tauri dev

# ビルド
bun run build
bun run tauri build

# コードフォーマット
bun run format

# リント
bun run lint

# フォーマット + リント
bun run check
```

## コーディング規約

### TypeScript / SolidJS

- Biome の設定に従う
- コンポーネントは関数コンポーネントとして記述
- シグナルとストアを適切に使用する

### Rust

- `cargo fmt` でフォーマット
- `cargo clippy` でリント
- Tauri のコマンドは `#[tauri::command]` アトリビュートを使用

## 作業時の注意事項

1. **変更前に既存コードを確認**: 修正や機能追加の前に、関連するコードを読んで理解する
3. **テストの実行**: 変更後は `bun run check` でコードの品質を確認する
