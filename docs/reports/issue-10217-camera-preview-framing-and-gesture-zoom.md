# #10217: 相机竖屏构图适配、黑边消除、画幅无闪烁平滑切换与双指捏合变焦功能报告

## 一、问题背景与需求演进 (Issue Summary)

- **单号**: `#10217`
- **关联功能模块**: 相机风景模式 (`LandscapeCameraScreen`)、星云模式 (`NebulaCameraScreen`)、原生预览组件 (`PreviewSurface` / `RTCView`)、画幅切换动画 Hook (`useAspectRatioAnimation`)。
- **问题与演进脉络**:
  1. **原始缺陷（切中间 2/3 画面）**:
     板端摄像头传感器固定输出横向流（16:9 为 1920×1080，4:3 为 1440×1080），拍照原图也是横向整图。手机在竖握时，原代码通过 `screenWidth / 0.5625` 计算出竖屏 9:16 的超高框，并采用 `objectFit="cover"` 强制铺满，导致横向左右约 2/3 的有效画面被切掉，取景与最终出图严重脱节。
  2. **构图全景自适应与贴屏去黑边**:
     用户竖握手机时，16:9 画幅需自适应翻转为 9:16 竖屏大画面，4:3 画幅翻转为 3:4 竖屏大画面；画面左右必须 100% 贴合手机屏幕边缘，消除左右及上下黑边，且整张画面完整保留不被裁切；横屏手持时恢复 0° 横向视口呈现。
  3. **画幅切换卡顿与闪屏痛点消除**:
     在 16:9 和 4:3 比例切换过渡过程中，由于底层原生 `RTCView` 视口尺寸发生突变，触发了 Android/iOS 原生 `SurfaceView` / Metal 渲染管道的重排与重建，引发画面黑屏闪烁、掉帧与卡顿。
  4. **双指捏合变焦（Pinch-to-zoom）与浮动倍率药丸**:
     在取景器内支持双指无级流畅缩放（1.0x ~ 5.0x）、双击复位 1.0x；当画面处于放大状态时，在取景器底部居中实时显示悬浮倍率药丸标签（如 `1.5x` / `2.0x`），轻触药丸亦可一键平滑重置回 1.0x。

---

## 二、测试环境与设备 (Environment)

- **开发宿主**: macOS 15.x / Apple Silicon (开发环境 Node 20+, Expo SDK 52, React Native 0.76+)
- **相机硬件**: SVBONY / RV1106 Linux 嵌入式摄像头板端
- **推流协议**: WebRTC WHEP (`http://.../whep`), RTSP 源推流，主画幅 1920×1080 (16:9) 与 1440×1080 (4:3 ROI)
- **手势与动效库**: `react-native-gesture-handler` (~2.28.0), `react-native-reanimated` (~3.17.4)

---

## 三、核心技术方案与架构实现 (Architecture & Implementation)

### 1. 视口几何与零重排防闪屏架构 (`aspect-ratio-switcher.tsx`)

为彻底根除画幅切换时底层 WebRTC 的黑屏闪烁，确立了**“底层物理尺寸恒定 + 外层 GPU Compositor 视口裁剪滑动”**的工业级方案：

- **屏幕朝向感知**:
  `const isPortrait = screenHeight >= screenWidth;`
- **竖屏自适应画幅翻转**:
  - 竖屏 16:9 映射为 9:16 竖框，4:3 映射为 3:4 竖框。
  - `rotation = 90; scale = 1;`
- **底层 RTCView 尺寸绝对恒定**:
  - `surfaceWidth = Math.min(screenHeight, Math.round(screenWidth / RATIO_16_9));`
  - `surfaceHeight = screenWidth;`
  - 无论用户如何在 16:9 与 4:3 之间切换，底层 `RTCView` 收到的 `width` 与 `height` 均为固定常数。
  - 原生 `SurfaceView` / `CALayer` 零销毁、零重建、零重排。
- **Reanimated UI 线程动效**:
  - 外层 `Animated.View` 采用 `overflow: 'hidden'` 作为视口窗口，在 220ms 内仅改变 `height` 与 `top`，以 120fps 平滑滑动裁剪，彻底消除卡顿。

### 2. 双指捏合变焦与悬浮药丸徽标 (`native-camera-preview.tsx`)

- **Pinch 手势集成**:
  - 基于 `Gesture.Pinch()` 在 UI 线程监听捏合，实时更新 `pinchScale.value`（限制在 1.0x ~ 5.0x 范围）。
  - 若用户捏合缩小至 < 1.0x，手势结束时通过 `withSpring(1)` 自动弹性回弹。
- **Double Tap 双击重置**:
  - `Gesture.Tap().numberOfTaps(2)` 监听双击操作，通过 `withTiming(1, { duration: 180 })` 平滑复位。
  - 与 Pinch 手势通过 `Gesture.Simultaneous` 并发组合。
- **悬浮药丸倍率徽标**:
  - 通过 `useAnimatedReaction` 监听缩放值的十分位变化，驱动 JS 线程状态更新（避免高频全量重渲染）。
  - 当缩放倍率 > 1.02x 时，在取景器底部居中展现深色半透明胶囊药丸（`bg-black/75 rounded-full px-3 py-1`），动态显示当前数字倍率（如 `1.5x`）。
  - 药丸标签独立于内部视频变换层之外，始终保持正向水平、文字锐利清晰。
  - 药丸支持点击事件，轻触即可平滑重置回 1.0x。

### 3. 取景器贴屏去黑边与模式统一 (`landscape-camera-screen.tsx` / `nebula-camera-screen.tsx`)

- `RTCView` 原生层设置 `objectFit="cover"`，旋转 90° 后物理尺寸与屏幕宽度完全契合，左右两端 100% 贴死屏幕。
- 风景模式与星云模式全面同步接入新版自适应视口与变焦手势体系。

---

## 四、功能复现与操作验证步骤 (Step-by-Step Verification)

### 场景 1：竖屏全景 90 度贴屏翻转验证（去黑边）

1. 竖握手机打开 App，进入【风景模式】；
2. 保持设备连接板端视频流；
3. **预期结果**:
   - 预览画面自动按 90 度旋转并以 9:16 大视口展现；
   - 画面左右两侧死死贴合屏幕边缘，**左右无任何黑边留白**；
   - 左右发暗/宽视场区域全部完整可见，与拍照成片的 JPEG 视角 100% 一致。

### 场景 2：16:9 与 4:3 比例平滑无闪烁切换验证

1. 在风景模式或星云模式下，点击底部【工具箱】展开面板；
2. 连续点击【16:9】与【4:3】比例切换按钮；
3. **预期结果**:
   - 取景框高度在 9:16（长视口）与 3:4（中视口）之间平滑上下伸缩滑动；
   - 动画时长 220ms，帧率稳定，**画面中途绝不出现黑屏闪烁、撕裂或卡顿**；
   - 底层视频推流持续稳定播放。

### 场景 3：双指捏合无级缩放（Pinch-to-zoom）

1. 在取景框区域，使用两根手指进行捏合向外拉开；
2. **预期结果**:
   - 视频画面跟随双指实时平滑放大，最大可放大至 5.0x；
   - 手势操作极其跟手流畅，无掉帧停顿；
   - 若向内捏合缩小到小于 1.0x 并松手，画面自动弹回 1.0x 满屏状态。

### 场景 4：悬浮放大倍数徽标与一键复位

1. 进行双指放大操作（如放大到 2.3x）；
2. **预期结果**:
   - 取景框底部正中央浮现黑色半透明药丸徽标，实时显示 `2.3x`；
   - 药丸徽标文字保持正向水平，不随视频旋转或变形；
3. 点击药丸徽标或在屏幕空白处双击；
4. **预期结果**:
   - 画面平滑复位至 1.0x 原始大小；
   - 复位完成后悬浮药丸徽标自动消失。

### 场景 5：手机横屏摆放自适应

1. 将手机横置（横屏手持）；
2. **预期结果**:
   - 屏幕宽高自适应重算，画面切换为 0° 正常横向显示；
   - 在 16:9 / 4:3 下自适应横屏视口最大化铺满，无异常裁剪。

---

## 五、自动化测试与代码质量验证 (Automated Testing)

1. **专项单元测试**:
   - 测试文件: `src/features/home/camera/components/aspect-ratio-switcher.test.tsx`
   - 覆盖竖屏 9:16/3:4 尺寸几何、90° 旋转、横屏 0° 视口、固定 Surface 尺寸防闪烁断言。
   - 执行命令:

     ```bash
     npm test -- src/features/home/camera/components/aspect-ratio-switcher.test.tsx
     ```

   - 结果: **2 passed, 2 total (100% 通过)**。

2. **全量工程测试套件回归**:
   - 执行命令: `npm test`
   - 结果: **22 passed, 22 total, 199 tests passed (全量零回归通过)**。

3. **TypeScript 类型校验**:
   - 执行命令: `npx tsc --noEmit`
   - 结果: **0 errors (类型安全)**。

4. **代码规范与 Lint**:
   - 执行命令: `npx expo lint`
   - 结果: **0 errors (规范合规)**。
