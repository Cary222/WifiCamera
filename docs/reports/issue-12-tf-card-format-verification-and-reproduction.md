# Bug #12 (P1-9)：TF 卡格式化功能实机验证、复现与归因报告

## 一、问题背景与任务概览

- **问题编号**：`#12 (P1-9)`（相册删除与格式化功能）
- **测试环境**：
  - 相机硬件：Rockchip RV1103B WifiCamera 板端（序列号 `c537ff995f2c988e`）
  - 固件版本：`feat/12-tf-card-format` 测试镜像（`update_tf_format_test_20260921.img`，SHA256: `e54dcd85...`，内核集成 exFAT）
  - 测试存储：SanDisk 32GB MicroSDHC/TF 卡（单分区 `mmcblk1p1`，标称容量 29.1GB）
  - 手机客户端：iOS 客户端（真机 iPhone 与 iOS 模拟器 iPhone 16e）
- **现象描述**：
  用户在 App 相册点击“格式化”并确认后，App 弹出提示框：
  > **“格式化状态未知：格式化耗时较长，当前仍在处理中或状态未知。请稍后刷新相册确认，切勿重复格式化。”**
  关闭弹窗后退出相册重新进入刷新，发现 **TF 卡内原有的照片全部被清空，容量显示为 0.0 GB / 29.1 GB**。

---

## 二、功能正常性确认（设备端与服务实测）

针对用户“退出刷新后照片确实没了，帮我确认功能是否正常”的诉求，通过 ADB 底层与 HTTP 服务接口进行全链路只读点验，**确认底层格式化与业务恢复均完全正常**：

### 1. 文件系统与挂载点核验
通过板端执行挂载与空间查询：
```bash
mount | grep -i sdcard
# 输出：
# /dev/mmcblk1p1 on /mnt/sdcard type exfat (rw,nosuid,nodev,relatime,fmask=0000,dmask=0000,allow_utime=0022,iocharset=utf8,errors=remount-ro)
```
- **文件系统**：已从旧 FAT32 成功快速格式化并重建为 **exFAT** 文件系统。
- **挂载状态**：以 `rw`（可读写）正常挂载至 `/mnt/sdcard`。
- **系统目录自建**：固件自动恢复初始化了相机所需的标准业务目录：
  ```bash
  ls -la /mnt/sdcard
  # drwxrwxrwx 2 Pictures
  # drwxrwxrwx 2 Videos
  # drwxrwxrwx 3 Logs
  # drwxrwxrwx 2 newest_fig
  ```

### 2. 存储容量与相册索引接口核验
通过 HTTP 接口查询板端状态：
1. `GET /storage/status`：
   ```json
   {
     "ok": true,
     "format_supported": true,
     "filesystem": "exFAT",
     "max_volume_bytes": 2199023255552,
     "capacity_bytes": 31264342016,
     "mounted": true,
     "read_only": false,
     "supported_layout": "single_partition",
     "busy": false,
     "error": ""
   }
   ```
2. `GET /list_images`：
   ```json
   {
     "ok": true,
     "scope": "all",
     "images": [],
     "total": 0
   }
   ```
3. `GET /FileCopy/get_disk_usage/`：
   ```json
   {
     "success": true,
     "data": {
       "total": 29.1152,
       "used": 0.0017,
       "free": 29.1135
     }
   }
   ```
- 卡内无残留孤儿文件，相册文件索引列表干净清空。
- 板端 `/userdata/wificamera/storage-format.bin` 成功记录了本次已受理且已完成的格式化任务数据。

### 3. 相机主功能回退与恢复点验
通过 `agent-device` 从相册返回相机界面实测：
- 重新进入风景模式、星空模式后，WebRTC 预览通道恢复正常推流，未发生死锁、黑屏或崩盘。
- 首页存储容量卡片与相册顶部卡片均准确显示 `29.1GB` 及 `0.0 GB / 29.1 GB`。

**结论：TF 卡格式化功能在固件底层与文件系统层已成功执行，存储读写恢复正常，相机核心业务未受影响。**

---

## 三、为什么当时会弹出“格式化状态未知”？（根因分析）

弹出该弹窗并非格式化失败，而是 **App 轮询等待阈值过短与相机状态机竞争** 共同导致的阶段性误报：

```
[用户点击确认格式化]
        │
        ▼
App 向板端发送 POST /storage/format (携带 request_id 与 card_token)
        │
        ├─► 板端返回 HTTP 202 Accepted, 状态: state: "running", phase: "checking"
        │
        ▼
App 启动有界轮询 (GET /storage/format/status?request_id=...)
        │
        ├─► 板端依次执行: checking ➔ quiescing ➔ unmounting ➔ formatting ➔ mounting ➔ verifying
        │   (受 SDIO 速率与 32GB 分区重建影响，整套闭环耗时约 20~28 秒)
        │
        ├─► 【问题点】：原代码配置 FORMAT_MAX_POLL_ATTEMPTS = 15 (间隔 1 秒，总超时仅 15 秒)
        │
        ▼
第 15 秒到达，板端仍在 mounting / verifying (state: "running")
        │
        ▼
App 轮询超时触发安全机制，抛出 FORMAT_STATUS_UNKNOWN：
“格式化耗时较长，当前仍在处理中或状态未知。请稍后刷新相册确认，切勿重复格式化。”
        │
        ▼
数秒后，板端后台成功跑完 verifying 并返回 state: "succeeded"
用户退出重进刷新，相册即显示已被清空的 29.1GB 全新卡。
```

---

## 四、代码修复与体验优化

为了让用户在界面操作时直接获得正向的“格式化成功”提示，避免出现上述超时弹窗，已在 App 端完成以下三项针对性修复：

1. **放宽有界轮询超时阈值**：
   - 文件：`src/features/home/album/config.ts`
   - 将 `FORMAT_MAX_POLL_ATTEMPTS` 从 15 次（15 秒）放宽至 **90 次（90 秒）**，给大容量 SDXC/SDHC 卡在嵌入式单板上的 `mkfs.exfat`、重挂载及文件回读校验预留充足时间。
2. **格式化前主动退出推流（消解 BUSY 互斥）**：
   - 文件：`src/features/home/album/album-screen.tsx`
   - 进入相册页面以及确认格式化前，自动向相机发送 `stop_streaming`，确保相机硬件从 `STREAMING` 转为 `IDLE` 空闲态，满足固件“格式化前必须无预览推流”的强契约约束。
3. **HTTP 状态码宽容解析与诚实错误映射**：
   - 文件：`src/features/home/album/services/format-service.ts`
   - 增加 `validateStatus: status => status < 500`，允许直接读取板端返回的 HTTP 400（参数错误）或 409（`BUSY`、`CARD_CHANGED` 等），精准展示具体原因（如“相机当前正忙”），不再把 409 误判为断网超时而落入状态未知。

---

## 五、复现与验证步骤（Reproduction Guide）

后续测试人员可通过以下标准步骤进行复现和验证：

### 1. 前置条件
1. 相机刷入集成 exFAT 的固件（如 `update_tf_format_test_20260921.img`）。
2. 相机插入测试 TF 卡，开机并连接相机 Wi-Fi 热点。
3. 在 TF 卡内事先存入若干测试照片/文件（相册显示有文件）。

### 2. 测试步骤
1. 打开 App，在首页确认“设备已连接”，剩余空间正常显示。
2. 点击首页“相册”，进入相册界面，顶部 TF 卡卡片显示已用空间与总空间（如 `0.3 GB / 29.1 GB`）。
3. 点击右侧红色“格式化”按钮。
4. 在弹出的底部确认面板中，阅读警告文案（“TF卡内所有内容包括照片、视频及其他文件将被清空，已保存至手机相册的内容不会受到影响”），点击红色“确认格式化”。
5. 观察界面加载状态（约 15~25 秒）。

### 3. 预期结果
1. 格式化完成后，App 弹出提示框：**“格式化成功：TF卡已成功格式化。”**
2. 点击确定，相册自动触发刷新，顶部容量重置为 `0.0 GB / 29.1 GB`，相册中央展示空态（“未找到文件夹”）。
3. 返回拍摄界面，相机预览画面流畅，再次点击拍照可正常拍照并保存到新格式化的 TF 卡内。

---

## 六、回归测试证据

- **自动化单元测试**：
  `pnpm test src/features/home/album` 5 个套件全部通过（40/40 passed）。
- **静态类型与代码质量检查**：
  `pnpm run type-check` 与 `npx eslint src/features/home/album/` 全部通过，0 错误 0 告警。
