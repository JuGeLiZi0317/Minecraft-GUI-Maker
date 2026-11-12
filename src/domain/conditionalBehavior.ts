export const CONDITIONAL_BEHAVIOR_CONTRACT = {
  condition: { type: 'event-option', operators: ['equals', 'not-equals'], valueSource: 'optionId from the current confirmed selection-change event only', validEvents: ['selection-change'] },
  typedCompare: { type: 'compare', valueTypes: ['OptionId', 'Number'], currentEventOnly: false, implicitConversion: false, validEvents: ['selection-change', 'slider-change'], controlValues: 'read-control-value uses same-Screen stable node ID and declared operand type; event type must match event-value operands only; no implicit conversion' },
  boolean: { types: ['and', 'or', 'not'], depthLimit: 4, nodeLimit: 32, evaluation: 'left to right short circuit; invalid propagates and skips both branches; do not evaluate skipped children', staticValidation: 'validate all nodes and references even in branches that may short-circuit', legacyCompatibility: 'existing leaf structures and action limits unchanged' },
  branches: { executeExactlyOne: true, thenOrder: 'array order', elseOrder: 'array order', elseMayBeEmpty: true, nesting: false, nestingScope: 'control actions cannot nest; Boolean condition trees may nest within their limits', leafActions: ['set-status', 'set-progress-value', 'set-visible', 'set-text'] },
  extendedBranches: {
    schema: '0.45.0; explicit save only; legacy rules are never migrated on load',
    if: 'if condition followed by optional elseIf array and existing elseActions; evaluate left to right; first true only; skip later conditions; invalid stops the entire chain including fallback',
    switch: 'OptionId or finite Number selector evaluated exactly once against the event read snapshot; strict typed equality; cases checked in declaration order; first match only; no fallthrough; optional defaultActions when no match; no match without default is a normal skip; invalid skips all branches',
    limits: { conditionBranchesOrCases: 16, actionsPerBranch: 50, totalLeafActionsPerExtendedRule: 200 },
    validation: 'reject duplicate cases, incompatible types, invalid stable option IDs, missing same-Screen reads and illegal action targets; validate every branch even when runtime short-circuits',
    actions: 'preserve existing leaf action order and per-action error handling; last valid assignment wins; programmatic assignment never emits user events or navigation lifecycle',
    nesting: false,
  },
  lifecycle: 'condition results and effects are PreviewSession state; initialize from design initial values on every Screen open and never write transient state into authority JSON',
  invalidReferences: 'reject the rule atomically; never infer an option from label or display text',
  runtime: 'design intent only; the game implementer supplies Java event callbacks and execution; Blockly generates no JavaScript or Java',
} as const;
