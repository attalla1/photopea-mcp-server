// src/bridge/types.ts

// --- WebSocket Protocol Messages ---

/** Server -> Client: execute a Photopea script */
export interface ExecuteMessage {
  id: string;
  type: "execute";
  script: string;
  expectFiles: boolean;
}

/** Server -> Client: load a binary file into Photopea */
export interface LoadMessage {
  id: string;
  type: "load";
  data: string; // base64-encoded
  filename: string;
}

export type ServerToClientMessage = ExecuteMessage | LoadMessage;

/** Client -> Server: script execution result */
export interface ResultMessage {
  id: string;
  type: "result";
  success: boolean;
  data: string | null;
  error: string | null;
}

/** Client -> Server: file data from export */
export interface FileMessage {
  id: string;
  type: "file";
  success: boolean;
  data: string; // base64-encoded
  mimeType: string;
  error: string | null;
}

/** Client -> Server: status update */
export interface StatusMessage {
  type: "status";
  status: "ready" | "disconnected";
}

/** Client -> Server: activity log entry for the frontend */
export interface ActivityMessage {
  type: "activity";
  id: string;
  tool: string;
  summary: string;
}

export type ClientToServerMessage =
  | ResultMessage
  | FileMessage
  | StatusMessage;

// --- Bridge Internal Types ---

export interface BridgeResult {
  success: boolean;
  data: string | null;
  error: string | null;
}

export interface BridgeFileResult {
  success: boolean;
  data: Buffer;
  mimeType: string;
  error: string | null;
}

export interface PendingRequest {
  id: string;
  resolve: (value: BridgeResult | BridgeFileResult) => void;
  reject: (reason: Error) => void;
  expectFiles: boolean;
  timer: ReturnType<typeof setTimeout>;
}

// --- Tool Parameter Types ---

export interface CreateDocumentParams {
  width: number;
  height: number;
  resolution?: number;
  name?: string;
  mode?: string;
  fillColor?: string;
}

export interface ResizeDocumentParams {
  width: number;
  height: number;
  resampleMethod?: string;
  anchor?: string;
}

export interface LayerTarget {
  target: string | number;
}

export interface AddLayerParams {
  name?: string;
  opacity?: number;
  blendMode?: string;
}

export interface AddFillLayerParams {
  type: "solid" | "gradient" | "pattern";
  color?: string;
  gradient?: GradientSpec;
  name?: string;
}

export interface GradientSpec {
  colors: string[];
  angle?: number;
}

export interface SetLayerPropertiesParams {
  target: string | number;
  opacity?: number;
  blendMode?: string;
  visible?: boolean;
  name?: string;
  locked?: boolean;
}

export interface MoveLayerParams {
  target: string | number;
  x: number;
  y: number;
}

export interface DuplicateLayerParams {
  target: string | number;
  newName?: string;
}

export interface ReorderLayerParams {
  target: string | number;
  position: "above" | "below" | "top" | "bottom";
}

export interface GroupLayersParams {
  layers: string[];
  groupName?: string;
}

export interface AddShapeParams {
  type: "rectangle" | "ellipse" | "line" | "polygon";
  bounds: { x: number; y: number; width: number; height: number };
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  name?: string;
}

export interface AddTextParams {
  content: string;
  x: number;
  y: number;
  font?: string;
  size?: number;
  color?: string;
  alignment?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  paragraphBounds?: { width: number; height: number } | null;
}

export interface EditTextParams {
  target: string | number;
  content?: string;
  font?: string;
  size?: number;
  color?: string;
  alignment?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
}

export interface PlaceImageParams {
  source: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
}

export interface ApplyAdjustmentParams {
  type: string;
  settings?: Record<string, number | string | boolean>;
}

export interface ApplyFilterParams {
  type: string;
  settings?: Record<string, number | string | boolean>;
}

export interface TransformLayerParams {
  target: string | number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

export interface DropShadowSpec {
  color?: string;
  opacity?: number;
  angle?: number;
  distance?: number;
  spread?: number;
  size?: number;
}

export interface StrokeSpec {
  color?: string;
  size?: number;
  position?: "outside" | "inside" | "center";
  opacity?: number;
}

export interface GlowSpec {
  color?: string;
  opacity?: number;
  size?: number;
  spread?: number;
}

export interface ApplyLayerStyleParams {
  target: string | number;
  dropShadow?: DropShadowSpec;
  stroke?: StrokeSpec;
  outerGlow?: GlowSpec;
  innerGlow?: GlowSpec;
  colorOverlay?: { color: string; opacity?: number };
  gradientOverlay?: { colors: string[]; angle?: number; opacity?: number };
}

export interface AddGradientParams {
  target: string | number;
  type: "linear" | "radial" | "angular";
  colors: string[];
  angle?: number;
  scale?: number;
}

export interface MakeSelectionParams {
  type: "all" | "rect" | "ellipse";
  bounds?: { x: number; y: number; width: number; height: number };
  feather?: number;
}

export interface ModifySelectionParams {
  action: "expand" | "contract" | "feather" | "invert";
  amount?: number;
}

export interface FillSelectionParams {
  color: string;
  opacity?: number;
  blendMode?: string;
}

export interface ReplaceSmartObjectParams {
  target: string | number;
  source: string;
}

export interface ExportImageParams {
  format: "png" | "jpg" | "webp" | "psd" | "svg";
  quality?: number;
  outputPath: string;
}

export interface GetPreviewParams {
  maxWidth?: number;
  maxHeight?: number;
}

export interface BatchExportEntry {
  format: "png" | "jpg" | "webp" | "psd" | "svg";
  quality?: number;
  outputPath: string;
  width?: number;
  height?: number;
}

export interface BatchExportParams {
  exports: BatchExportEntry[];
}

export interface SetBackgroundParams {
  type: "solid" | "gradient" | "image";
  color?: string;
  gradient?: GradientSpec;
  imageSource?: string;
  blur?: number;
}

export interface CreateBannerParams {
  width: number;
  height: number;
  title: string;
  subtitle?: string;
  backgroundColor?: string;
  accentColor?: string;
  titleFont?: string;
  titleSize?: number;
  titleColor?: string;
  backgroundImage?: string;
  layout?: "centered" | "left" | "split";
  outputPath?: string;
}

export interface LoadTemplateParams {
  source: string;
}

export interface TemplateVariable {
  [layerName: string]: string;
}

export interface ApplyTemplateVariablesParams {
  variables: TemplateVariable;
}

export interface ComposeLayerEntry {
  type: "text" | "image" | "shape" | "fill";
  [key: string]: unknown;
}

export interface ComposeLayersParams {
  layers: ComposeLayerEntry[];
}

// --- Layer Info Types (returned by get_layers) ---

export interface LayerInfo {
  name: string;
  index: number;
  type: string;
  visible: boolean;
  opacity: number;
  bounds: { x: number; y: number; width: number; height: number };
  children?: LayerInfo[];
}

export interface DocumentInfo {
  name: string;
  width: number;
  height: number;
  resolution: number;
  layerCount: number;
  colorMode: string;
}
