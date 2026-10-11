export { canonicalJson } from './canonical';
export {
  ENGINE_ID_PATTERN,
  SEMVER_PATTERN,
  type CalcContext,
  type Discipline,
  type EngineDefinition,
  type EnginePresentation,
  type FormulaDoc,
  type InputPresentation,
  type OutputPresentation,
  type VerifyContext,
} from './engine';
export type {
  CategoryAxis,
  NumericAxis,
  ParameterKind,
  ParameterRequirement,
  ParameterSource,
  ParameterValue,
  ResolvedParameter,
  StandardRef,
  TableAxis,
  TableValue,
  VerificationStatus,
} from './params/parameter';
export {
  ParameterAccessError,
  ParameterReader,
  ResolvedParameterSet,
  type ParameterError,
} from './params/resolved-parameter-set';
export {
  readTable,
  validateTable,
  type TableCoordinates,
  type TableError,
  type TableReading,
} from './params/table';
export { run, zodErrors } from './pipeline/run';
export { EngineRegistry, type AnyEngine } from './registry/engine-registry';
export type * from './result/calculation-result';
export { err, ok, type Result } from './result/result';
export {
  checkLimit,
  HypothesisRecorder,
  TraceRecorder,
  WarningRecorder,
  type LimitCheck,
} from './trace/recorders';
export { quantity, type Measured, type QuantityBounds } from './units/quantity';
export {
  convert,
  findUnit,
  fromSI,
  isUnitSymbol,
  toSI,
  UNITS,
  unitsOfKind,
  type UnitDefinition,
  type UnitError,
  type UnitKind,
  type UnitOfKind,
  type UnitSymbol,
} from './units/registry';
