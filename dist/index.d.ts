import { mat4 } from 'gl-matrix';

type RGBA = readonly [number, number, number, number];
type MutableRGBA = [number, number, number, number];
interface BitmapLike {
    width: number;
    height: number;
    data: Uint8Array | Uint8ClampedArray;
}
type ImageFactory = (width: number, height: number) => BitmapLike;
declare const createUint8Bitmap: ImageFactory;

interface Material {
    baseColorFactor: [number, number, number, number];
    baseColorTexture: BitmapLike | null;
    alphaMode?: "OPAQUE" | "MASK" | "BLEND";
    alphaCutoff?: number;
}
interface DrawCall {
    positions: Float32Array;
    normals: Float32Array | null;
    uvs: Float32Array | null;
    indices: Uint32Array | null;
    model: mat4;
    material: Material;
    colors?: Float32Array | null;
    mode?: number;
    showHiddenEdges?: boolean;
}
interface GridOptions {
    size?: number | readonly [number, number, number];
    divisions?: number;
    color?: readonly [number, number, number];
    offset?: Partial<{
        x: number;
        y: number;
        z: number;
    }>;
    infiniteGrid?: boolean;
    cellSize?: number;
    sectionSize?: number;
    fadeDistance?: number;
    fadeStrength?: number;
    gridColor?: readonly [number, number, number];
    sectionColor?: readonly [number, number, number];
}
interface GLTFResources {
    buffers: Uint8Array[];
    images: BitmapLike[];
}
interface GLTFScene {
    drawCalls: DrawCall[];
    gltf: any;
}

declare const DEFAULT_LIGHT_DIR: readonly [-0.4, -0.9, -0.2];
/** A fixed screen message panel. Text and dimensions do not use world units. */
interface TextOverlay {
    title?: string;
    messages: string[];
}
interface DebugPoint {
    label: string;
    position: {
        x: number;
        y: number;
        z: number;
    };
}
type CameraUp = "y+" | "y-" | "x+" | "x-" | "z+" | "z-";
interface CameraRotation {
    x: number;
    y: number;
    z: number;
}
/**
 * Convert a hex color string to RGB array with values 0-1
 * @param hex - Hex color string like "#ffffff" or "ffffff"
 * @returns RGB array [r, g, b] with values 0-1, or null if invalid
 */
declare function hexToRgb(hex: string): [number, number, number] | null;
interface RenderOptions {
    width: number;
    height: number;
    supersampling: number;
    fov: number;
    cull: boolean;
    gamma: boolean;
    ambient: number;
    lightDir: readonly [number, number, number];
    camPos?: readonly [number, number, number] | null;
    lookAt?: readonly [number, number, number] | null;
    up: CameraUp;
    cameraRotation: CameraRotation | null;
    backgroundColor?: readonly [number, number, number] | string | null;
    grid?: boolean | GridOptions;
    /** Undefined inherits selected glTF scene metadata; null hides the panel. */
    textOverlay?: TextOverlay | null;
    debugPoints?: DebugPoint[] | null;
    debugFontSize?: number | null;
    debugPointColor?: readonly [number, number, number] | null;
    debugLabelColor?: readonly [number, number, number] | null;
}
type RenderOptionsInput = Partial<RenderOptions>;
declare const DEFAULT_RENDER_OPTIONS: RenderOptions;
declare function getDefaultRenderOptions(): RenderOptions;

interface Camera {
    view: mat4;
    proj: mat4;
}
declare function buildCamera(drawCalls: DrawCall[], width: number, height: number, fovDeg: number, camPos: readonly [number, number, number] | null | undefined, lookAt: readonly [number, number, number] | null | undefined, up?: CameraUp | null | undefined, cameraRotation?: CameraRotation | null | undefined): Camera;

interface RenderResult {
    bitmap: BitmapLike;
    camera: Camera;
    options: RenderOptions;
}
declare function renderDrawCalls(drawCalls: DrawCall[], optionsInput?: RenderOptionsInput, imageFactory?: ImageFactory): RenderResult;

declare function resolveRenderOptions(options?: RenderOptionsInput): RenderOptions;

declare function createGrid(options?: GridOptions): DrawCall;

/**
 * Builds a line draw call from the boundary and crease edges of a triangle
 * mesh. Vertices are welded by position so glTF meshes that duplicate vertices
 * for normals or UV seams do not produce coplanar triangulation lines.
 */
declare function createEdgeDrawCall(mesh: DrawCall, creaseAngleDegrees?: number): DrawCall | null;

/**
 * Creates an infinite grid that matches the appearance of the 3d-viewer reference.
 * This grid uses a special rendering approach with procedural generation and fading.
 */
declare function createInfiniteGrid(options?: GridOptions): DrawCall & {
    isInfiniteGrid: boolean;
    cellSize: number;
    sectionSize: number;
    fadeDistance: number;
    fadeStrength: number;
    gridColor: readonly [number, number, number];
    sectionColor: readonly [number, number, number];
};

type GLTF = any;
declare function createSceneFromGLTF(gltf: GLTF, resources: GLTFResources): GLTFScene;

declare function computeSmoothNormals(positions: Float32Array, indices: Uint32Array | null): Float32Array;

declare function computeWorldAABB(drawCalls: DrawCall[]): {
    min: number[];
    max: number[];
};

interface FetchLikeResponse {
    ok: boolean;
    status: number;
    statusText: string;
    url?: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}
type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<FetchLikeResponse>;
interface LoadGLTFWithResourcesFromURLOptions {
    fetchImpl?: FetchLike;
}
declare function loadGLTFWithResourcesFromURL(url: string, options?: LoadGLTFWithResourcesFromURLOptions): Promise<{
    gltf: any;
    resources: GLTFResources;
}>;

declare function bufferFromDataURI(uri: string): Uint8Array;
declare function isPNG(filenameOrUri: string): boolean;
declare function isJPG(filenameOrUri: string): boolean;
declare function decodeImageFromBuffer(buf: Uint8Array, mimeType?: string | null): Promise<BitmapLike>;

interface LightSettings {
    dir: readonly [number, number, number];
    ambient: number;
}
interface LineRenderOptions {
    depthCompare?: "less" | "less-equal" | "greater";
    depthWrite?: boolean;
    depthBias?: number;
    dashed?: boolean;
    dashLength?: number;
    opacity?: number;
}
declare class SoftwareRenderer {
    readonly width: number;
    readonly height: number;
    readonly bitmap: BitmapLike;
    readonly depth: Float32Array;
    constructor(width: number, height: number, imageFactory?: ImageFactory);
    get buffer(): Uint8Array<ArrayBufferLike> | Uint8ClampedArray<ArrayBufferLike>;
    clear(colorRGBA?: [number, number, number, number]): void;
    setPixel(x: number, y: number, r: number, g: number, b: number, a: number): void;
    drawLines(mesh: DrawCall, camera: Camera, gammaOut?: boolean, options?: LineRenderOptions): void;
    sampleTextureNearest(img: BitmapLike | null, u: number, v: number): MutableRGBA;
    perspInterp(attrs: number[][], invWs: number[], lambdas: number[]): number[];
    drawMesh(mesh: DrawCall, camera: Camera, light: LightSettings, material: Material, cullBackFaces?: boolean, gammaOut?: boolean): void;
}

/**
 * Draws an infinite grid with fade-out effect matching 3d-viewer appearance
 */
declare function drawInfiniteGrid(software_renderer: SoftwareRenderer, params: {
    camera: Camera;
    grid_y?: number;
    cell_size?: number;
    section_size?: number;
    fade_distance?: number;
    fade_strength?: number;
    grid_color?: readonly [number, number, number];
    section_color?: readonly [number, number, number];
    gamma_out?: boolean;
}): void;

declare function encodePNG(image: BitmapLike): Promise<Uint8Array>;

interface RenderGLTFToPNGFromURLOptions extends RenderOptionsInput, LoadGLTFWithResourcesFromURLOptions {
}
declare function renderGLTFToPNGFromURL(url: string, options?: RenderGLTFToPNGFromURLOptions): Promise<Uint8Array>;

type RenderGLTFToPNGFromGLBOptions = RenderOptionsInput;
declare function renderGLTFToPNGFromGLB(glb: ArrayBuffer | Uint8Array, options?: RenderGLTFToPNGFromGLBOptions): Promise<Uint8Array>;

/** Render selected-scene annotations as screen pixels, independent of the
 * scene's world coordinates, camera, lighting, and geometry bounds. */
declare function renderSceneFromGLTF(scene: GLTFScene, options?: RenderOptionsInput, imageFactory?: ImageFactory): RenderResult;

export { type BitmapLike, type Camera, type CameraRotation, type CameraUp, DEFAULT_LIGHT_DIR, DEFAULT_RENDER_OPTIONS, type DebugPoint, type DrawCall, type FetchLike, type GLTFResources, type GLTFScene, type GridOptions, type ImageFactory, type LightSettings, type LineRenderOptions, type LoadGLTFWithResourcesFromURLOptions, type Material, type MutableRGBA, type RGBA, type RenderGLTFToPNGFromGLBOptions, type RenderGLTFToPNGFromURLOptions, type RenderOptions, type RenderOptionsInput, type RenderResult, SoftwareRenderer, type TextOverlay, bufferFromDataURI, buildCamera, computeSmoothNormals, computeWorldAABB, createEdgeDrawCall, createGrid, createInfiniteGrid, createSceneFromGLTF, createUint8Bitmap, decodeImageFromBuffer, drawInfiniteGrid, encodePNG, getDefaultRenderOptions, hexToRgb, isJPG, isPNG, loadGLTFWithResourcesFromURL, renderDrawCalls, renderGLTFToPNGFromGLB, renderGLTFToPNGFromURL, renderSceneFromGLTF, resolveRenderOptions };
