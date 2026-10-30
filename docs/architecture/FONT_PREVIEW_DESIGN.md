# 字体预览分级方案（未实施）

1. 优先研究 bitmap + space，覆盖资源实际包含的 Latin、数字和符号；按源码读取字符网格、alpha、advance、ascent，并正确处理资源栈、引用与条件。字符是否覆盖必须由用户资源确认。
2. 额外 provider 与资源：unihex、其他 bitmap 和资源包字体需独立验证其数据、引用、外部来源及安全预算；TTF 需比较 FreeType 光栅与浏览器实现，不能宣称自动等价。
3. 高级文本：Unicode supplementary code point、缺失字形、双向排版、阿拉伯 shaping、样式、加粗/斜体、颜色、阴影和本地化需要分项实现与游戏对照。中文不能因 JAR 中 unifont 为空而直接推断运行时表现。

建议将资源解析与文字布局分离：`FontResolver` 返回 provider、来源、generation、字形度量及诊断；纯 `layoutText` 接收文本、样式、可用宽度和组件规则，产生不可变字形位置、advance、裁切和诊断；Canvas 与参考 PNG 共用布局结果和同一绘制适配器。缓存键包含资源 generation、字体 ID、样式与文本；旧 generation 的异步结果应丢弃。实现需单独授权；不在权威 GUI Schema 中写 File、Blob、字节或浏览器缓存对象。

现有资源系统不支持字体定义栈、引用展开及 filter；若下一阶段实现这些，必须先确认覆盖语义和安全约束。默认缺失字形、位图透明边界、字体选项与资源切换均须成为测试输入，不能静默降级为已还原原版。
