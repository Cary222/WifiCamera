# Bug #12（P1-9）：TF 卡格式化接口缺失——固件对接说明与建议接口契约草案

> **特别声明（重要边界约束）：**
> 1. 本文档第 4 节中的 `/storage/status`、`POST /storage/format`、`GET /storage/format/status` 均为 **【App 端提议的接口契约草案（PROPOSED DRAFT）】**，**固件当前主干尚未实现或正式确认部署**。
> 2. App 侧已按此契约完成前端接口适配层、只读前置探活、防重发机制、超时真实未知状态提示及完整单元测试；在对接未实现该接口的旧固件时，App 会在只读探活阶段自动识别并拦截，**绝对不会向旧固件盲发未约定的破坏性请求**。
> 3. 固件侧开发人员请依据本文档第 4、5 节规范实现底层能力与 HTTP 接口。

---

## 1. 对应哪条 Bug

- **原始编号：#12（P1-9）**，相册删除与格式化功能问题。
- **优先级：P1**。
- **责任归属：固件实现存储格式化能力与接口；App 对接确认、执行状态和结果刷新；产品确认清除范围。**
- 本文只跟踪 #12 中仍未解决的“格式化”部分，不代表删除功能不可用。

已有记录：

1. `docs/TODO_9.14新版Bug分析与修复计划.md` 的 #12：App 无法删除图片，“格式化”按钮无后端。
2. `docs/WifiCamera_9.16重构版Bug修复与跨部门对齐汇报.md`：第三节“跨端 API 接口对齐诉求”中的 #12，以及第四节“格式化按钮在固件就绪前是否隐藏”。
3. `docs/reports/issue-10223-refactor-version-app-bugs-fix-and-verification.md` 的 #12（P1-9）。

**状态拆开记录：删除已接入、可用（`GET /delete?path=...`）；真实 TF 卡格式化仍阻塞固件实现。不能因删除已修复就将 #12 整条关闭。**

---

## 2. 现有接口与提议草案对比

为避免跨端沟通歧义，特此明确区分固件已存在的确认接口与本次提议的草案：

| 接口分类 | 方法与路径 | 状态 | 作用与说明 |
| --- | --- | --- | --- |
| **已确认现有接口** | `GET /delete?path=...` | **已实现、已接入** | 删除相机单张图片/文件，板端已由 `handle_delete()` 支撑。 |
| **已确认现有接口** | `GET /list_images` | **已实现、已接入** | 获取相机已保存图片列表。 |
| **已确认现有接口** | `GET /FileCopy/get_disk_usage/` | **已实现、已接入** | 查询存储使用量与总容量（used/total/free）。 |
| **提议草案（PROPOSED）** | `GET /storage/status` | **草案 / 待固件实现** | 存储状态只读前置探活（卡是否在位、挂载、只读、忙碌、是否支持格式化）。 |
| **提议草案（PROPOSED）** | `POST /storage/format` | **草案 / 待固件实现** | 破坏性格式化执行入口，必须带显式确认标记与请求去重 ID。 |
| **提议草案（PROPOSED）** | `GET /storage/format/status` | **草案 / 待固件实现** | 异步格式化任务状态查询（支持以 `task_id` 或 `request_id` 查询）。 |

---

## 3. 最新固件源码核查证据

核查日期：**2026-09-20**。通过 SSH 对开发板服务源码主分支进行了只读检查：

```text
主机：hxy@192.168.1.14
目录：/home/hxy/work/company/new_wificamera_sdk/test/net_server_test
分支：main
提交：c6fb93c
时间：2026-09-20 16:05:55 +0800
说明：merge: integrate gain controls with current board main
工作区：核查时无未提交修改，保持 clean
```

| 核查位置 | 结果 |
| --- | --- |
| `src/startup_routes.c:2563–2571` | 资源路由包含获取、查询、上传、保存、删除，**无格式化路由**。 |
| `src/startup_routes.c:2605–2606` | `/delete` 调用 `handle_delete()`，单文件删除能力已有实现。 |
| `src/command_map.c` | 无格式化指令映射。 |
| `src/command_dispatcher.c` | 无格式化命令处理分支。 |
| 服务源码、测试、文档及脚本 | 全局检索无 `/format`、`format_sd`、`format_tf`、`format_disk`、`mkfs` 等格式化实现。 |

**核查结论：`main@c6fb93c` 尚未暴露 App 可调用的格式化能力。**  
因此，App 端必须先设计并建立安全、健壮的接口调用层，固件团队依据此契约规范落地底层与接口。

---

## 4. 提议固件格式化接口契约（PROPOSED DRAFT CONTRACT）

> **注意：以下 schema 是建议固件实现的具体规范，App 端已依此完成调用层、异常兜底与全部模拟测试。**

### 4.1 接口 1：只读存储状态与能力检查（Pre-flight Status Check）

- **路径**：`GET /storage/status`
- **定位**：**只读**、幂等、无破坏性。用于 App 发起格式化前的探活与安全拦截。
- **App 拦截规则**：若固件返回 404 / 405 / 501 或连接超时，说明为旧固件（不支持格式化），App 直接阻断并不发出后续 POST 请求；若返回无卡或忙碌，亦直接提示用户。
- **响应 Schema（JSON）**：

```json
{
  "ok": true,
  "storage": {
    "has_card": true,
    "card_mounted": true,
    "mount_point": "/mnt/sdcard",
    "read_only": false,
    "busy": false,
    "busy_reason": null,
    "format_supported": true
  },
  "current_task": null
}
```

- **字段说明**：
  - `storage.has_card`（bool）：物理 TF 卡是否在位。
  - `storage.card_mounted`（bool）：TF 卡分区是否已成功挂载。
  - `storage.mount_point`（string | null）：当前挂载路径（如 `/mnt/sdcard`）。
  - `storage.read_only`（bool）：文件系统是否被只读挂载或硬件写保护。
  - `storage.busy`（bool）：是否正在进行连拍、长曝光写盘、视频录制、FITS拉伸或大文件传输。
  - `storage.busy_reason`（string | null）：忙碌时的可读说明（如 `"Recording video"`）。
  - `storage.format_supported`（bool）：固件当前版本是否支持格式化。
  - `current_task`（object | null）：当前正在进行的格式化任务（若有），含 `task_id`、`status`（`"running"`）、`progress`（0~100）。

---

### 4.2 接口 2：触发格式化（Format Execution）

- **路径**：`POST /storage/format`
- **定位**：破坏性操作。
- **安全要求**：
  - **必须 POST**，严禁使用 GET 触发破坏性修改。
  - 必须包含客户端显式确认标识 `confirm: true`。
  - 必须包含客户端唯一幂等请求 ID `request_id`（由 App 生成），防止重试导致重复格式化。
  - 目标固定为 `"tf_card"`，板端必须在内部限制块设备，**严禁将请求参数直接拼入 shell 命令，严禁操作系统盘、eMMC 或 NAND**。
- **请求 Schema（JSON）**：

```json
{
  "confirm": true,
  "request_id": "fmt_1726820000000_a1b2c3",
  "target": "tf_card"
}
```

- **响应 Schema 1：同步完成（适合快速格式化）**：

```json
{
  "ok": true,
  "status": "success",
  "task_id": "task_fmt_001",
  "message": "TF card formatted and remounted successfully"
}
```

- **响应 Schema 2：异步接收（推荐，适合耗时 2 秒以上的完整擦除与重挂载）**：

```json
{
  "ok": true,
  "status": "running",
  "task_id": "task_fmt_001",
  "message": "Format initiated"
}
```

- **响应 Schema 3：业务拒绝（失败响应）**：

```json
{
  "ok": false,
  "error_code": "BUSY",
  "message": "Camera is currently saving capture frames"
}
```

- **标准错误码定义（`error_code`）**：
  - `"BUSY"`：存储正在写入或相机正在拍摄/录像，互斥拒绝。
  - `"NO_CARD"`：未插入 TF 卡或卡未被系统识别。
  - `"READ_ONLY"`：TF 卡写保护或硬件损坏导致只读。
  - `"FORMAT_FAILED"`：底层 `mkfs` 执行失败。
  - `"REMOUNT_FAILED"`：格式化后重新挂载分区失败。
  - `"UNSUPPORTED"`：当前硬件平台不支持格式化。

---

### 4.3 接口 3：查询格式化任务状态（Task Status Query）

- **路径**：`GET /storage/format/status?task_id=...&request_id=...`
- **定位**：只读状态轮询。App 在收到异步 `status: "running"` 后发起有上限的轮询（最大 15 次，间隔 1 秒）。
- **查询参数**：
  - `task_id`（可选）：板端返回的任务 ID。
  - `request_id`（可选）：客户端提交的幂等请求 ID。
- **响应 Schema（JSON）**：

```json
{
  "ok": true,
  "task_id": "task_fmt_001",
  "status": "running",
  "progress": 45,
  "error_code": null,
  "message": "Formatting partition"
}
```

- **完成状态 Schema**：

```json
{
  "ok": true,
  "task_id": "task_fmt_001",
  "status": "success",
  "progress": 100,
  "error_code": null,
  "message": "Format completed successfully"
}
```

- **失败状态 Schema**：

```json
{
  "ok": true,
  "task_id": "task_fmt_001",
  "status": "failed",
  "progress": 60,
  "error_code": "REMOUNT_FAILED",
  "message": "Failed to mount /dev/mmcblk0p1 after format"
}
```

---

## 5. 固件实现核心检查清单（Firmware Implementation Checklist）

固件工程师在开发该能力时，请逐项核对并确保以下安全原则落地：

1. **设备安全性与白名单**：
   - [ ] 目标块设备必须硬编码或严格校验为真实 TF 卡设备节点（例如 `/dev/mmcblk0p1` 或通过 sysfs 识别的卡插槽）。
   - [ ] **严禁操作系统根分区、系统镜像分区、eMMC、SPI Flash 或 NAND**。
   - [ ] 若未插卡或未挂载，严禁对挂载点普通内存/Flash 目录执行清除。
2. **并发与存储互斥（Mutex）**：
   - [ ] 格式化开始前，必须获得存储排他锁。
   - [ ] 正在长曝光保存、连拍写盘、视频录制、延时摄影、FTP/HTTP 下载文件时，格式化请求必须返回 `error_code: "BUSY"` 拒绝执行。
   - [ ] 格式化执行期间，拦截所有新进入的照片/视频写入请求。
3. **文件句柄与挂载管理**：
   - [ ] 格式化前执行 `sync` 刷盘，并正确关闭卡上打开的所有文件句柄（包括日志进程写卡句柄）。
   - [ ] 正确 `umount` 分区；执行 `mkfs.vfat` / `mkfs.exfat`。
   - [ ] 格式化完成后重新 `mount`，并按相机目录规范自动重建必须目录（如 `/mnt/sdcard/Pictures`）。
   - [ ] 校验重挂载后有读写测试（如建立临时校验标记并删除），确认容量可被 `df` 正常读取。
4. **幂等与防重入**：
   - [ ] 板端记录最近一次 `request_id` 与正在执行的任务；收到相同 `request_id` 时直接返回原任务状态，严禁并发触发两次底层格式化。
5. **范围界定**：
   - [ ] 格式化是清除整张 TF 卡所有分区内容（包括图片、视频、FITS、日志等全量数据），不应以“调用循环删除照片”替代。
   - [ ] 手机本地相册已保存的副本完全独立，不受板端格式化影响。

---

## 6. App 端已完成的接口层与防护实现

App 端已在 `src/features/home/album/` 完成了完整的接口层封装与安全防护机制：

1. **安全只读探活（Pre-flight Check）**：
   - 在用户点击确认格式化后，App 先调用 `checkStorageCapabilities()`（请求 `GET /storage/status`）。
   - 若板端为未更新的旧固件（返回 404 / 501 或连接失败），立刻抛出 `FORMAT_ENDPOINT_NOT_AVAILABLE`，**严禁向相机发送任何 POST 请求**，保护旧设备安全。
2. **严格单次提交（No Auto-retry of Mutation）**：
   - App 确认后仅执行一次 `POST /storage/format`，附带随机生成的唯一 `request_id` 与 `confirm: true`。
   - 网络底层 Axios 拦截器无自动重试机制；代码中也绝不针对 POST 破坏性接口做自动重发。
3. **防重复点击控制**：
   - UI 层使用 `isFormatting` 状态锁与弹窗禁用态，在格式化过程中阻止一切重复点击与二次确认。
4. **真实未知状态防护（Honest Unknown State）**：
   - 当 `POST` 请求发出后遇到网络超时或连接中断时，App **既不谎报“格式化成功”，也不武断判定为“格式化失败”**。
   - App 会尝试发起单次只读状态对账查询；若状态依然不可知，向用户清晰提示：“格式化状态未知（请求已发出但响应超时或连接中断），请确认相机连接并刷新相册，切勿连续重复格式化。”
   - 界面保留上一次操作的 `requestId` 与 `taskId` 供界面生命周期内核对，且**绝不自动清空相册或容量数据**。
5. **相册与容量数据刷新时机**：
   - 只有在板端确认返回 `status: "success"` 时，才调用相册与存储刷新逻辑（`handleRefresh()` 与 `useStorageInfo` 刷新）。
6. **全量清除 vs 删除单张照片 文案规范**：
   - 确认弹窗文案已更新并经过各语言本地化校准，明确提示：“TF卡内所有内容（包括照片、视频及其他文件）将被清空，已保存至手机相册的内容不会受到影响，该操作无法撤销。”
7. **单元测试与覆盖**：
   - 新增 `src/features/home/album/services/format-service.test.ts` 与扩展 `album-screen.test.tsx`，7 项关键行为全部通过单测验证：
     1. 旧固件 404 / 不支持格式化时绝对不发出 POST。
     2. 取消确认不发出 POST。
     3. 单次确认恰好发出一次带确认标记的 POST。
     4. 固件忙碌或前端格式化中阻止重复提交。
     5. 确认成功后自动刷新相册列表和容量信息。
     6. 超时/网络断开真实反映未知状态，不谎报成功，不清空相册。
     7. 异步任务采用有界轮询（bounded polling），轮询期间绝不重发 POST。

---

## 7. 验收测试准备

在固件完成该能力并发布新二进制后，联调测试必须遵循：

- [ ] **严禁使用测试人员个人含有真实数据的日常卡进行联调！**必须使用明确授权、已备份的空卡或专用测试 TF 卡。
- [ ] 校验空闲状态下确认格式化成功，且相册与容量自动清空为 0 项。
- [ ] 校验正在录像或连拍时长曝光时格式化被拒绝并提示设备忙。
- [ ] 校验拔出 TF 卡后格式化提示无卡。
- [ ] 校验格式化后板端能继续拍摄并正常生成文件。
