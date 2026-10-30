# 设计区尺寸与 GUI Scale 源码核对

2026-10-27，Minecraft Java 1.21.1 / NeoForge 21.1.244。未进行游戏内运行验证。使用本地api_references，不引用网络中的其他版本代码。

## 320×180是什么，最大多大

320×180是GUI Maker的初始设计区，**不是原版Screen的固定大小或上限**。Screen接收窗口缩放后的GUI逻辑尺寸；设计区是本工具用于居中布局的规格区域。

原版没有一个对所有分辨率都成立的“最大画布宽高”。可见GUI逻辑区域取决于帧缓冲宽高和实际GUI倍率，正数情况下为 `ceil(framebufferWidth / scale)` × `ceil(framebufferHeight / scale)`。不强制Unicode且倍率为1时，可用GUI尺寸等于帧缓冲尺寸；1920×1080窗口在1倍下就是1920×1080，在4倍下为480×270。尺寸API使用Java int，实际窗口/显卡约束也会影响可用尺寸，不能把int上限当成可用屏幕大小。

当前工具允许通过界面修改设计区为每轴1～8192的整数；**8192是工具的交互输入保护上限，不是游戏限制**。不改变已有Schema接受安全整数的兼容合同，不会把较大旧JSON静默缩小。设计区超过预览窗口时，按居中布局显示裁切警告；缩小实际设计区若造成现有节点越界则原子拒绝，不自动移动、缩放或丢弃节点。

## 原版等级定义（静态确认）

| 入口 | 规则 |
|---|---|
| Window.calculateScale，385～403行 | 从1开始，自动或请求等级尚未达到时，只有下一倍率仍能保留至少320宽、240高的GUI区域才继续增加。**阈值是320×240，不是320×180** |
| 同方法的forceUnicode分支 | 最后若倍率为奇数，再加1，强制偶数。因此最终可用高度可能低于240，不能宣称320×240是始终成立的最小值 |
| Window.setGuiScale，405～410行 | 按帧缓冲除以实际倍率，并分别向上取整得到GUI逻辑宽高 |
| Options.guiScale，684～699行 | 等级0是自动；运行时可选最大等级来自calculateScale(0,isEnforceUnicode)。2147483646是配置值范围上限，不是界面能实际选择这么多等级 |
| Minecraft.isEnforceUnicode，899～900行；resizeDisplay，1329～1330行 | 强制Unicode来自forceUnicodeFont选项；重建显示时用calculateScale结果设置实际GuiScale |

| 帧缓冲 | 请求 | 强制Unicode | 实际倍率 | GUI逻辑区域 |
|---|---|---|---|---|
| 1920×1080 | 1 | 否 | 1 | 1920×1080 |
| 1920×1080 | 2 | 否 | 2 | 960×540 |
| 1920×1080 | 3 | 否 | 3 | 640×360 |
| 1920×1080 | 自动/4 | 否 | 4 | 480×270 |
| 1280×720 | 自动 | 否 | 3 | 427×240 |
| 1280×720 | 自动 | 是 | 4 | 320×180 |
| 3840×2160 | 自动 | 否 | 9 | 427×240 |
| 3840×2160 | 自动 | 是 | 10 | 384×216 |

强制Unicode时多个请求等级可能映射至相同偶数实际倍率，例如1→2、3→4。预览同时显示可选等级和实际倍率，不把两者混淆。

## 证据定位与版本核对

主要根目录：`D:\Minecraft\AIStudio\skills\minecraft-neoforge-dev\api_references`。三个文件均与NeoFormRuntime锁定21.1.244的 `sourcesAndCompiledWithNeoForge_d268a859068c3807afd66dd2c4895b50bcd0e35d_output.jar` 对应条目统一行尾后逐字节一致；版本链见[首阶段审计](GUI_COMPONENT_AUDIT.md)。

| 文件 | 本地源码SHA-256 |
|---|---|
| [Window.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/com/mojang/blaze3d/platform/Window.java:385) | `77284f74289b6660381f49d9e6f7517d608cdcc793be444a0eed3899cae82263` |
| [Options.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/Options.java:684) | `037056bdb6929f8da43b793ea6b0984baea7f883c8f8a3e78093f355df9d5b32` |
| [Minecraft.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/Minecraft.java:1329) | `7d836f751d5990e50255d4bb91a084676fcd39f34bcb6dc4e47a0ff563963dc8` |

仓库只记录定位、指纹、行为说明与独立TS实现，没有复制Minecraft源码或游戏资源。

## 应用方式和限制

`src/domain/guiScale.ts`独立计算倍率和逻辑尺寸；设计区尺寸保存在既有designSize字段中，修改是一条可撤销事务。游戏帧缓冲预设、GUI Scale、Unicode和只读预览状态均为会话状态，不进入权威JSON，不产生历史。

画布预览模拟完整游戏窗口，再把该窗口等比适配到网页空间，节点按实际GUI倍率相对窗口缩放、居中布局并按窗口裁切。因此看到的CSS像素大小还包含预览适配比例，不能把它理解为显示器上的物理像素；编辑器Zoom也不是游戏GUI Scale，浏览器DPR不参与游戏倍率算法。

目前提供四个帧缓冲预设：1280×720、1920×1080、2560×1440、3840×2160。预览不改组件、不执行GUI行为，不渲染真实字体/资源包。Unicode选项只模拟源码中的倍率修正，不代表实现了游戏字体系统。真实游戏渲染、输入法和物理显示设备仍需后续验证。
