# OpenSandbox UI 设计规格

> 本文档基于 OpenSandbox Lifecycle API（OpenAPI 3.1.0，`specs/sandbox-lifecycle.yml`）整理，定义管理界面所需的页面结构、字段清单与操作集合，确保功能完整闭环。

## 目录

- [全局约定](#全局约定)
- [页面总览](#页面总览)
- [P1 沙箱列表](#p1-沙箱列表)
- [P2 创建沙箱](#p2-创建沙箱)
- [P3 沙箱详情](#p3-沙箱详情)
- [P4 快照列表](#p4-快照列表)
- [P5 快照详情](#p5-快照详情)
- [功能闭环路径](#功能闭环路径)
- [状态机参考](#状态机参考)

---

## 全局约定

### 连接配置

| 字段 | 说明 |
|------|------|
| Server URL | 目标服务地址，默认 `http://127.0.0.1:8080`，持久化到本地 |
| API Key | 可选，填入后附加到所有请求头 `OPEN-SANDBOX-API-KEY` |

### 状态颜色规范

| 状态 | 颜色 | 含义 |
|------|------|------|
| `Pending` | 灰色 | 正在调度 |
| `Running` | 绿色 | 正常运行 |
| `Pausing` | 黄色 | 暂停中（过渡态） |
| `Paused` | 蓝色 | 已暂停 |
| `Resuming` | 黄色 | 恢复中（过渡态） |
| `Stopping` | 橙色 | 停止中（过渡态） |
| `Terminated` | 灰色 | 已终止 |
| `Failed` | 红色 | 失败 |

**过渡态（Pending / Pausing / Resuming / Stopping）** 应显示 loading spinner，并对当前不可用的操作按钮置灰。

### 异步轮询规则

所有返回 `202 Accepted` 的操作（创建、暂停、恢复、删除、创建快照）需在 UI 侧轮询 `GET /sandboxes/{id}` 或 `GET /snapshots/{id}`，直到状态到达终态，轮询间隔建议 2s，超时 5min。

---

## 页面总览

```
├── P1  沙箱列表          /sandboxes
│   └── P2  创建沙箱      （抽屉/弹窗）
│
├── P3  沙箱详情          /sandboxes/:id
│   ├── Tab：概览
│   ├── Tab：Metadata 编辑
│   ├── Tab：端点访问
│   ├── Tab：日志
│   └── Tab：快照
│
├── P4  快照列表          /snapshots
└── P5  快照详情          /snapshots/:id
```

---

## P1 沙箱列表

**对应接口：** `GET /v1/sandboxes`

### 过滤栏

| 字段 | 控件 | API 参数 | 说明 |
|------|------|---------|------|
| 状态 | 多选 checkbox | `state[]` | 多个状态取 OR，不选则不过滤 |
| Metadata | key=value 输入 | `metadata` | URL encoded，如 `project=foo` |
| 每页数量 | 下拉 select | `pageSize` | 可选值：10 / 20 / 50 / 100，最大 200 |
| 页码 | 分页控件 | `page` | 从 1 开始 |

### 操作栏

| 按钮 | 行为 |
|------|------|
| 创建沙箱 | 打开 P2 创建表单 |
| 刷新 | 重新请求列表 |
| 批量删除 | 勾选后批量调用 `DELETE /sandboxes/{id}` |

### 列表列

| 列名 | 字段路径 | 备注 |
|------|---------|------|
| Sandbox ID | `sandboxId` | 可一键复制 |
| 镜像 | `image.image`:`image.tag` | tag 缺省时不显示冒号 |
| 状态 | `status.state` | 彩色 badge |
| 状态消息 | `status.message` | 悬停 tooltip 展示 |
| 创建时间 | `createdAt` | 本地时区格式化 |
| 过期时间 | `expiresAt` | 距过期 < 10min 时红色提示 |
| Metadata | `metadata` | 最多展示 3 个 key badge，超出显示 +N |
| 操作 | — | 见下表 |

### 行内操作（依状态动态启用）

| 操作 | 可用状态 | 调用接口 |
|------|---------|---------|
| 暂停 | `Running` | `POST /sandboxes/{id}/pause` |
| 恢复 | `Paused` | `POST /sandboxes/{id}/resume` |
| 创建快照 | `Running` | `POST /sandboxes/{id}/snapshots` |
| 续期 | `Running`、`Paused` | `POST /sandboxes/{id}/renew-expiration`，弹窗选择新过期时间 |
| 获取端点 | `Running` | 弹窗输入端口，调用 `GET /sandboxes/{id}/endpoints/{port}` |
| 删除 | 非过渡态 | `DELETE /sandboxes/{id}`，二次确认弹窗 |
| 查看详情 | 任意 | 跳转 P3 |

---

## P2 创建沙箱

**对应接口：** `POST /v1/sandboxes`（返回 202）

表单分为若干可折叠区块，标注 `*` 为必填项。

### 镜像配置（必填）

| 字段 | 控件 | API 路径 | 说明 |
|------|------|---------|------|
| 镜像名 `*` | 文本输入 | `image.image` | 如 `python`、`ubuntu` |
| Tag | 文本输入 | `image.tag` | 如 `3.11`、`latest` |
| Digest | 文本输入 | `image.digest` | 可选，sha256:... |

### 镜像凭证（折叠，默认收起）

| 字段 | 控件 | API 路径 |
|------|------|---------|
| Registry 地址 | 文本输入 | `image.credentials.server` |
| 用户名 | 文本输入 | `image.credentials.username` |
| 密码 | 密码输入 | `image.credentials.password` |

### 平台（折叠，默认收起）

| 字段 | 控件 | API 路径 | 说明 |
|------|------|---------|------|
| OS | 下拉 | `image.platform.os` | `linux`（默认）、`windows` |
| Arch | 下拉 | `image.platform.arch` | `amd64`（默认）、`arm64` |

### 运行参数（折叠，默认收起）

| 字段 | 控件 | API 路径 | 说明 |
|------|------|---------|------|
| Command | 文本输入 | `command` | 覆盖镜像 entrypoint |
| Args | 多行列表 | `args` | 逐行输入，支持添加/删除行 |
| 工作目录 | 文本输入 | `workdir` | 如 `/app` |

### 资源限制（折叠，默认收起）

| 字段 | 控件 | API 路径 | 示例 |
|------|------|---------|------|
| CPU | 文本输入 | `resources.cpu` | `1`、`500m` |
| 内存 | 文本输入 | `resources.memory` | `512Mi`、`2Gi` |

### 环境变量（动态列表）

| 字段 | 控件 | API 路径 |
|------|------|---------|
| Key | 文本输入 | `envs[n].name` |
| Value | 文本输入 | `envs[n].value` |
| — | 添加行 / 删除行按钮 | — |

### 过期时间

| 字段 | 控件 | API 路径 | 说明 |
|------|------|---------|------|
| 过期时间 | 日期时间选择器 | `expiresAt` | ISO 8601，留空则服务端使用默认值 |

### 网络策略（折叠，默认收起）

**Ingress 规则列表：**

| 字段 | 控件 | API 路径 |
|------|------|---------|
| 端口 | 数字输入 1-65535 | `networkPolicy.ingress[n].port` |
| 协议 | 下拉 TCP/UDP | `networkPolicy.ingress[n].protocol` |
| CIDR | 文本输入 | `networkPolicy.ingress[n].cidr` |

**Egress 规则列表：** 同 Ingress 结构，字段路径前缀为 `networkPolicy.egress`。

### 挂载卷（折叠，Tab 切换类型）

**Host Path：**

| 字段 | 控件 | API 路径 |
|------|------|---------|
| 宿主机路径 | 文本输入 | `volumes[n].host.host_path` |
| 挂载路径 | 文本输入 | `volumes[n].host.mount_path` |
| 只读 | 开关 | `volumes[n].host.readonly` |

**PVC：**

| 字段 | 控件 | API 路径 |
|------|------|---------|
| PVC 名称 | 文本输入 | `volumes[n].pvc.name` |
| 挂载路径 | 文本输入 | `volumes[n].pvc.mount_path` |
| 只读 | 开关 | `volumes[n].pvc.readonly` |
| 大小 | 文本输入 | `volumes[n].pvc.size` |

**OSSFS：**

| 字段 | 控件 | API 路径 |
|------|------|---------|
| Bucket | 文本输入 | `volumes[n].ossfs.bucket` |
| 挂载路径 | 文本输入 | `volumes[n].ossfs.mount_path` |

### Metadata / Labels（动态列表）

| 字段 | 控件 | API 路径 | 说明 |
|------|------|---------|------|
| Key | 文本输入 | `metadata.key` | string |
| Value | 文本输入 | `metadata.value` | string |

Labels 结构同上，字段路径前缀为 `labels`。

---

## P3 沙箱详情

**对应接口：** `GET /v1/sandboxes/{id}`

顶部操作栏与 P1 行内操作一致（按状态启用/禁用），状态为过渡态时显示 spinner 并自动轮询刷新。

### Tab 1 — 概览

| 区块 | 字段 |
|------|------|
| 基本信息 | `sandboxId`、`status.state`（badge）、`status.message`、`createdAt`、`expiresAt` |
| 镜像 | `image.image`:`image.tag`、`image.digest`、`image.platform.os`/`arch` |
| 资源 | `resources.cpu`、`resources.memory` |
| 运行参数 | `command`、`args`、`workdir` |
| 环境变量 | 列表展示所有 `envs` |
| 网络策略 | Ingress/Egress 规则列表 |
| 挂载卷 | 按类型（Host/PVC/OSSFS）分组展示 |
| Labels | badge 列表 |
| Metadata | key-value 展示 |

### Tab 2 — Metadata 编辑

**对应接口：** `PATCH /v1/sandboxes/{id}/metadata`（JSON Merge Patch RFC 7396）

| 元素 | 说明 |
|------|------|
| key-value 编辑列表 | 支持修改 value、删除行（发送 `null` value）、新增行 |
| 保存按钮 | 仅发送有变更的字段，成功后刷新展示 |
| 操作说明提示 | "非 null 值添加/更新，null 值删除对应 key" |

> 注意：该接口无乐观锁，并发 PATCH 可能丢失更新，UI 应给出提示。

### Tab 3 — 端点访问

**对应接口：** `GET /v1/sandboxes/{id}/endpoints/{port}`

| 字段 | 控件 | API 参数 | 说明 |
|------|------|---------|------|
| 端口号 | 数字输入 1-65535 | path `port` | 沙箱内监听端口 |
| 使用 Server Proxy | 开关 | `use_server_proxy` | 返回服务器代理 URL |
| Token 过期时间 | 数字输入（Unix 时间戳） | `expires` | 填写后返回签名 token，需要 ingress gateway 支持 |
| 查询按钮 | — | — | 触发请求 |
| 结果 URL | 文本展示 | `url` | 可点击打开，可复制 |
| Token | 文本展示（折叠） | `token` | 仅 expires 填写时有值 |

### Tab 4 — 日志

**对应接口：** `GET /v1/sandboxes/{id}/diagnostics/logs`

| 字段 | 控件 | API 参数 | 说明 |
|------|------|---------|------|
| Scope | 下拉 select | `scope` | `execd`（执行守护进程）、`egress`（出口策略）等 |
| 查看行数 | 数字输入 1-10000 | `tail` | 仅 scope 为空（旧接口）时生效 |
| 时间范围 | 文本输入 | `since` | 仅旧接口生效，如 `10m`、`1h` |
| 刷新按钮 | — | — | 手动刷新 |
| 日志区域 | 等宽滚动文本区 | — | 支持关键词高亮搜索 |

### Tab 5 — 快照

**对应接口：**
- `GET /v1/snapshots?sandboxId={id}` — 列表
- `POST /v1/sandboxes/{id}/snapshots` — 创建

| 元素 | 说明 |
|------|------|
| 创建快照按钮 | 仅 `Running` 状态可点，点击弹窗填写可选字段后提交 |
| 快照列表 | 见 P4 列表结构（过滤已固定为当前沙箱） |
| 轮询进度 | 创建后对 `Pending` 状态快照展示 spinner |

**创建快照弹窗字段：**

| 字段 | 控件 | API 路径 | 说明 |
|------|------|---------|------|
| 快照名称 | 文本输入 | `name` | 可选 |
| Metadata | 动态 key-value | `metadata` | 可选标注信息 |

---

## P4 快照列表

**对应接口：** `GET /v1/snapshots`

### 过滤栏

| 字段 | 控件 | API 参数 |
|------|------|---------|
| Sandbox ID | 文本输入 | `sandboxId` |
| 状态 | 多选 checkbox | `state[]`：`Pending`、`Ready`、`Failed`、`Deleting` |
| 每页数量 | 下拉 | `pageSize` |
| 页码 | 分页控件 | `page` |

### 列表列

| 列名 | 字段路径 | 备注 |
|------|---------|------|
| Snapshot ID | `snapshotId` | 可复制 |
| 来源 Sandbox ID | `sandboxId` | 可点击跳转 P3 |
| 状态 | `status.state` | badge |
| 创建时间 | `createdAt` | 本地时区 |
| Metadata | `metadata` | badge 摘要 |
| 操作 | — | 见下表 |

### 行内操作

| 操作 | 可用状态 | 接口 |
|------|---------|------|
| 查看详情 | 任意 | 跳转 P5 |
| 删除 | `Ready`、`Failed` | `DELETE /v1/snapshots/{id}`，二次确认 |

---

## P5 快照详情

**对应接口：** `GET /v1/snapshots/{id}`

| 区块 | 字段 |
|------|------|
| 基本信息 | `snapshotId`、`status.state`（badge）、`status.message`、`createdAt` |
| 来源沙箱 | `sandboxId`（链接，点击跳转 P3） |
| Metadata | key-value 只读展示 |
| 操作 | 删除（仅 `Ready`/`Failed` 状态，二次确认） |

---

## 功能闭环路径

以下流程覆盖所有核心操作，UI 需保证每一步可达且操作结果可观测：

```
1. 创建沙箱（P2）
        ↓ 轮询状态 Pending → Running
2. 查看详情（P3 Tab 概览）
        ↓
3. 端点访问（P3 Tab 端点访问）→ 在浏览器打开沙箱内服务
        ↓
4. 编辑 Metadata（P3 Tab Metadata 编辑）
        ↓
5. 续期过期时间（P3 顶部操作栏）
        ↓
6. 创建快照（P3 Tab 快照 → 创建）
        ↓ 轮询快照状态 Pending → Ready
7. 查看快照（P4 快照列表 / P5 快照详情）
        ↓
8. 暂停沙箱（P3 顶部操作栏）
        ↓ 轮询 Pausing → Paused
9. 恢复沙箱（P3 顶部操作栏）
        ↓ 轮询 Resuming → Running
       ↓
10. 删除沙箱（P1 列表或 P3 顶部）
        ↓ 轮询 Stopping → Terminated
11. 删除快照（P4 列表或 P5 详情）
```

---

## 状态机参考

```
                  ┌─────────┐
        创建      │ Pending │
  ─────────────▶  └────┬────┘
                       │ 调度成功
                  ┌────▼────┐
                  │ Running │ ◀─────────────────────┐
                  └──┬──┬───┘                       │
           pause  │  │  │ delete               resume│
                  │  │  └──────────────────────────┐ │
                  ▼  │                             │ │
           ┌────────┐│                      ┌──────┴─┤
           │Pausing ││                      │Resuming│
           └───┬────┘│                      └────────┘
               │     │                          ▲
           ┌───▼────┐│ resume                   │
           │ Paused ├┴──────────────────────────┘
           └────────┘
                  ┌──────────┐
                  │ Stopping │
                  └────┬─────┘
                       │
           ┌───────────┴──────────┐
           │                      │
    ┌──────▼──────┐       ┌───────▼──┐
    │ Terminated  │       │  Failed  │
    └─────────────┘       └──────────┘
```

**快照状态：** `Pending` → `Ready` | `Failed` → （删除）→ `Deleting`

---

*文档生成日期：2026-05-21 | 基于 OpenSandbox Lifecycle API v0.1.0*
