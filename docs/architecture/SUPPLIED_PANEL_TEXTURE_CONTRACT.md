# 用户提供 Panel 纹理与方形导出合同 0.3.0

2026-10-28。用户要求使用 `src/gui` 中的16×、32× Panel图像及 `.mcmeta`，导出左上角放置设计区、其余透明的方形背景图。此文是 [自绘Panel 0.2.0合同](PANEL_BACKGROUND_CONTRACT.md) 的明确修订，不改写历史文档。

## 素材与源码证据

- 用户提供 `panel_16x.png`（16×16；SHA-256 `fddb3181380dafc289cbe1394bb1e3d9b7f1d529fde5e82088354d7e390905f2`）、`panel_32x.png`（32×32；`93d85b18dcaf9b22dc5382877a126bb6496563edb7bf70c860edd06f2a80a5e9`）和 `panel.png.mcmeta`（`508dd60e754290cbb697a2ceafbceec9a566f97fa9148a8daeebae47a93175bd`）。用户澄清两张图由原版发射器GUI纹理的四角裁切拼接而成。代码使用前校验文件摘要与元数据内容，失败时明确拒绝导出；两张图片并非简单的最近邻2倍关系。
- 元数据为 `nine_slice`，逻辑宽高16×16，四边各4。锁定的 [GuiSpriteScaling.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/resources/metadata/gui/GuiSpriteScaling.java:21) 定义此合同，[GuiGraphics.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/GuiGraphics.java:1033) 对角落直接绘制、对边和中心重复平铺并在末端裁切。本项目遵循这组对称边框的规则；网页及导出纹理不等于游戏内渲染结果。
- 对本机缓存的 `minecraft_1.21.1_client.jar` 做静态比对，`assets/minecraft/textures/gui/container/dispenser.png` 的SHA-256为 `901d26f1aac7e7a9724ab2f7f4bf00ae4a8e3907c4274565020aa3093925feaa`。两张用户图的四个4×4角均分别与该图176×166实际背景区域的四角像素一致；用户拼接后的整个图仍是派生素材，而非游戏里独立存在的原版Panel文件或Widget。数据标记为`user-supplied-minecraft-dispenser-derived`；四角比对不代表其他所有像素逐一验证。源码中的原版引用见 [DispenserScreen.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/screens/inventory/DispenserScreen.java:13)。
- 使用者可选16×或32×。虽然两张图的四角具有相同的4像素样式，用户明确选择 **32×按现有16×16元数据作为双倍分辨率纹理采样**。输出仍是1图像像素=1 GUI逻辑单位；32×图先用最近邻采样成16×16逻辑图，再做切片平铺，不能保留高分辨率亚像素细节。游戏资源包、纹理采样方式及视觉一致性仍需游戏内验证。
- 原始素材只读取用户已有本地文件，`src/gui/`与`dist/`被忽略，禁止将游戏资产或打包后包含这些素材的产物提交到公开仓库。Vite构建可能将这两张图内嵌到应用产物；这不是分离素材或分发权利的验证。用户要求导出的背景图是基于其提供素材生成的派生纹理。

## 数据与旧项目

新增Schema 0.3.0背景样式 `supplied-panel-16` 和 `supplied-panel-32`。0.1.0与0.2.0项目继续原样读取；旧 `custom-bevel-1` 样式仍保持其原自绘外观与来源。选择用户素材时才作为普通可撤销编辑升级到0.3.0，切换样式不改变节点、坐标或图层。旧版应用无法读取0.3.0；升级前应保留原项目JSON备份。Panel仍覆盖整个设计区，最小8×8，使用设计区宽高调整。

## 方形纹理

仅Panel的 `.background.png` 是方形纹理，设计区左上角为纹理 `(0,0)`，设计区内1 PNG像素=1 GUI逻辑单位；设计区外的右侧与下方全部透明，包括右下角。组件、文字、游戏窗口和编辑辅助不烘入该图。源PNG本身的透明像素仍按源图保留。

| 设计区宽、高的较大值 | 纹理宽高 |
|---|---|
| ≤512 | 512×512 |
| 513～768 | 768×768 |
| 769～1024 | 1024×1024 |
| >1024 | 明确拒绝整个规格批次，保留文档、历史和单独JSON导出 |

768与1024都是本产品按用户要求选择的方形档位，不声称游戏强制使用这些尺寸。设计区和放大参考PNG继续分别使用原逻辑尺寸和约定倍率，不将方形填充烘入参考图。

manifest、实现规格和PNG元数据区分纹理`width/height`与左上内容`contentWidth/contentHeight`、origin、透明填充和来源；manifest列出文件摘要，实现规格同时列出用户图和mcmeta的固定摘要。所有图片和数据仍来自同一已提交不可变快照，任一步失败不发布部分批次；项目JSON仍是权威。

Agent应用时按图片实际方形尺寸作为 `textureWidth/textureHeight`，只取左上角`contentWidth×contentHeight`绘制在设计区居中起点，不能把整张方图缩放至设计区。1.21.1 `GuiGraphics.blit` 的短重载默认256×256，不能用于此尺寸假设；详见 [GuiGraphics.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/GuiGraphics.java:789)。游戏窗口背景、业务、资源命名空间由目标工程决定。
