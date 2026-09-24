# 主进程网络代码迁移 Python 后端 — 设计与实施计划

- 日期：2026-09-24
- 状态：**已实施**（2026-09-24，决策点取推荐值：①token 后端托管 ②vehicle 同步改名 ③单 router）
- 影响范围：`src/main/`、`src/preload/`、`python/`、航班追踪/车辆追踪/地点搜索前端服务层

---

## 1. 背景与问题

当前有三块业务网络代码住在 Electron 主进程：

| 文件                        | 行数 | 功能                                      | 协议                |
| --------------------------- | ---- | ----------------------------------------- | ------------------- |
| `src/main/opensky.ts`       | 177  | OpenSky OAuth2 + adsb.fi 航班查询         | HTTPS 请求/响应     |
| `src/main/geocoding.ts`     | 176  | Nominatim 搜索 + Photon 降级              | HTTPS 请求/响应     |
| `src/main/vehicleServer.ts` | 193  | 车辆追踪客户端（TCP 持久连接 / UDP 监听） | 原生 TCP/UDP 推送流 |

带来的问题：

1. **两套 HTTP 栈并存**。主进程用 Node `https` 手写请求，Python 后端用 `httpx`。
   两者行为不一致——最实际的差异：**Node `https` 不走系统代理**，而 Python 的
   `netutil.PROXY_MOUNTS` 已处理 SOCKS/HTTP 系统代理。企业代理环境下，
   地点搜索/航班追踪会失败，而 WFS/监控图层正常。
2. **主进程承载业务逻辑**。航班的 JSON 解析、地理编码的字符串处理都在主线程
   执行，与窗口管理/IPC 调度抢资源；数据量大时影响 UI 响应。
3. **测试不对称**。Python 侧有 97 个 pytest 用例、`services/monitor.py` 模式
   成熟；主进程网络代码零测试。
4. **错误处理风格分裂**。Python 侧统一 `HTTPException(502, detail=中文)`，
   渲染层已有 `parseApiError` 解析；主进程侧是裸 `throw new Error`，各组件
   自行处理。

## 2. 迁移目标

- 主进程回归「系统能力层」定位：窗口、菜单、对话框、配置、Python 子进程管理。
- 所有外部 HTTP 出口统一走 Python 后端（复用代理挂载、错误语义、测试基建）。
- 前端调用面统一为 `services/api.ts`（HTTP）+ 少量系统能力 IPC（文件/对话框/配置）。

## 3. 分层方案：按协议形态区别对待

三块代码不是一类问题，**不应一刀切**：

### 3.1 HTTP 请求/响应类 → 迁移（opensky、adsbfi、geocoding）

无状态、即发即弃，与 `monitor.py` 模式完全同构，迁移收益直接。

**目标端点设计**（`python/routers/external.py`，service 放 `python/services/external.py`）：

```
POST /external/opensky/token    { client_id, client_secret }  → { access_token, expires_in }
GET  /external/opensky/states   ?lamin&lomin&lamax&lomax&token → { time, states }
GET  /external/adsbfi/locations ?lat&lon&dist_nm               → AdsbfiResponse
GET  /external/geocode          ?q&limit                       → GeocodingResult[]
```

实现要点：

- 复用 `netutil.PROXY_MOUNTS`（`httpx.AsyncClient(mounts=...)`）——迁移即修复代理支持。
- **OpenSky token 缓存**：Python 侧按 `client_id` 缓存 token（`expires_in - 60s`
  失效），前端不再持有 token 状态，调用面从 token→states 两步简化为一步
  `GET /external/opensky/states?...&credentials=...`（或 token 由后端注入）。
  这是对现状的小幅增强，顺带消灭 `TOKEN_EXPIRED` 竞态。
- geocoding 的 Nominatim→Photon 降级逻辑整体平移（纯翻译，无设计变化）；
  注意保留 **10 s 超时**（`httpx.AsyncClient(timeout=httpx.Timeout(10.0))`）
  和 `User-Agent`（Nominatim 政策要求）。
- 错误语义对齐 monitor.py：`ValueError → 400`，上游错误 `→ 502 + 中文 detail`，
  前端 `parseApiError` 直接可用。OpenSky 429 → 502 保留原文案。

**前端改动**：

- `services/opensky.ts`、`services/adsbfi.ts`、`LocationSearchModal` 内的
  `window.electronAPI.*` 调用改为 `services/api.ts` 的 fetch 封装。
- `preload/index.ts` 删除 `openSkyFetchToken/openSkyFetchStates/
adsbfiFetchByLocation/geocodeSearch` 四个方法及全部关联类型。
- `ipc.ts` / `opensky.ts` / `geocoding.ts`（主进程）删除。

**Python 测试**（对齐现有 pytest 风格，mock httpx）：

- `tests/test_external.py`：token 成功/失败与缓存命中、states 401→TOKEN_EXPIRED
  语义、429 文案、adsbfi dist 上限 250 截断、geocoding 主源超时→降级 Photon、
  两源皆失败错误合并文案。

### 3.2 原生 TCP/UDP 推送流 → 保留在主进程（vehicleServer）

**建议不迁移**，理由：

1. **连接生命周期 = 应用生命周期**。TCP keepalive + 3 s 自动重连 + 用户主动
   断开语义，与 Electron 应用存活期天然绑定；Python 后端虽也是子进程，但把
   有状态连接移过去需要额外的停止/清理协议。
2. **迁移需要引入推送桥**。Python 侧要开 WebSocket/SSE 把包推回渲染层，
   相当于把一次直接 IPC 推送变成「TCP→Python→WS→渲染层」三跳，延迟与故障
   面都变大，而收益只有「代码位置统一」这一条美学动机。
3. **Node 在这正是强项**。`dgram`/`net` 是原生 API，现状实现（粘包处理、
   UDP 0.0.0.0 绑定、重连抑制）质量良好，无可观测缺陷。
4. 主进程做「有状态长连接」并不违背其定位——这与窗口/菜单一样是进程级资源。

**行动项**：不做代码迁移，但补两件小事——

- `vehicleServer.ts` 文件改名 `vehicleClient.ts`（消除"server"误导，CLAUDE.md
  已注明此坑）；
- 在 CLAUDE.md 增补一节「为什么 vehicle 留在主进程」，防止后续被当作遗漏。

## 4. 实施步骤（3.1 的执行清单）

按独立可交付的小步走，每步可单独提交/回滚：

| 步骤 | 内容                                                                                          | 验证                          |
| ---- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| 1    | `python/services/external.py` 三个函数 + `python/routers/external.py`                         | `tests/test_external.py` 全绿 |
| 2    | `main.py` 挂载 router；手动 curl 三类端点（真实外部 API）                                     | 真实返回结构比对              |
| 3    | 前端 `services/api.ts` 加 4 个封装；组件逐个切换（geocode → adsbfi → opensky 顺序，从小到大） | `npm run dev` 手测三个功能    |
| 4    | 删除主进程 `opensky.ts`/`geocoding.ts` 与对应 IPC handler、preload 方法                       | `npm run typecheck` 无死引用  |
| 5    | CLAUDE.md 更新架构树与 IPC 清单                                                               | 文档评审                      |

预估净变化：主进程 -350 行，Python +300 行（含测试），前端调用面等量替换。

## 5. 风险与回滚

| 风险                             | 缓解                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| OpenSky 凭证经本地 HTTP 明文传输 | 与现状等价（IPC 同样明文）；后端仅绑 127.0.0.1，动态端口            |
| Nominatim 限流（每 IP 1 rps）    | 迁移前后均按 IP 限流，行为不变；后续可加后端侧 1 s 节流（本次不做） |
| 迁移窗口内双路径并存             | 步骤 3 逐功能切换，每功能切换即删旧路径，不长期共存                 |
| 回滚                             | 每步独立 commit；revert 单个 commit 即回到上一状态                  |

## 6. 决策点（需要确认）

1. **OpenSky token 是否后端托管**（推荐：是，消灭两步调用）还是保持前端传
   token 透传（迁移最小化）？
2. vehicle 改名 `vehicleClient.ts` 是否随本计划一起做（推荐：是，纯重命名无风险）？
3. 新 router 命名 `external` vs 拆成 `flights.py` + `geocode.py` 两个 router
   （推荐：先合一个 `external.py`，量小不值得拆）？
