export const CONDITIONAL_BEHAVIOR_CONTRACT = {
  condition: { type: 'event-option', operators: ['equals', 'not-equals'], valueSource: 'optionId from the current confirmed selection-change event only', validEvents: ['selection-change'] },
  typedCompare: { type: 'compare', valueTypes: ['OptionId', 'Number'], currentEventOnly: false, implicitConversion: false, validEvents: ['selection-change', 'slider-change'], controlValues: 'read-control-value uses same-Screen stable node ID and declared operand type; event type must match event-value operands only; no implicit conversion' },
  boolean: { types: ['and', 'or', 'not'], depthLimit: 4, nodeLimit: 32, evaluation: 'left to right short circuit; invalid propagates and skips both branches; do not evaluate skipped children', staticValidation: 'validate all nodes and references even in branches that may short-circuit', legacyCompatibility: 'existing leaf structures and action limits unchanged' },
  branches: { executeExactlyOne: true, thenOrder: 'array order', elseOrder: 'array order', elseMayBeEmpty: true, nesting: false, nestingScope: 'if actions cannot nest; Boolean condition trees may nest within their limits', leafActions: ['set-status', 'set-progress-value'] },
  lifecycle: 'condition results and effects are PreviewSession state; initialize from design initial values on every Screen open and never write transient state into authority JSON',
  invalidReferences: 'reject the rule atomically; never infer an option from label or display text',
  runtime: 'design intent only; the game implementer supplies Java event callbacks and execution; Blockly generates no JavaScript or Java',
} as const;
