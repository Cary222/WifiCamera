# 板端 cam0 推流超时与原始采集链路故障排查记录

> 生成时间: 2026-09-09  
> 问题现象: 前端 WHEP 协商报错 `HTTP 400 {"error":"source of path 'cam0' has timed out"}`，相机画面黑屏。  
> 核心定位: 故障在板端底层图像采集链路（IMX662 → MIPI CSI-2 → RKCIF），原始传感器数据未输出，导致 RTSP 554 无数据源，下游 MediaMTX 产生拉流超时。

---

## 一、实测诊断证据

已排除前端 React 渲染或手机端 H.264 解码问题，所有测试直接在板端与 RTSP 源层面测量：

| 检查项 | 实测结果 | 结论 |
| --- | --- | --- |
| 板端进程与网络状态 | `net_server_test` (8999), `mediamtx` (8889), `tunnel` (18190) 正常运行并监听 | 控制通道、信令通道与端口转发正常 |
| WebSocket `camera_state` 查询 | 回复 `streaming=true, recording=false, job.kind="none"` | 应用层指令已下发，但状态位不代表底层物理出帧 |
| 板端 RTSP 直接请求 (`rtsp://127.0.0.1:554/live/0`) | `OPTIONS`、`DESCRIBE` 握手等待 5 秒全部超时无响应 | 554 推流源无有效视频流输出 |
| 板端 `/proc/rkcif-mipi-lvds` 状态 | `fps: 0.000`、`total: 0`、`frame dma end: 0 0 0 0`、`frame loss: 0 0 0 0` | CIF 驱动未收到并完成任何一帧 DMA 写入 |
| 板端 `/proc/rkisp-vir0` 状态 | `Interrupt Cnt: 0 ErrCnt: 0`、`Isp online frame: 0` | ISP 未收到任何图像输入 |
| 独立 V4L2 裸流测试 (`v4l2-ctl -d /dev/video0 --stream-mmap=3 --stream-count=3 --stream-poll`) | 连续输出 `select timeout`，超时退出 | 绕过 MediaMTX 和编码层后，直接从 `/dev/video0` 读 RAW 数据同样取不到帧 |
| 采集日志 (`net_server_8999.log`) | 持续输出 `video0_raw: poll timeout count=...`（计数持续增加） | 取流线程持续 poll 阻塞 |
| 中断与内核日志 (`/proc/interrupts`, `dmesg`) | 中断 43 (`rockchip-mipi-csi2-hw`) 累计发生超 2 亿次；内核刷屏 `MIPI_CSI2 ERR2:0x10000000` | CSI 控制器发生严重中断风暴 |

下游 MediaMTX 日志确认是超时受害者：

```text
[path cam0] [RTSP source] started on demand
[path cam0] [RTSP source] stopped: timed out
[WebRTC] [session ...] closed: source of path 'cam0' has timed out
```

当前 MediaMTX 配置为 TCP RTSP、按需启动（`sourceOnDemand: yes`）、3 秒启动超时（`sourceOnDemandStartTimeout: 3s`）。调整超时无法解决底层采集 0 帧产出的问题。

---

## 二、代码与配置核对清单（供板端同事排查）

SDK 服务器仓库根目录：

```text
/home/hxy/work/company/new_wificamera_sdk
```

### 1. 传感器驱动与时序参数配置

驱动文件：

```text
sysdrv/source/kernel/drivers/media/i2c/imx662.c
```

**已知待核对差异（格式与位深不一致）**：

```c
static const struct imx662_mode supported_modes[] = {
    {
        .bus_fmt = MEDIA_BUS_FMT_SRGGB12_1X12,
        .width = 1936,
        .height = 1100,
        .mclk = 24000000,
        .bpp = 10,   // <--- 待核对：声明为 12bit 寄存器序列，但配置写为 10
        .reg_list = imx662_linear_12bit_1920x1080_regs,
        ...
    },
};
```

- `bpp` 会直接参与 `pixel_rate` 计算（影响 CIF/DPHY 的采样速率与 FIFO 周期），请确认实际硬件应使用 10bit 还是 12bit，不要在未验证 DPHY 配合的情况下直接改动。

**板端运行时报告参数**：

- 分辨率与帧率：`1440x1080 @ 65fps`
- 输入格式：`SRGGB12_1X12`
- 通道数：`4 lanes`，`VC: 0`
- 摄像头输入时钟 (`clk_mipi0_out2io`)：`24 MHz`
- 请确认板级原理图上的时钟源、MIPI 差分走线引脚分配、设备树（DTS）配置与传感器当前的寄存器配置表是否完全匹配。

### 2. MIPI CSI 控制器驱动与 ERR2 解码

控制器驱动文件：

```text
sysdrv/source/kernel/drivers/media/platform/rockchip/cif/mipi-csi2.c
sysdrv/source/kernel/drivers/media/platform/rockchip/cif/mipi-csi2.h
```

**中断风暴定位**：

- 中断处理函数 `rk_csirx_irq2_handler()` 中读取寄存器 `CSIHOST_ERR2 (0x24)`：

  ```c
  val = read_csihost_reg(csi2_hw->base, CSIHOST_ERR2);
  pr_err("(0x%x)MIPI_CSI2 ERR2:0x%x %s\n", (u32)csi2_hw->res->start, val, err_str);
  ```

- 当前板端输出值为 `0x10000000`（Bit 28 置位）。
- **注意**：开源 Rockchip 5.10 分支中 CRC 错误定义在 `ERR1`（`0x0f000000`），`ERR2` 的头文件中未定义 Bit 28 的掩码，因此驱动打印中后缀为空字符串。
- 请对照 RV1106 TRM（技术参考手册）CSI-2 Host 章节确认 `ERR2 Bit 28` 的具体硬件含义，并检查该中断是否未被正确清除导致无限重入。

---

## 三、二进制程序版本差异

板端实测二进制哈希对照：

```text
当前运行程序:
/userdata/hjc_test/net_server_test
MD5: 57b335f58803a22c53bf7b5a0c17b4e5

固件内置只读副本:
/root/hjc_test/net_server_test
MD5: e4dd402b394e8b268d65c33a91014b65
```

- 板端启动脚本 `/root/start.sh` 的逻辑是：仅当 `/userdata/hjc_test/net_server_test` 不存在时才会从 `/root` 拷贝。
- 因此**断电重启不会自动覆盖或回滚 `/userdata` 中的程序**。
- 请确认当前运行的 `net_server_test` 构建是否与运行中的内核版本（5.10.240 #11 2026-07-27）及驱动版本配套。

---

## 四、修复验收步骤（按序验证）

1. **第 1 步：底层 RAW 采集**
   - 运行独立测试 `v4l2-ctl -d /dev/video0 --stream-mmap=3 --stream-count=10`，确认能正常取到图像帧且不超时；
   - 检查 `/proc/rkcif-mipi-lvds` 中 `frame dma end` 计数持续递增，`fps` 恢复非零。
2. **第 2 步：CSI 错误清除**
   - 检查 `dmesg`，确认 `MIPI_CSI2 ERR2` 错误日志停止刷屏，中断 43 增长恢复正常频率。
3. **第 3 步：RTSP 本地流就绪**
   - 请求 `rtsp://127.0.0.1:554/live/0`，确认 `DESCRIBE` 返回包含 H.264 的有效 SDP。
4. **第 4 步：上层业务验证**
   - 浏览器访问 `http://localhost:8081` 或打开 App 进入拍摄/风景模式，验证画面出流。

---

## 五、Mac 端保留的现场日志与快照

诊断现场证据保留在 Mac 宿主机路径：

```text
/tmp/wificamera-source-diagnosis-20260909-164226/
├── FINDINGS.md          # 诊断分析概要
├── system.txt           # 系统进程、uptime、内存在线快照
├── dmesg.txt            # 完整内核日志（含中断刷屏记录）
├── net_server_8999.log  # 服务运行日志（poll timeout 证据）
├── mediamtx.log         # MediaMTX 超时记录
├── capture-state.txt    # 中断统计与接口信息
├── raw-probe.txt        # 独立 V4L2 裸流探测超时日志
└── hardware-state.txt   # 时钟、GPIO 与 I2C 设备状态
```

EOF
