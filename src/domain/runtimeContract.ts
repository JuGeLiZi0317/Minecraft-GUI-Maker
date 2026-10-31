/** Frozen M1-F defaults; exported as implementation intent, not executable game code. */
export const NAVIGATION_LIFECYCLE = {
  sessionStart: 'entryScreenId',
  openScreen: 'resolve-source-declaration-boundScreenId; directed-navigation; create-new-target-instance',
  localState: 'initialize-from-authoritative-design-on-every-open-including-self',
  sessionRestart: 'discard-all-transient-state; start-at-entryScreenId',
  screenSwitch: 'same-PreviewSession',
  unboundTarget: 'no-real-navigation',
  historyStack: 'none', pageCache: 'none', crossScreenState: 'none',
  escapeAndSystemBack: 'unspecified-by-project; implementer-must-decide-explicitly',
} as const;
export const RENDERING_CONTRACT = {
  nativeScreenBackground: 'unspecified; world blur/default/clear must be chosen explicitly by implementer',
  designReference: 'Screen-local design area; includes Panel and components; not a full game-window background asset',
  panelAsset: 'Panel-only square sheet; design-area-global coordinates; panelBounds offset already baked into pixels',
  panelPlacement: 'draw contentWidth x contentHeight at Screen design origin once; NEVER translate again by panelBounds.x/y',
  layers: 'native Screen background, unselected CreativeTabs, Panel sheet at design origin, remaining components and text in array order',
  browserFont: 'browser session family and generation are reference diagnostics only; not a Minecraft font resource identity',
  minecraftFont: 'native Minecraft Font/provider and language metrics require game verification',
  userFont: 'browser user font source is not bundled or automatically mapped to Minecraft; implementer must supply compatible authorized game resources',
  textShadow: 'explicit node boolean; legacy missing means false; retain per-widget native/custom implementation requirements',
} as const;
