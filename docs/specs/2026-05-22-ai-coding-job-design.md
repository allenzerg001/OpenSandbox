# AI Coding Job Design

## Overview

提供一个异步 HTTP 接口，从指定 snapshot 拉起 sandbox，在 sandbox 内执行完整的 AI coding 工作流（git pull → 写入 access keys → 执行 CLI → git push），完成后销毁 sandbox。异常时 pause sandbox 待人处理。

## Context

- 复用现有 `POST /v1/sandboxes`（snapshotId 模式）创建 sandbox
- 通过 server proxy（`/sandboxes/{id}/proxy/44772/...`）调用 execd API 执行命令
- 复用现有 `/v1/access-keys/{id}/reveal` 获取明文 key
- 单用户/全局模式，与 access keys 模块一致
- 架构模式与现有 snapshot repository 完全平行（Protocol + SQLite + Factory + FastAPI router）

## API

### 触发接口

```
POST /v1/jobs
```

**请求体：**
```json
{
  "snapshot_id": "snap-xxx",
  "repo_url": "https://token@github.com/org/repo.git",
  "repo_branch": "main",
  "provider": "openai"
}
```

- `snapshot_id`：用于拉起 sandbox 的 snapshot，必须处于 `Ready` 状态
- `repo_url`：包含认证 token 的 git 仓库 URL（如 `https://ghp_xxx@github.com/org/repo.git`）
- `repo_branch`：要 checkout 的分支
- `provider`：过滤 access keys 的 provider 名称，匹配该 provider 的所有 key 将写入 sandbox

**响应：** `202 Accepted`
```json
{
  "id": "job-uuid",
  "status": "Pending",
  ...
}
```

### 查询接口

```
GET /v1/jobs/{job_id}
```

**响应体：**
```json
{
  "id": "job-uuid",
  "status": "Paused",
  "current_step": "running_cli",
  "error": "CLI exited with code 1: command not found",
  "snapshot_id": "snap-xxx",
  "sandbox_id": "sbx-xxx",
  "repo_url": "https://****@github.com/org/repo.git",
  "repo_branch": "main",
  "provider": "openai",
  "created_at": "2026-05-22T10:00:00Z",
  "updated_at": "2026-05-22T10:05:00Z"
}
```

注意：`repo_url` 响应中脱敏（替换 token 为 `****`）。

两个接口均受现有 `AuthMiddleware` 保护（`OPEN-SANDBOX-API-KEY` header）。

## Data Model

### `jobs` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT (UUID) | 主键 |
| `snapshot_id` | TEXT NOT NULL | 来源 snapshot |
| `sandbox_id` | TEXT | sandbox 创建成功后填入 |
| `repo_url` | TEXT NOT NULL | 含 token 的 git URL（明文存储） |
| `repo_branch` | TEXT NOT NULL | 分支名 |
| `provider` | TEXT NOT NULL | access key provider 过滤 |
| `status` | TEXT NOT NULL | 状态枚举值 |
| `current_step` | TEXT | 当前/最后执行步骤 |
| `error` | TEXT | 失败/暂停时的错误信息 |
| `created_at` | TEXT NOT NULL | ISO8601 |
| `updated_at` | TEXT NOT NULL | ISO8601 |

## Job Status Machine

```
Pending
  → creating_sandbox   # 创建 sandbox，轮询直到 Running
  → git_pull           # git clone + checkout
  → writing_keys       # 获取 access keys，写入 /workspace/.env
  → running_cli        # 执行 CLI（当前 mock）
  → git_push           # qodercli /commit + git push
  → destroying         # DELETE sandbox
  → Succeeded          # 终态：成功
  → Paused             # 终态（待人处理）：步骤 2-5 任意失败
  → Failed             # 终态：sandbox 创建失败等不可恢复错误
```

`status` 字段的合法值：`Pending`, `Running`, `Succeeded`, `Failed`, `Paused`
`current_step` 字段记录当前或最后执行的步骤名。

## Execution Flow

工作流在 FastAPI server 内通过 `asyncio` 后台任务执行（`asyncio.create_task`），触发接口立即返回 job 记录。

```
Step 1: creating_sandbox
  - POST /v1/sandboxes {snapshotId, timeout: null}
  - 轮询 GET /v1/sandboxes/{id} 直到 status == "Running"（最多 60s，间隔 2s）
  - 失败/超时 → job status = Failed

Step 2: git_pull
  - POST /sandboxes/{id}/proxy/44772/command
    {"command": "git clone {repo_url} /workspace && cd /workspace && git checkout {branch}", "timeout": 120}
  - 等待完成，检查 exit_code == 0
  - 失败 → pause sandbox → job status = Paused

Step 3: writing_keys
  - 查询本服务 access_key_repository.list_all()，过滤 provider == job.provider
  - 对每个匹配的 key 调用 reveal（直接读取 repository，无需 HTTP）
  - 拼装 .env 内容：每行 `{NAME}_API_KEY={value}`（name 为 provider 大写）
    例：OPENAI_API_KEY=sk-xxx
  - POST /sandboxes/{id}/proxy/44772/files/workspace/.env（上传文件内容）
  - 失败 → pause sandbox → job status = Paused

Step 4: running_cli
  - POST /sandboxes/{id}/proxy/44772/command
    {"command": "echo 'mock cli done'", "timeout": 300}
  - mock 阶段命令固定为 echo；后续通过配置替换为真实 CLI
  - 失败（exit_code != 0）→ pause sandbox → job status = Paused

Step 5: git_push
  - 从 .env 文件中随机选取一个 access key 作为 qodercli 的认证凭证
  - POST /sandboxes/{id}/proxy/44772/command
    {"command": "cd /workspace && qodercli /commit && git push", "timeout": 120}
  - qodercli 会读取 .env 中的 key 来调用 LLM 生成 commit message 并执行 git commit
  - 失败 → pause sandbox → job status = Paused

Step 6: destroying
  - DELETE /v1/sandboxes/{id}
  - job status = Succeeded
```

## Access Key 文件格式

文件路径：`/workspace/.env.local`（仓库根目录）

格式：
```
QODER_TOKEN01=sk-xxx
QODER_TOKEN02=sk-yyy
```

- key 名称规则：`QODER_TOKEN` + 两位零填充序号（01, 02, 03...）
- 每行一个 key，按查询结果顺序排列

## Error Handling

| 场景 | 处理 |
|------|------|
| sandbox 创建失败或超时 | job `Failed`，无 sandbox 可 pause |
| step 2-5 命令 exit_code != 0 | pause sandbox，job `Paused`，记录步骤+错误输出 |
| execd proxy 连接失败 | pause sandbox，job `Paused`，记录错误 |
| server 重启时 job 处于 Running | 标记为 `Failed`（sandbox 可能仍在运行，需人工处理） |

## File Structure

### Backend (new files)
| 文件 | 职责 |
|------|------|
| `server/opensandbox_server/services/job_models.py` | `JobRecord` dataclass |
| `server/opensandbox_server/services/job_repository.py` | `JobRepository` Protocol |
| `server/opensandbox_server/repositories/jobs/__init__.py` | 包导出 |
| `server/opensandbox_server/repositories/jobs/sqlite.py` | SQLite 实现 |
| `server/opensandbox_server/repositories/jobs/factory.py` | 工厂函数 |
| `server/opensandbox_server/services/job_runner.py` | 工作流编排（asyncio 后台任务） |
| `server/opensandbox_server/api/jobs.py` | FastAPI router（POST + GET） |
| `server/tests/test_job_repository_sqlite.py` | repository 单元测试 |
| `server/tests/test_jobs_api.py` | API E2E 测试 |

## Out of Scope

- Job 列表接口（`GET /v1/jobs`）——后续按需添加
- 前端 UI 展示 job 状态——后续按需添加
- 真实 CLI 命令——当前 mock，后续配置化
- Job 重试机制
- 并发 job 限制
