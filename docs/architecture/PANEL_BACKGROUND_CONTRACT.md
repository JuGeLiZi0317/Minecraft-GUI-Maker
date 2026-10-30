# Panel 背景与独立纹理合同 0.2.0

2026-10-27。用户选择“可调整尺寸的九宫格风格 Panel，生成独立 PNG”。该范围只包含一个覆盖设计区的自绘底板及其纹理；不实现信标菜单、槽位、图片导入、行为或 ZIP。它不是原版 Widget，不复制 `beacon.png` 或任何游戏资产。

## 领域数据与历史

- 旧 Schema 0.1.0 文档的 `background: {"kind":"none"}` 原样读取和导出，不偷偷迁移。第一次启用 Panel 是一次普通可撤销编辑，将 Schema 升为 0.2.0，背景变为 `{"kind":"panel","style":"custom-bevel-1"}`。移除 Panel 后保持0.2.0；撤销可恢复到旧文档及旧版本。
- 0.2.0也允许`none`；0.1.0不接受Panel，未知样式或未来版本拒绝。Panel 宽高直接采用 `designSize`，每轴最小8 GUI px。更小的尺寸或越界组件导致的无效尺寸均原子拒绝。已有组件、逻辑坐标与图层顺序不因启用Panel改变。
- 样式是项目自绘的像素边框：固定像素宽度的高光、暗边和浅灰填充随设计区尺寸延伸，采用九宫格式的视觉效果，没有游戏素材或素材切片。Panel是设计区背景层，固定在所有节点下方，不承诺游戏原版视觉一致，也不是可自由放置、多个或嵌套的 Panel 组件。
- 游戏窗口的 Screen 背景（默认背景、模糊或清晰世界）仍未由这个Panel决定，需要实现者单独确认。Panel图像只覆盖设计区。

## 同快照导出

导出合同及manifest版本为0.2.0。`background.kind=none`时仍是六个文件；启用Panel时增加第七个 `<batch>.background.png`。七个文件均从同一个已提交不可变快照生成，任何一步失败均不发布部分下载，manifest列出六个非manifest文件的精确字节数和SHA-256。

背景纹理只画Panel，不包含按钮、文字、选中框、参考图衬底或游戏窗口；宽高恰为设计区逻辑宽高，1 PNG px = 1 GUI逻辑单位，左上为(0,0)。边框与填充均为不透明像素。导出前后设计 JSON 是权威，资源图是由`background.style`和`designSize`派生的同批文件；PNG tEXt及manifest记录批次/修订/来源/坐标和宽高。

设计区预览PNG及放大参考PNG会画同一个底板，然后画当前可见组件；独立纹理只画底板。无Panel时设计区PNG仍透明。导入或恢复仅需要JSON，纹理可按同一确定性样式重新生成；本阶段不支持读取外部PNG，也不声称由PNG反推设计数据。

Agent应将同批背景PNG放入目标Mod自己的资源命名空间，先在居中的设计区位置绘制，再按权威JSON的bounds及顺序绘制组件。`GuiGraphics.blit`有使用实际textureWidth/textureHeight的重载；短重载默认256×256（[锁定源码](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/GuiGraphics.java:789)），对于320×180等生成纹理不可盲目使用。没有指定目标Mod ID或资源路径，不能覆盖`minecraft`命名空间。布局规格与设计图片不是可执行Java代码。

旧版应用不能理解0.2.0 Panel，应保留原JSON备份；新版应用继续接受0.1.0。导出仍遵守8192单轴/16,777,216总像素操作上限，不把此限制说成Minecraft上限。旧版0.1.1导出合同保留为历史文档。
