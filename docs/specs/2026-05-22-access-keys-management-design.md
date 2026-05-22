# Access Keys Management Design

## Overview

为 sandbox 内运行的 coding CLI（如 qodercli）提供 AI provider access key 管理功能。本阶段只做 key 的 CRUD 管理，注入 sandbox 的机制后续设计。

## Context

- 当前系统使用单个全局 `OPEN-SANDBOX-API-KEY` 认证管控 API
- Sandbox 内的 coding CLI 需要多个 AI provider key 才能工作
- 单用户/全局模式，无需多租户隔离

## Data Model

### `access_keys` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT (UUID) | 主键 |
| `provider` | TEXT | provider 类型 |
| `name` | TEXT (UNIQUE) | 用户自定义名称，方便识别 |
| `api_key` | TEXT | 实际的 key 值（明文存储） |
| `base_url` | TEXT (nullable) | 可选的自定义 base URL |
| `created_at` | TEXT (ISO8601) | 创建时间 |
| `updated_at` | TEXT (ISO8601) | 更新时间 |

### 预设 Provider 列表

- `openai`
- `anthropic`
- `google`
- `deepseek`
- `qoder`
- `custom`（自定义时用户填写 provider 名称）

### 约束

- `name` 字段唯一
- 一个 provider 可以有多个 key
- 选择 "Custom" 时，`provider` 字段存储用户输入的自定义名称（如 `"my-llm-service"`），而非字面 `"custom"`。"Custom" 仅为前端下拉选项的 UI 概念。

## Backend API

路由前缀：`/v1/access-keys`，受现有 `AuthMiddleware` 保护。

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/access-keys` | 创建 access key |
| `GET` | `/v1/access-keys` | 列出所有 access keys（`api_key` 脱敏） |
| `GET` | `/v1/access-keys/{id}` | 获取单个 key 详情（`api_key` 脱敏） |
| `PUT` | `/v1/access-keys/{id}` | 更新 key |
| `DELETE` | `/v1/access-keys/{id}` | 删除 key |
| `GET` | `/v1/access-keys/{id}/reveal` | 返回完整明文 `api_key` |

### 请求体（POST/PUT）

```json
{
  "provider": "openai",
  "name": "My OpenAI Key",
  "api_key": "sk-xxxx...",
  "base_url": null
}
```

### 响应体（列表/详情，脱敏）

```json
{
  "id": "uuid-xxx",
  "provider": "openai",
  "name": "My OpenAI Key",
  "api_key": "****xxxx",
  "base_url": null,
  "created_at": "2026-05-22T10:00:00Z",
  "updated_at": "2026-05-22T10:00:00Z"
}
```

### 响应体（reveal，明文）

```json
{
  "id": "uuid-xxx",
  "provider": "openai",
  "name": "My OpenAI Key",
  "api_key": "sk-xxxxxxxxxxxxxxxxxxxx",
  "base_url": null,
  "created_at": "2026-05-22T10:00:00Z",
  "updated_at": "2026-05-22T10:00:00Z"
}
```

### 脱敏规则

- 显示 `****` + key 最后 4 位字符
- 如果 key 长度 <= 4，全部显示为 `****`

## Frontend UI

### 页面位置

侧边栏新增 "Access Keys" 菜单项（与 Sandboxes、Snapshots 同级）。

路由：`/access-keys`

### 列表视图

- 表格列：Name、Provider（Ant Design Tag 带颜色）、API Key（脱敏）、Base URL、创建时间、操作
- 操作列：查看明文（眼睛图标 toggle）、编辑、删除
- 顶部右侧 "Add Key" 按钮

### 新增/编辑（Drawer）

- Provider 下拉选择（预设列表 + "Custom" 选项）
- 选择 Custom 时显示自定义 provider 名称输入框
- Name 输入框
- API Key 输入框（password 类型，可切换显示）
- Base URL 输入框（可选）

### 交互细节

- 点击眼睛图标 → 调用 `/reveal` → toggle 显示/隐藏明文
- 删除前 Popconfirm 确认
- Provider Tag 颜色映射：openai=green, anthropic=orange, google=blue, deepseek=purple, qoder=cyan, custom=default

## Storage Layer

### 新增文件

- `server/opensandbox_server/store/access_key_store.py`

### 核心方法

- `create_table()` — 建表（应用启动时调用）
- `create(provider, name, api_key, base_url) -> AccessKey`
- `list_all() -> list[AccessKey]`
- `get_by_id(id) -> AccessKey | None`
- `update(id, **fields) -> AccessKey`
- `delete(id) -> bool`

### 集成

- 在 `main.py` 的 lifespan 启动阶段调用 `create_table()`
- Store 实例在 API router 中实例化，与现有模式对齐

## Tech Stack

- **后端**: FastAPI + SQLite（与现有一致）
- **前端**: React 19 + TypeScript + Ant Design v6 + Vite（与现有一致）

## Out of Scope

- Key 注入到 sandbox 的机制（后续设计）
- 多用户/租户隔离
- Key 加密存储
- Key 用量统计/审计日志
