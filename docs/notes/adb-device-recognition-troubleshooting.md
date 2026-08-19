# ADB 设备识别踩坑记录

> 适用：macOS（darwin 25.5.0）+ Android 设备（Rockchip VID=8711）
> 目标：记录 macOS 上 ADB 设备"能识别 USB 但 `adb devices` 为空"的排查链路。

---

## 1. 问题背景

### 1.1 现象

USB 层面设备已正确枚举（`ioreg` 显示 `registered, matched, active`），但 `adb devices` 无设备输出。

```bash
$ adb devices -l
List of devices attached
# 空！什么都没有

$ ioreg -p IOUSB -l | grep -E "WifiCamera|2765467" -A 3
# 输出：
# +-o WifiCamera ADB@02122000  <class IOUSBHostDevice, ... registered, matched, active>
```

### 1.2 设备信息

| 属性 | 值 |
|------|-----|
| USB Product Name | WifiCamera ADB |
| USB Vendor | rockchip (VID=0x2207) |
| USB Serial | 2765467eaf19e2f8 |
| USB Status | registered, matched, active |

---

## 2. 踩坑记录

### 坑 1：Homebrew ADB 版本与 Android SDK ADB 版本冲突

**现象**：`adb devices` 输出为空，但 `ioreg` 显示设备 USB 连接正常。

**原因**：

系统安装了两个 ADB 版本，且 Homebrew 版本（路径 `/opt/homebrew/bin/adb`）在 PATH 中优先于 Android SDK 版本（路径 `/Users/vastgui/Library/Android/sdk/platform-tools/adb`）。两个版本号差异巨大：

| 来源 | 版本号 |
|------|--------|
| Android SDK | `1.0.41` / `36.0.2-14143358` |
| Homebrew (`/opt/homebrew/bin/adb`) | `36.0.0-13206524` |

Homebrew 版本的 ADB 对该设备的握手协议存在问题，导致枚举失败。

**解法**：修改 `~/.zshrc`，将 Android SDK 的 platform-tools 目录**前置**到 PATH，使 Android SDK ADB 优先于 Homebrew ADB。

修改前（`~/.zshrc` 第 21-23 行）：

```bash
export PATH=$PATH:$ANDROID_HOME/platform-tools    # ❌ 追加到末尾，Homebrew 优先
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

修改后：

```bash
export PATH=$ANDROID_HOME/platform-tools:$PATH    # ✅ 前置到开头
export PATH=$ANDROID_HOME/emulator:$PATH
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
```

修改后执行 `source ~/.zshrc` 使配置生效。

验证：

```bash
$ which adb
/Users/vastgui/Library/Android/sdk/platform-tools/adb    # ✅ 指向 SDK

$ adb devices
List of devices attached
2765467eaf19e2f8       device usb:2-1.2.2 ...    # ✅ 设备出现
```

---

### 坑 2：ADB 设备临时消失（ADB 缓存导致）

**现象**：重启 ADB 服务前，`adb devices` 输出为空；重启后设备重新出现。

**原因**：ADB daemon 缓存了设备的错误握手状态，即使 USB 层设备正常，ADB 层也无法识别。设备中途断开又重新连接时，ADB daemon 没有自动刷新枚举。

**解法**：重启 ADB server 强制重新枚举设备。

```bash
adb kill-server && adb start-server
```

---

### 坑 3：误以为是 Rockchip USB 驱动问题

**现象**：设备 VID=0x2207（Rockchip），在其他 Windows 电脑上需要安装 Rockchip 驱动才能识别。

**原因（澄清）**：**macOS 不需要 Rockchip 驱动。** macOS 使用苹果原生 USB 驱动栈（IOUSB），Android 设备通过标准 USB 协议与 ADB 通信，**不需要**额外安装驱动。如果 `ioreg` 能看到设备，说明 USB 枚举本身是正常的。

**结论**：macOS 上的 ADB 设备识别问题几乎不会是"缺少驱动"，问题通常在：
1. PATH 中 ADB 版本冲突（如坑 1）
2. USB 调试授权未通过（手机端弹窗）
3. ADB daemon 缓存问题（如坑 2）

---

## 3. 排查 Checklist

当遇到 `adb devices` 为空，但 USB 连接正常（`ioreg` 能看到设备）时，按顺序排查：

- [ ] **Step 1**：`adb kill-server && adb start-server` 重启 ADB 服务，看设备是否恢复
- [ ] **Step 2**：`which adb` 确认使用的是 Android SDK 版本（`/Users/vastgui/Library/Android/sdk/platform-tools/adb`），而非 Homebrew 版本
- [ ] **Step 3**：`echo $PATH | tr ':' '\n'` 检查 `/opt/homebrew/bin` 是否在 `$ANDROID_HOME/platform-tools` 之前，如果是，参考坑 1 修改 `~/.zshrc`
- [ ] **Step 4**：检查手机端是否弹出 **"允许 USB 调试？"** 授权弹窗
- [ ] **Step 5**：确认 `.zshrc` 修改后执行了 `source ~/.zshrc` 或重新打开终端

---

## 4. 相关文件

| 文件 | 作用 |
|------|------|
| `~/.zshrc` | shell PATH 配置，已修改 ADB 优先级 |
| `/opt/homebrew/Caskroom/android-platform-tools/` | Homebrew ADB 安装位置（保留备用） |
| `/Users/vastgui/Library/Android/sdk/platform-tools/` | Android SDK ADB 安装位置（当前优先） |

---

## 5. 参考命令汇总

```bash
# 查看所有 ADB 版本路径（确认冲突）
which -a adb

# 查看当前 ADB 版本
adb version

# 重启 ADB 服务
adb kill-server && adb start-server

# 查看 USB 层设备枚举
ioreg -p IOUSB -l | grep -E "WifiCamera|rockchip|2765467" -A 3

# 验证设备是否在 ADB 层识别
adb devices -l

# 验证 PATH 顺序
echo $PATH | tr ':' '\n' | head -20
```
