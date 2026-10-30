# 发射器纹理衍生 Panel 与方形导出验证

2026-10-28。用户要求使用本地 `src/gui` 的16×和32×素材，以方形纹理导出。用户随后澄清：原版没有独立Panel纹理，这两张图由发射器GUI纹理四角裁切拼接；32×按现有16×16元数据作为双倍分辨率纹理采样。

## 源码和来源核对

锁定1.21.1客户端资源包含 `assets/minecraft/textures/gui/container/dispenser.png`（256×256，SHA-256 `901d26f1aac7e7a9724ab2f7f4bf00ae4a8e3907c4274565020aa3093925feaa`）。其实际176×166界面四个4×4角的位置分别为(0,0)、(172,0)、(0,162)、(172,162)，与两张用户图的对应角逐像素一致；完整拼接图是用户制作，不是原版自带文件或独立Widget。[DispenserScreen.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/screens/inventory/DispenserScreen.java:13) 静态确认原版资源引用。

用户提供的mcmeta指定16×16逻辑尺寸、四边各4的九宫格；锁定 [GuiGraphics.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/GuiGraphics.java:1033) 使用角落和重复裁切的边/中心。本实现按这一对称规则平铺；32×先最近邻采样成16×16逻辑图，再平铺。源图、元数据、原版源图摘要与处理限制见 [SUPPLIED_PANEL_TEXTURE_CONTRACT.md](../architecture/SUPPLIED_PANEL_TEXTURE_CONTRACT.md)。源码比对和浏览器像素测试不构成游戏内视觉验证。

## 验证

- `npm.cmd run build`（含typecheck）和最终独立typecheck通过；`npm.cmd test` **66/66通过**。构建JS约644.57kB，仍有既有大于500kB的提示。
- Chrome 156.0.8078.48，1440×1000 CSS像素，模拟DPR1/2：完整浏览器回归 **94/94通过**，无跳过、失败或flaky，原始记录 [dispenser-panel-full-results.json](dispenser-panel-full-results.json)。之后仅增加留白逐像素测试断言，Panel专项 **8/8通过**：[dispenser-panel-padding-results.json](dispenser-panel-padding-results.json)。产品代码在完整回归后没有变化。
- 两种图均测试：PNG与原素材对应角、边、中心及不完整末端的采样；实际画布预览对应像素与导出一致；320×180内容在512×512图左上，完整扫描设计区之外的所有像素Alpha=0；513×180生成768×768，769×180生成1024×1024，并完整扫描留白透明。1025宽明确拒绝整批，文档可单独导出JSON。
- 核对Schema 0.3.0、旧0.1/0.2兼容、旧自绘样式保留、撤销/重做及IndexedDB刷新恢复；manifest/实现规格区分方形纹理尺寸和内容尺寸，原始图/元数据SHA记录在实现规格中。同快照和失败时不发布半套文件由既有Panel专项覆盖；修改素材后注入错误字节，导出被摘要校验拒绝、无下载入口且不改变设计/历史。
- 初次专项中32×的逐块缩采样在角落与整张先缩采样的结果不同；现统一先对整张32×纹理进行16×16最近邻采样，再进行九宫格平铺，按用户确认的语义复测通过。

## OPEN 与边界

尚未将新版方形纹理集成到Minecraft中实测；最终游戏外观、32×资源包采样、其他浏览器和物理DPR继续OPEN。项目仍不实现业务Widget、槽位或Java生成；背景纹理必须按左上内容尺寸裁取，纹理实际宽高要传入`GuiGraphics.blit`。`src/gui`与`dist`为本地素材/产物，忽略提交；构建产物可能包含这些纹理，不应提交公开仓库。
