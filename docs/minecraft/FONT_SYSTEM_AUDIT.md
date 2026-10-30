# Minecraft 1.21.1 字体系统审计

目标 Minecraft 1.21.1 / NeoForge 21.1.244 / Java 21。以下源码位置均相对于 `D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references`。相关 FontManager、FontSet、Font、StringSplitter、BitmapProvider、UnihexProvider、GlyphProviderType、TrueTypeGlyphProviderDefinition、SpaceProvider、GlyphInfo、FontOption、BakedGlyph 共 12 个文件，与本地锁定 NeoForm 编译源码包逐文件比对，统一换行后相同。源码静态结论不等于浏览器或游戏内视觉验证。

## 加载与字形

- `net/minecraft/client/gui/font/FontManager.java:88` 通过 font JSON 资源栈加载定义；`:153`、`:226`、`:290`、`:328` 涉及引用、过滤和展开，`:201` 将结果逆序交给 FontSet。`FontSet.java:66`、`:116` 使用活动 provider 顺序查找字形。不同资源层、条件过滤和引用组合的最终优先级仍需专门实验，不能简化为普通文件覆盖。
- `net/minecraft/client/gui/font/providers/GlyphProviderType.java:14` 包含 bitmap、ttf、space、unihex、reference；NeoForge 扩展 provider 不应假定都受支持。`FontOption.java` 包含 uniform、jp 条件。
- `BitmapProvider.java:58`、`:154` 的 JSON 定义指定图、字符网格、height 和 ascent；按网格划分纹理并从右向左扫描可见像素，advance 为 `(int)(0.5 + inkWidth * scale) + 1`。空格 provider 是带 advance 的非绘制字形（`SpaceProvider.java:32`）。`UnihexProvider.java:196` 从指定 ZIP 的 hex 数据读取字形；`TrueTypeGlyphProviderDefinition.java:28` 读取 font 资源并使用 FreeType，不能假定浏览器字体光栅与之相同。
- `FontSet.java:116` 区分字形度量与烘焙字形查找；异常宽度过滤和缺失字形不能简单用 CSS 回退替代。默认缺失字形由 `SpecialGlyphs` 提供；默认字体资源本身缺失的处理见 `FontManager.java:212`。
- `Font.java:38` 行高为 9；`:47` 使用 glyph advance 与加粗度量，`:292` 最终宽度向上取整；`:59` 涉及 Arabic shaping / bidi。`Font.java:377` 附近处理阴影、加粗、颜色及装饰，`BakedGlyph.java:59` 涉及斜体倾斜。基线和位图尺寸须按各 provider 的 bearing/ascent 计算，不能以单一 CSS line-height 代替。

## 控件文字

| 组件 | 源码定位及行为 |
|---|---|
| Button | `net/minecraft/client/gui/components/AbstractWidget.java:101`、`:130`：测量、居中或滚动，并对指定区域裁切；滚动行为与时间有关。 |
| EditBox | `EditBox.java:425`、`:476`、`:576`：有边框时内部宽度减 8，文本依据显示位置裁切；hint 在显示内容为空且未聚焦时才显示；光标、焦点和文本阴影有额外条件。 |
| StringWidget | `StringWidget.java:53`：先测量，按左/中/右对齐，过长时裁切并使用省略文本；需要考虑视觉语言顺序。 |

## 状态

**CLOSED（静态源码与本机资源检查范围内）**：provider 种类、上述查找与基础度量入口、三类组件文字入口已定位。**OPEN**：所有过滤与多层引用组合、外部资产来源及复杂文本的实际行为；游戏内像素对照。**PENDING**：网页字体实现、不同 provider 的真实度量和跨平台结果；本批未替换文字渲染器。
