// lib/camera/buildCamera.ts
import { mat4, vec3 } from "gl-matrix";

// lib/gltf/computeWorldAABB.ts
import { vec4 } from "gl-matrix";
function computeWorldAABB(drawCalls) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const tmp = vec4.create();
  for (const dc of drawCalls) {
    const { positions, model } = dc;
    for (let i = 0; i < positions.length; i += 3) {
      vec4.set(tmp, positions[i], positions[i + 1], positions[i + 2], 1);
      vec4.transformMat4(tmp, tmp, model);
      const x = tmp[0];
      const y = tmp[1];
      const z = tmp[2];
      min[0] = Math.min(min[0], x);
      min[1] = Math.min(min[1], y);
      min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x);
      max[1] = Math.max(max[1], y);
      max[2] = Math.max(max[2], z);
    }
  }
  if (!isFinite(min[0])) {
    return {
      min: [-1, -1, -1],
      max: [1, 1, 1]
    };
  }
  return { min, max };
}

// lib/utils/toRad.ts
var toRad = (degrees) => degrees * Math.PI / 180;

// lib/camera/buildCamera.ts
function getWorldUpVector(up) {
  switch (up) {
    case "y-":
      return vec3.fromValues(0, -1, 0);
    case "x+":
      return vec3.fromValues(1, 0, 0);
    case "x-":
      return vec3.fromValues(-1, 0, 0);
    case "z+":
      return vec3.fromValues(0, 0, 1);
    case "z-":
      return vec3.fromValues(0, 0, -1);
    case "y+":
    default:
      return vec3.fromValues(0, 1, 0);
  }
}
function buildCameraWorldMatrix(eye, forward, up) {
  const normalizedForward = vec3.normalize(vec3.create(), forward);
  const right = vec3.cross(vec3.create(), normalizedForward, up);
  if (vec3.squaredLength(right) === 0) {
    return null;
  }
  vec3.normalize(right, right);
  const correctedUp = vec3.cross(vec3.create(), right, normalizedForward);
  if (vec3.squaredLength(correctedUp) === 0) {
    return null;
  }
  vec3.normalize(correctedUp, correctedUp);
  return mat4.fromValues(
    right[0],
    right[1],
    right[2],
    0,
    correctedUp[0],
    correctedUp[1],
    correctedUp[2],
    0,
    -normalizedForward[0],
    -normalizedForward[1],
    -normalizedForward[2],
    0,
    eye[0],
    eye[1],
    eye[2],
    1
  );
}
function getDefaultForwardForUp(up) {
  const zForward = vec3.fromValues(0, 0, -1);
  if (Math.abs(vec3.dot(up, zForward)) < 0.999) {
    return zForward;
  }
  return vec3.fromValues(1, 0, 0);
}
function buildViewFromRotation(eye, up, rotation) {
  const cameraWorld = buildCameraWorldMatrix(
    eye,
    getDefaultForwardForUp(up),
    up
  );
  if (!cameraWorld) {
    return mat4.create();
  }
  if (rotation.x !== 0) {
    mat4.rotateX(cameraWorld, cameraWorld, toRad(rotation.x));
  }
  if (rotation.y !== 0) {
    mat4.rotateY(cameraWorld, cameraWorld, toRad(rotation.y));
  }
  if (rotation.z !== 0) {
    mat4.rotateZ(cameraWorld, cameraWorld, toRad(rotation.z));
  }
  const view = mat4.create();
  mat4.invert(view, cameraWorld);
  return view;
}
function buildViewFromLookAt(eye, center, up) {
  const forward = vec3.subtract(vec3.create(), center, eye);
  if (vec3.squaredLength(forward) === 0) {
    return mat4.create();
  }
  const cameraWorld = buildCameraWorldMatrix(eye, forward, up);
  if (!cameraWorld) {
    return mat4.create();
  }
  const view = mat4.create();
  mat4.invert(view, cameraWorld);
  return view;
}
function getAutoDistance(drawCalls, fovDeg) {
  const aabb = computeWorldAABB(drawCalls);
  const diag = vec3.distance(
    vec3.fromValues(aabb.min[0], aabb.min[1], aabb.min[2]),
    vec3.fromValues(aabb.max[0], aabb.max[1], aabb.max[2])
  );
  const radius = diag * 0.5;
  const fov = toRad(fovDeg);
  return radius / Math.tan(fov * 0.5) + radius * 0.5;
}
function getAABBCornerDistances(aabb, eye) {
  const xs = [aabb.min[0], aabb.max[0]];
  const ys = [aabb.min[1], aabb.max[1]];
  const zs = [aabb.min[2], aabb.max[2]];
  let nearest = Infinity;
  let farthest = 0;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const distance = vec3.distance(eye, vec3.fromValues(x, y, z));
        nearest = Math.min(nearest, distance);
        farthest = Math.max(farthest, distance);
      }
    }
  }
  return { nearest, farthest };
}
function getCameraForwardFromView(view) {
  const cameraWorld = mat4.create();
  mat4.invert(cameraWorld, view);
  return vec3.fromValues(-cameraWorld[8], -cameraWorld[9], -cameraWorld[10]);
}
function buildCamera(drawCalls, width, height, fovDeg, camPos, lookAt, up = "y+", cameraRotation = null) {
  const aspect = width / height;
  const worldUp = getWorldUpVector(up);
  const aabb = computeWorldAABB(drawCalls);
  const center = vec3.fromValues(
    0.5 * (aabb.min[0] + aabb.max[0]),
    0.5 * (aabb.min[1] + aabb.max[1]),
    0.5 * (aabb.min[2] + aabb.max[2])
  );
  const autoDistance = getAutoDistance(drawCalls, fovDeg);
  if (cameraRotation) {
    const provisionalEye = camPos ? vec3.fromValues(camPos[0], camPos[1], camPos[2]) : vec3.clone(center);
    const provisionalView = buildViewFromRotation(
      provisionalEye,
      worldUp,
      cameraRotation
    );
    const eye2 = camPos ? provisionalEye : vec3.scaleAndAdd(
      vec3.create(),
      center,
      getCameraForwardFromView(provisionalView),
      -autoDistance
    );
    const { nearest: nearest2, farthest: farthest2 } = getAABBCornerDistances(aabb, eye2);
    const near2 = Math.max(0.01, nearest2 * 0.5);
    const far2 = Math.max(1e3, farthest2 * 1.1);
    const proj2 = mat4.create();
    mat4.perspective(proj2, toRad(fovDeg), aspect, near2, far2);
    return {
      view: buildViewFromRotation(eye2, worldUp, cameraRotation),
      proj: proj2
    };
  }
  const eye = camPos ? vec3.fromValues(camPos[0], camPos[1], camPos[2]) : vec3.fromValues(
    center[0] + autoDistance,
    center[1] + autoDistance * 0.3,
    center[2] + autoDistance
  );
  const target = lookAt ? vec3.fromValues(lookAt[0], lookAt[1], lookAt[2]) : center;
  const { nearest, farthest } = getAABBCornerDistances(aabb, eye);
  const near = Math.max(0.01, nearest * 0.5);
  const far = Math.max(1e3, farthest * 1.1);
  const proj = mat4.create();
  mat4.perspective(proj, toRad(fovDeg), aspect, near, far);
  const view = buildViewFromLookAt(eye, target, worldUp);
  return { view, proj };
}

// lib/gltf/createGrid.ts
import { mat4 as mat42 } from "gl-matrix";
function createGrid(options = {}) {
  const size = options.size ?? 10;
  const sizeX = typeof size === "number" ? size : size[0];
  const sizeZ = typeof size === "number" ? size : size[2];
  const divisions = options.divisions ?? 10;
  const color = options.color ?? [0.5, 0.5, 0.5];
  const offset = { x: 0, y: 0, z: 0, ...options.offset };
  const positions = [];
  const indices = [];
  let vertexIndex = 0;
  const halfSizeX = sizeX / 2;
  const halfSizeZ = sizeZ / 2;
  const stepX = sizeX / divisions;
  const stepZ = sizeZ / divisions;
  for (let i = 0; i <= divisions; i++) {
    const pX = -halfSizeX + i * stepX;
    const pZ = -halfSizeZ + i * stepZ;
    positions.push(pX, 0, -halfSizeZ);
    positions.push(pX, 0, halfSizeZ);
    indices.push(vertexIndex++, vertexIndex++);
    positions.push(-halfSizeX, 0, pZ);
    positions.push(halfSizeX, 0, pZ);
    indices.push(vertexIndex++, vertexIndex++);
  }
  const model = mat42.create();
  mat42.fromTranslation(model, [offset.x, offset.y, offset.z]);
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: null,
    uvs: null,
    model,
    material: {
      baseColorFactor: [...color, 1],
      baseColorTexture: null
    },
    mode: 1
    // 1 = LINES
  };
}

// lib/gltf/createEdgeDrawCall.ts
var DEFAULT_CREASE_ANGLE_DEGREES = 30;
function positionKey(positions, index) {
  return `${positions[index * 3 + 0]},${positions[index * 3 + 1]},${positions[index * 3 + 2]}`;
}
function triangleNormal(positions, i0, i1, i2) {
  const ax = positions[i1 * 3 + 0] - positions[i0 * 3 + 0];
  const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
  const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
  const bx = positions[i2 * 3 + 0] - positions[i0 * 3 + 0];
  const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
  const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const length = Math.hypot(nx, ny, nz);
  if (length === 0) return null;
  return [nx / length, ny / length, nz / length];
}
function addEdge(edges, positions, i0, i1, normal) {
  const key0 = positionKey(positions, i0);
  const key1 = positionKey(positions, i1);
  const isForward = key0 < key1;
  const key = isForward ? `${key0}|${key1}` : `${key1}|${key0}`;
  const indices = isForward ? [i0, i1] : [i1, i0];
  const existing = edges.get(key);
  if (existing) {
    if (normal) existing.normals.push(normal);
  } else {
    edges.set(key, { indices, normals: normal ? [normal] : [] });
  }
}
function hasCrease(normals, minimumDot) {
  if (normals.length < 2) return true;
  for (let i = 0; i < normals.length; i++) {
    for (let j = i + 1; j < normals.length; j++) {
      const a = normals[i];
      const b = normals[j];
      const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      if (dot < minimumDot) return true;
    }
  }
  return false;
}
function createEdgeDrawCall(mesh, creaseAngleDegrees = DEFAULT_CREASE_ANGLE_DEGREES) {
  if (mesh.mode != null && mesh.mode !== 4) return null;
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangleIndices = mesh.indices ?? Uint32Array.from({ length: vertexCount }, (_, i) => i);
  if (triangleIndices.length < 3) return null;
  const edges = /* @__PURE__ */ new Map();
  for (let i = 0; i + 2 < triangleIndices.length; i += 3) {
    const i0 = triangleIndices[i];
    const i1 = triangleIndices[i + 1];
    const i2 = triangleIndices[i + 2];
    const normal = triangleNormal(mesh.positions, i0, i1, i2);
    addEdge(edges, mesh.positions, i0, i1, normal);
    addEdge(edges, mesh.positions, i1, i2, normal);
    addEdge(edges, mesh.positions, i2, i0, normal);
  }
  const minimumDot = Math.cos(creaseAngleDegrees * Math.PI / 180);
  const edgeIndices = [];
  for (const edge2 of edges.values()) {
    if (!hasCrease(edge2.normals, minimumDot)) continue;
    edgeIndices.push(edge2.indices[0], edge2.indices[1]);
  }
  if (edgeIndices.length === 0) return null;
  return {
    positions: mesh.positions,
    normals: null,
    uvs: null,
    indices: new Uint32Array(edgeIndices),
    model: mesh.model,
    material: {
      baseColorFactor: [0, 0, 0, 1],
      baseColorTexture: null,
      alphaMode: "BLEND"
    },
    mode: 1
  };
}

// lib/image/createUint8Bitmap.ts
var createUint8Bitmap = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4)
});

// lib/render/downsampleBitmap.ts
function downsampleBitmap(source, targetWidth, targetHeight, imageFactory) {
  const target = imageFactory(targetWidth, targetHeight);
  const scaleX = source.width / targetWidth;
  const scaleY = source.height / targetHeight;
  for (let y = 0; y < targetHeight; y++) {
    const srcY0 = Math.floor(y * scaleY);
    const srcY1 = Math.max(
      srcY0 + 1,
      Math.min(source.height, Math.floor((y + 1) * scaleY))
    );
    for (let x = 0; x < targetWidth; x++) {
      const srcX0 = Math.floor(x * scaleX);
      const srcX1 = Math.max(
        srcX0 + 1,
        Math.min(source.width, Math.floor((x + 1) * scaleX))
      );
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const srcIdx = (sy * source.width + sx) * 4;
          r += source.data[srcIdx + 0];
          g += source.data[srcIdx + 1];
          b += source.data[srcIdx + 2];
          a += source.data[srcIdx + 3];
          count++;
        }
      }
      const dstIdx = (y * targetWidth + x) * 4;
      target.data[dstIdx + 0] = Math.round(r / count);
      target.data[dstIdx + 1] = Math.round(g / count);
      target.data[dstIdx + 2] = Math.round(b / count);
      target.data[dstIdx + 3] = Math.round(a / count);
    }
  }
  return target;
}

// lib/render/drawDebugPoints.ts
import { textMetrics as textMetrics2 } from "@tscircuit/alphabet";
import { mat4 as mat44, vec4 as vec43 } from "gl-matrix";

// lib/render/SoftwareRenderer.ts
import { mat3, mat4 as mat43, vec3 as vec32, vec4 as vec42 } from "gl-matrix";

// lib/gltf/computeSmoothNormals.ts
function computeSmoothNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  const vertexCount = positions.length / 3 | 0;
  const indexArray = indices ?? (() => {
    const arr = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) arr[i] = i;
    return arr;
  })();
  for (let i = 0; i < indexArray.length; i += 3) {
    const i0 = indexArray[i + 0];
    const i1 = indexArray[i + 1];
    const i2 = indexArray[i + 2];
    const p0 = [
      positions[i0 * 3 + 0],
      positions[i0 * 3 + 1],
      positions[i0 * 3 + 2]
    ];
    const p1 = [
      positions[i1 * 3 + 0],
      positions[i1 * 3 + 1],
      positions[i1 * 3 + 2]
    ];
    const p2 = [
      positions[i2 * 3 + 0],
      positions[i2 * 3 + 1],
      positions[i2 * 3 + 2]
    ];
    const v10 = [
      p1[0] - p0[0],
      p1[1] - p0[1],
      p1[2] - p0[2]
    ];
    const v20 = [
      p2[0] - p0[0],
      p2[1] - p0[1],
      p2[2] - p0[2]
    ];
    const nx = v10[1] * v20[2] - v10[2] * v20[1];
    const ny = v10[2] * v20[0] - v10[0] * v20[2];
    const nz = v10[0] * v20[1] - v10[1] * v20[0];
    const base0 = i0 * 3;
    const base1 = i1 * 3;
    const base2 = i2 * 3;
    normals[base0 + 0] = normals[base0 + 0] + nx;
    normals[base0 + 1] = normals[base0 + 1] + ny;
    normals[base0 + 2] = normals[base0 + 2] + nz;
    normals[base1 + 0] = normals[base1 + 0] + nx;
    normals[base1 + 1] = normals[base1 + 1] + ny;
    normals[base1 + 2] = normals[base1 + 2] + nz;
    normals[base2 + 0] = normals[base2 + 0] + nx;
    normals[base2 + 1] = normals[base2 + 1] + ny;
    normals[base2 + 2] = normals[base2 + 2] + nz;
  }
  for (let i = 0; i < vertexCount; i++) {
    const nx = normals[i * 3 + 0];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const invLength = 1 / (Math.hypot(nx, ny, nz) || 1);
    normals[i * 3 + 0] = nx * invLength;
    normals[i * 3 + 1] = ny * invLength;
    normals[i * 3 + 2] = nz * invLength;
  }
  return normals;
}

// lib/render/getDefaultRenderOptions.ts
var DEFAULT_LIGHT_DIR = [-0.4, -0.9, -0.2];
function hexToRgb(hex) {
  const cleanHex = hex.replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    return null;
  }
  const r = Number.parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = Number.parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = Number.parseInt(cleanHex.substring(4, 6), 16) / 255;
  return [r, g, b];
}
var DEFAULT_RENDER_OPTIONS = {
  width: 800,
  height: 600,
  supersampling: 1,
  fov: 60,
  cull: true,
  gamma: true,
  ambient: 0.15,
  lightDir: DEFAULT_LIGHT_DIR,
  camPos: null,
  lookAt: null,
  up: "y+",
  cameraRotation: null,
  backgroundColor: null,
  grid: false,
  debugPoints: null,
  debugFontSize: null,
  debugPointColor: null,
  debugLabelColor: null
};
function getDefaultRenderOptions() {
  return { ...DEFAULT_RENDER_OPTIONS };
}

// lib/utils/mulColor.ts
function mulColor(a, b) {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2], a[3] * b[3]];
}

// lib/utils/srgbEncodeLinear01.ts
function srgbEncodeLinear01(linear) {
  if (linear <= 31308e-7) return 12.92 * linear;
  return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}

// lib/utils/srgbDecodeToLinear01.ts
function srgbDecodeToLinear01(srgb) {
  if (srgb <= 0.04045) return srgb / 12.92;
  return ((srgb + 0.055) / 1.055) ** 2.4;
}

// lib/utils/clamp.ts
var clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// lib/render/SoftwareRenderer.ts
var SoftwareRenderer = class {
  width;
  height;
  bitmap;
  depth;
  constructor(width, height, imageFactory = createUint8Bitmap) {
    this.width = width;
    this.height = height;
    this.bitmap = imageFactory(width, height);
    this.depth = new Float32Array(width * height);
  }
  get buffer() {
    return this.bitmap.data;
  }
  clear(colorRGBA = [0, 0, 0, 255]) {
    const [r, g, b, a] = colorRGBA;
    for (let i = 0; i < this.width * this.height; i++) {
      const j = i * 4;
      this.buffer[j + 0] = r;
      this.buffer[j + 1] = g;
      this.buffer[j + 2] = b;
      this.buffer[j + 3] = a;
      this.depth[i] = Infinity;
    }
  }
  setPixel(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    this.buffer[idx + 0] = r;
    this.buffer[idx + 1] = g;
    this.buffer[idx + 2] = b;
    this.buffer[idx + 3] = a;
  }
  drawLines(mesh, camera, gammaOut = true, options = {}) {
    const { positions, indices, model, material } = mesh;
    if (!indices) return;
    const view = camera.view;
    const proj = camera.proj;
    const mvp = mat43.create();
    mat43.multiply(mvp, proj, mat43.multiply(mat43.create(), view, model));
    const vertexCount = positions.length / 3 | 0;
    const vScreen = new Array(vertexCount);
    const vInvW = new Float32Array(vertexCount);
    const vNDCz = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const p = vec42.fromValues(
        positions[i * 3 + 0],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
        1
      );
      const c = vec42.create();
      vec42.transformMat4(c, p, mvp);
      const invW = 1 / c[3];
      vInvW[i] = invW;
      if (!isFinite(invW)) {
        vScreen[i] = [NaN, NaN];
        vNDCz[i] = NaN;
        continue;
      }
      const ndcX = c[0] * invW;
      const ndcY = c[1] * invW;
      const ndcZ = c[2] * invW;
      const sx = (ndcX * 0.5 + 0.5) * (this.width - 1);
      const sy = (1 - (ndcY * 0.5 + 0.5)) * (this.height - 1);
      vScreen[i] = [sx, sy];
      vNDCz[i] = ndcZ;
    }
    let [r, g, b, a] = material.baseColorFactor;
    if (gammaOut) {
      r = srgbEncodeLinear01(clamp(r, 0, 1));
      g = srgbEncodeLinear01(clamp(g, 0, 1));
      b = srgbEncodeLinear01(clamp(b, 0, 1));
    } else {
      r = clamp(r, 0, 1);
      g = clamp(g, 0, 1);
      b = clamp(b, 0, 1);
    }
    const r255 = r * 255 | 0;
    const g255 = g * 255 | 0;
    const b255 = b * 255 | 0;
    const opacity = clamp(options.opacity ?? 1, 0, 1);
    const sourceAlpha = clamp(a, 0, 1) * opacity;
    const depthCompare = options.depthCompare ?? "less";
    const depthWrite = options.depthWrite ?? true;
    const depthBias = options.depthBias ?? 0;
    const dashLength = Math.max(1, options.dashLength ?? 4);
    for (let i = 0; i < indices.length; i += 2) {
      const i0 = indices[i + 0];
      const i1 = indices[i + 1];
      const v0s = vScreen[i0];
      const v1s = vScreen[i1];
      const z0_ndc = vNDCz[i0];
      const z1_ndc = vNDCz[i1];
      if (isNaN(v0s[0]) || isNaN(v1s[0])) continue;
      const z0_01 = z0_ndc * 0.5 + 0.5;
      const z1_01 = z1_ndc * 0.5 + 0.5;
      if (z0_01 < 0 && z1_01 < 0 || z0_01 > 1 && z1_01 > 1) continue;
      const x0 = Math.round(v0s[0]);
      const y0 = Math.round(v0s[1]);
      const x1 = Math.round(v1s[0]);
      const y1 = Math.round(v1s[1]);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      if (steps === 0) continue;
      const xinc = dx / steps;
      const yinc = dy / steps;
      const zinc = (z1_01 - z0_01) / steps;
      let x = x0;
      let y = y0;
      let z = z0_01;
      for (let k = 0; k <= steps; k++) {
        if (options.dashed && Math.floor(k / dashLength) % 2 === 1) {
          x += xinc;
          y += yinc;
          z += zinc;
          continue;
        }
        const xi = Math.round(x);
        const yi = Math.round(y);
        if (xi >= 0 && xi < this.width && yi >= 0 && yi < this.height && z >= 0 && z <= 1) {
          const di = yi * this.width + xi;
          const currentDepth = this.depth[di];
          const passesDepth = depthCompare === "greater" ? z > currentDepth + depthBias : depthCompare === "less-equal" ? z <= currentDepth + depthBias : z < currentDepth - depthBias;
          if (passesDepth) {
            if (depthWrite) this.depth[di] = z;
            const pixelIndex = di * 4;
            const destinationAlpha = this.buffer[pixelIndex + 3] / 255;
            const oneMinusSourceAlpha = 1 - sourceAlpha;
            const outAlpha = sourceAlpha + destinationAlpha * oneMinusSourceAlpha;
            const outR = outAlpha === 0 ? 0 : (r255 * sourceAlpha + this.buffer[pixelIndex + 0] * destinationAlpha * oneMinusSourceAlpha) / outAlpha;
            const outG = outAlpha === 0 ? 0 : (g255 * sourceAlpha + this.buffer[pixelIndex + 1] * destinationAlpha * oneMinusSourceAlpha) / outAlpha;
            const outB = outAlpha === 0 ? 0 : (b255 * sourceAlpha + this.buffer[pixelIndex + 2] * destinationAlpha * oneMinusSourceAlpha) / outAlpha;
            this.setPixel(xi, yi, outR, outG, outB, outAlpha * 255);
          }
        }
        x += xinc;
        y += yinc;
        z += zinc;
      }
    }
  }
  sampleTextureNearest(img, u, v) {
    if (!img) return [1, 1, 1, 1];
    const x = clamp(Math.floor(u * (img.width - 1)), 0, img.width - 1);
    const y = clamp(Math.floor(v * (img.height - 1)), 0, img.height - 1);
    const idx = (y * img.width + x) * 4;
    const d = img.data;
    return [
      d[idx + 0] / 255,
      d[idx + 1] / 255,
      d[idx + 2] / 255,
      d[idx + 3] / 255
    ];
  }
  perspInterp(attrs, invWs, lambdas) {
    const [lambda0, lambda1, lambda2] = lambdas;
    const [invW0, invW1, invW2] = invWs;
    const [attr0, attr1, attr2] = attrs;
    const denom = lambda0 * invW0 + lambda1 * invW1 + lambda2 * invW2;
    const n = attr0.length;
    const out = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      out[j] = (lambda0 * attr0[j] * invW0 + lambda1 * attr1[j] * invW1 + lambda2 * attr2[j] * invW2) / denom;
    }
    return out;
  }
  drawMesh(mesh, camera, light, material, cullBackFaces = true, gammaOut = true) {
    const { positions, normals, uvs, indices, model, colors } = mesh;
    const view = camera.view;
    const proj = camera.proj;
    const mvp = mat43.create();
    mat43.multiply(mvp, proj, mat43.multiply(mat43.create(), view, model));
    const normalMat = mat3.create();
    mat3.normalFromMat4(normalMat, model);
    const vertexCount = positions.length / 3 | 0;
    const idx = indices ?? (() => {
      const a = new Uint32Array(vertexCount);
      for (let i = 0; i < vertexCount; i++) a[i] = i;
      return a;
    })();
    let useNormals = normals;
    if (!useNormals) {
      useNormals = computeSmoothNormals(positions, idx);
    }
    const vScreen = new Array(vertexCount);
    const vInvW = new Float32Array(vertexCount);
    const vNDCz = new Float32Array(vertexCount);
    const vWorldN = new Array(vertexCount);
    const vColor = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const p = vec42.fromValues(
        positions[i * 3 + 0],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
        1
      );
      const c = vec42.create();
      vec42.transformMat4(c, p, mvp);
      const invW = 1 / c[3];
      const ndcX = c[0] * invW;
      const ndcY = c[1] * invW;
      const ndcZ = c[2] * invW;
      const sx = (ndcX * 0.5 + 0.5) * (this.width - 1);
      const sy = (1 - (ndcY * 0.5 + 0.5)) * (this.height - 1);
      vScreen[i] = [sx, sy];
      vInvW[i] = invW;
      vNDCz[i] = ndcZ;
      const n = vec32.fromValues(
        useNormals[i * 3 + 0],
        useNormals[i * 3 + 1],
        useNormals[i * 3 + 2]
      );
      const nw = vec32.create();
      vec32.transformMat3(nw, n, normalMat);
      vWorldN[i] = [nw[0], nw[1], nw[2]];
      if (colors && colors.length >= (i + 1) * 3) {
        vColor[i] = [colors[i * 3 + 0], colors[i * 3 + 1], colors[i * 3 + 2]];
      } else {
        vColor[i] = [1, 1, 1];
      }
    }
    for (let i = 0; i < idx.length; i += 3) {
      const i0 = idx[i + 0];
      const i1 = idx[i + 1];
      const i2 = idx[i + 2];
      if (!(isFinite(vInvW[i0]) && isFinite(vInvW[i1]) && isFinite(vInvW[i2])))
        continue;
      const v0 = vScreen[i0];
      const v1 = vScreen[i1];
      const v2 = vScreen[i2];
      const area = edge(v0, v1, v2);
      if (area === 0) continue;
      if (cullBackFaces && area < 0) continue;
      const minX = Math.max(0, Math.floor(Math.min(v0[0], v1[0], v2[0])));
      const maxX = Math.min(
        this.width - 1,
        Math.ceil(Math.max(v0[0], v1[0], v2[0]))
      );
      const minY = Math.max(0, Math.floor(Math.min(v0[1], v1[1], v2[1])));
      const maxY = Math.min(
        this.height - 1,
        Math.ceil(Math.max(v0[1], v1[1], v2[1]))
      );
      const invW = [
        vInvW[i0],
        vInvW[i1],
        vInvW[i2]
      ];
      const ndcZ = [
        vNDCz[i0],
        vNDCz[i1],
        vNDCz[i2]
      ];
      const nws = [
        vWorldN[i0],
        vWorldN[i1],
        vWorldN[i2]
      ];
      const uv = uvs ? [
        [uvs[i0 * 2 + 0], uvs[i0 * 2 + 1]],
        [uvs[i1 * 2 + 0], uvs[i1 * 2 + 1]],
        [uvs[i2 * 2 + 0], uvs[i2 * 2 + 1]]
      ] : null;
      const cs = [
        vColor[i0],
        vColor[i1],
        vColor[i2]
      ];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const p = [x + 0.5, y + 0.5];
          const w0 = edge(v1, v2, p);
          const w1 = edge(v2, v0, p);
          const w2 = edge(v0, v1, p);
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const invArea = 1 / area;
          const l0 = w0 * invArea;
          const l1 = w1 * invArea;
          const l2 = w2 * invArea;
          const zndc = l0 * ndcZ[0] + l1 * ndcZ[1] + l2 * ndcZ[2];
          const z01 = zndc * 0.5 + 0.5;
          if (z01 < 0 || z01 > 1) continue;
          const di = y * this.width + x;
          const depth = this.depth;
          if (z01 >= depth[di]) continue;
          depth[di] = z01;
          let baseColor = [
            material.baseColorFactor[0],
            material.baseColorFactor[1],
            material.baseColorFactor[2],
            material.baseColorFactor[3]
          ];
          if (uv && material.baseColorTexture) {
            const uvp = this.perspInterp(uv, invW, [l0, l1, l2]);
            const texel = this.sampleTextureNearest(
              material.baseColorTexture,
              uvp[0],
              uvp[1]
            );
            baseColor = mulColor(baseColor, [
              srgbDecodeToLinear01(texel[0]),
              srgbDecodeToLinear01(texel[1]),
              srgbDecodeToLinear01(texel[2]),
              texel[3]
            ]);
          }
          const [cr, cg, cb] = this.perspInterp(cs, invW, [l0, l1, l2]);
          baseColor = [
            baseColor[0] * cr,
            baseColor[1] * cg,
            baseColor[2] * cb,
            baseColor[3]
          ];
          const [np0, np1, np2] = this.perspInterp(nws, invW, [l0, l1, l2]);
          const nlen = Math.hypot(np0, np1, np2) || 1;
          const nrm = [
            np0 / nlen,
            np1 / nlen,
            np2 / nlen
          ];
          const lightDir = light.dir ?? DEFAULT_LIGHT_DIR;
          const ambient = clamp(
            light.ambient ?? DEFAULT_RENDER_OPTIONS.ambient,
            0,
            1
          );
          const L = vec32.normalize(
            vec32.create(),
            vec32.fromValues(lightDir[0], lightDir[1], lightDir[2])
          );
          const ndotl = Math.max(
            0,
            nrm[0] * -L[0] + nrm[1] * -L[1] + nrm[2] * -L[2]
          );
          const lit = ambient + (1 - ambient) * ndotl;
          let r = baseColor[0] * lit;
          let g = baseColor[1] * lit;
          let b = baseColor[2] * lit;
          let a = baseColor[3];
          const alphaMode = material.alphaMode ?? "OPAQUE";
          const alphaCutoff = material.alphaCutoff ?? 0.5;
          if (alphaMode === "MASK" && a < alphaCutoff) continue;
          if (alphaMode !== "BLEND") {
            a = 1;
          }
          const shouldWriteDepth = alphaMode !== "BLEND";
          if (shouldWriteDepth) {
            depth[di] = z01;
          }
          if (gammaOut) {
            r = srgbEncodeLinear01(clamp(r, 0, 1));
            g = srgbEncodeLinear01(clamp(g, 0, 1));
            b = srgbEncodeLinear01(clamp(b, 0, 1));
          } else {
            r = clamp(r, 0, 1);
            g = clamp(g, 0, 1);
            b = clamp(b, 0, 1);
          }
          const dstIdx = (y * this.width + x) * 4;
          const dstR = (this.buffer[dstIdx + 0] ?? 0) / 255;
          const dstG = (this.buffer[dstIdx + 1] ?? 0) / 255;
          const dstB = (this.buffer[dstIdx + 2] ?? 0) / 255;
          const dstA = (this.buffer[dstIdx + 3] ?? 0) / 255;
          let outR = r;
          let outG = g;
          let outB = b;
          let outA = a;
          if (alphaMode === "BLEND" && a < 1) {
            const oneMinusA = 1 - a;
            outR = r * a + dstR * oneMinusA;
            outG = g * a + dstG * oneMinusA;
            outB = b * a + dstB * oneMinusA;
            outA = a + dstA * oneMinusA;
          }
          this.setPixel(
            x,
            y,
            clamp(outR, 0, 1) * 255 | 0,
            clamp(outG, 0, 1) * 255 | 0,
            clamp(outB, 0, 1) * 255 | 0,
            clamp(outA, 0, 1) * 255 | 0
          );
        }
      }
    }
  }
};
function edge(a, b, p) {
  return (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
}

// lib/render/drawStrokeText.ts
import {
  glyphAdvanceRatio,
  glyphLineAlphabet,
  textMetrics
} from "@tscircuit/alphabet";
function drawStrokeText(renderer, text, x, y, scaleX, scaleY, color, thickness, glyphs = glyphLineAlphabet) {
  let cursorX = x;
  for (const rawChar of text) {
    const char = resolveGlyph(rawChar, glyphs);
    const glyph = glyphs[char];
    const advanceRatio = glyphAdvanceRatio[char] ?? (char === " " ? textMetrics.spaceWidthRatio : textMetrics.glyphWidthRatio);
    if (glyph) {
      for (const segment of glyph) {
        drawLine(
          renderer,
          cursorX + segment.x1 * scaleX,
          y + (1 - segment.y1) * scaleY,
          cursorX + segment.x2 * scaleX,
          y + (1 - segment.y2) * scaleY,
          color,
          thickness
        );
      }
    }
    cursorX += advanceRatio * scaleX;
  }
}
function resolveGlyph(char, glyphs) {
  if (glyphs[char]) return char;
  const uppercase = char.toUpperCase();
  if (glyphs[uppercase]) return uppercase;
  return "?";
}
function measureLabelWidth(text, scaleX, glyphs = glyphLineAlphabet) {
  let width = 0;
  for (const rawChar of text) {
    const char = resolveGlyph(rawChar, glyphs);
    width += glyphAdvanceRatio[char] ?? (char === " " ? textMetrics.spaceWidthRatio : textMetrics.glyphWidthRatio);
  }
  return width * scaleX;
}
function drawLine(renderer, x0, y0, x1, y1, color, thickness) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) {
    drawBrush(renderer, x0, y0, color, thickness);
    return;
  }
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    drawBrush(renderer, x0 + dx * t, y0 + dy * t, color, thickness);
  }
}
function drawBrush(renderer, x, y, color, thickness) {
  const radius = Math.max(0, Math.floor((thickness - 1) / 2));
  const centerX = Math.round(x);
  const centerY = Math.round(y);
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      renderer.setPixel(
        centerX + offsetX,
        centerY + offsetY,
        color[0],
        color[1],
        color[2],
        color[3]
      );
    }
  }
}

// lib/render/drawDebugPoints.ts
var DEFAULT_MARKER_COLOR = [
  255,
  0,
  170,
  255
];
var DEFAULT_TEXT_COLOR = [
  255,
  24,
  170,
  255
];
var CHARACTER_WIDTH_RATIO = 0.62;
function drawDebugPoints(renderer, camera, debugPoints, debugFontSize, debugPointColor, debugLabelColor) {
  if (debugPoints.length === 0) return;
  const viewProj = mat44.create();
  mat44.multiply(viewProj, camera.proj, camera.view);
  const markerColor = toColorRGBA(debugPointColor, DEFAULT_MARKER_COLOR);
  const textColor = toColorRGBA(debugLabelColor, DEFAULT_TEXT_COLOR);
  const labelScale = typeof debugFontSize === "number" && Number.isFinite(debugFontSize) ? Math.max(1, Math.round(debugFontSize)) : Math.max(
    12,
    Math.round(Math.min(renderer.width, renderer.height) * 0.028)
  );
  const textThickness = Math.max(
    2,
    Math.round(labelScale * textMetrics2.strokeWidthRatio)
  );
  for (const debugPoint of debugPoints) {
    const projected = projectWorldToScreen(
      debugPoint.position,
      viewProj,
      renderer
    );
    if (!projected) continue;
    drawMarker(renderer, projected, markerColor);
    drawLabel(
      renderer,
      projected,
      debugPoint.label,
      textColor,
      labelScale,
      textThickness
    );
  }
}
function projectWorldToScreen(position, viewProj, renderer) {
  const clip = vec43.fromValues(position.x, position.y, position.z, 1);
  vec43.transformMat4(clip, clip, viewProj);
  if (!Number.isFinite(clip[3]) || clip[3] <= 0) return null;
  const invW = 1 / clip[3];
  const ndcX = clip[0] * invW;
  const ndcY = clip[1] * invW;
  const ndcZ = clip[2] * invW;
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || !Number.isFinite(ndcZ) || ndcZ < -1 || ndcZ > 1) {
    return null;
  }
  return {
    x: (ndcX * 0.5 + 0.5) * (renderer.width - 1),
    y: (1 - (ndcY * 0.5 + 0.5)) * (renderer.height - 1)
  };
}
function drawMarker(renderer, projected, color) {
  const centerX = Math.round(projected.x);
  const centerY = Math.round(projected.y);
  for (let offset = -5; offset <= 4; offset += 1) {
    renderer.setPixel(
      centerX + offset,
      centerY,
      color[0],
      color[1],
      color[2],
      color[3]
    );
    renderer.setPixel(
      centerX,
      centerY + offset,
      color[0],
      color[1],
      color[2],
      color[3]
    );
  }
}
function drawLabel(renderer, projected, label, color, scale, textThickness) {
  if (label.length === 0) return;
  const scaleX = scale * CHARACTER_WIDTH_RATIO;
  const labelWidth = measureLabelWidth(label, scaleX);
  let x = projected.x + scale * 0.6;
  let y = projected.y - scale * 1.1;
  if (x + labelWidth > renderer.width - 2) {
    x = projected.x - scale * 0.6 - labelWidth;
  }
  if (y < 2) {
    y = projected.y + scale * 0.2;
  }
  drawStrokeText(renderer, label, x, y, scaleX, scale, color, textThickness);
}
function toColorRGBA(color, fallback) {
  if (!color) return fallback;
  return [color[0], color[1], color[2], 255];
}

// lib/render/drawTextOverlay.ts
import { glyphLineAlphabet as glyphLineAlphabet2, textMetrics as textMetrics3 } from "@tscircuit/alphabet";
var OVERLAY_GLYPHS = {
  ...glyphLineAlphabet2,
  " ": [],
  ":": [
    { x1: 0.3, y1: 0.2, x2: 0.3, y2: 0.2 },
    { x1: 0.3, y1: 0.55, x2: 0.3, y2: 0.55 }
  ],
  ";": [
    { x1: 0.3, y1: 0.55, x2: 0.3, y2: 0.55 },
    { x1: 0.3, y1: 0.2, x2: 0.2, y2: 0.05 }
  ],
  "?": [
    { x1: 0.08, y1: 0.65, x2: 0.25, y2: 0.75 },
    { x1: 0.25, y1: 0.75, x2: 0.5, y2: 0.65 },
    { x1: 0.5, y1: 0.65, x2: 0.5, y2: 0.5 },
    { x1: 0.5, y1: 0.5, x2: 0.3, y2: 0.35 },
    { x1: 0.3, y1: 0.35, x2: 0.3, y2: 0.25 },
    { x1: 0.3, y1: 0.08, x2: 0.3, y2: 0.08 }
  ]
};
var FONT_SIZE = 20;
var LINE_HEIGHT = 26;
var PADDING = 14;
var TEXT_COLOR = [248, 250, 252, 255];
var BACKGROUND_COLOR = [35, 42, 52, 255];
function supportedText(text) {
  return Array.from(text.replace(/\r\n?/g, "\n")).map(
    (character) => character === " " || character === "\n" || OVERLAY_GLYPHS[character] ? character : `[U+${character.codePointAt(0).toString(16).toUpperCase()}]`
  ).join("");
}
function wrapText(text, width) {
  return supportedText(text).split("\n").flatMap((paragraph) => {
    const lines = [];
    let remaining = paragraph;
    while (measureLabelWidth(remaining, FONT_SIZE, OVERLAY_GLYPHS) > width) {
      let end = 1;
      while (end < remaining.length && measureLabelWidth(
        remaining.slice(0, end + 1),
        FONT_SIZE,
        OVERLAY_GLYPHS
      ) <= width)
        end++;
      const space = remaining.lastIndexOf(" ", end);
      const split = space > 0 ? space : end;
      lines.push(remaining.slice(0, split));
      remaining = remaining.slice(split).replace(/^ /, "");
    }
    lines.push(remaining);
    return lines;
  });
}
function drawTextOverlay(bitmap, overlay) {
  if (!overlay.messages.length && !overlay.title) return;
  const contentWidth = Math.max(bitmap.width - PADDING * 2, FONT_SIZE);
  const allLines = [
    ...overlay.title ? wrapText(overlay.title, contentWidth) : [],
    ...overlay.messages.flatMap((message) => wrapText(message, contentWidth))
  ];
  const maxLines = Math.max(
    1,
    Math.floor((bitmap.height - PADDING * 2) / LINE_HEIGHT)
  );
  const lines = allLines.length > maxLines ? [
    ...allLines.slice(0, maxLines - 1),
    `${allLines.length - maxLines + 1} more lines`
  ] : allLines;
  const panelHeight = Math.min(
    bitmap.height,
    PADDING * 2 + lines.length * LINE_HEIGHT
  );
  const top = bitmap.height - panelHeight;
  const setPixel = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return;
    const index = (y * bitmap.width + x) * 4;
    bitmap.data[index] = r;
    bitmap.data[index + 1] = g;
    bitmap.data[index + 2] = b;
    bitmap.data[index + 3] = a;
  };
  for (let y = top; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) setPixel(x, y, ...BACKGROUND_COLOR);
  }
  lines.forEach((line, index) => {
    drawStrokeText(
      { setPixel },
      line,
      PADDING,
      top + PADDING + index * LINE_HEIGHT,
      FONT_SIZE,
      FONT_SIZE,
      TEXT_COLOR,
      Math.max(2, Math.round(FONT_SIZE * textMetrics3.strokeWidthRatio)),
      OVERLAY_GLYPHS
    );
  });
}

// lib/render/drawInfiniteGrid.ts
import { mat4 as mat45, vec4 as vec44 } from "gl-matrix";
function computeGridLineIntensity(params) {
  const rx = params.world_x / params.cell_size;
  const rz = params.world_z / params.cell_size;
  const fract_x = rx - Math.floor(rx + 0.5);
  const fract_z = rz - Math.floor(rz + 0.5);
  const grid_x = Math.abs(fract_x);
  const grid_z = Math.abs(fract_z);
  const pixel_size_in_world = params.dist / Math.min(params.screen_width, params.screen_height);
  const fwidth_x = pixel_size_in_world / params.cell_size;
  const fwidth_z = pixel_size_in_world / params.cell_size;
  const line_x = grid_x / (fwidth_x + 1e-4);
  const line_z = grid_z / (fwidth_z + 1e-4);
  const line = Math.min(line_x, line_z);
  return 1 - Math.min(line * params.line_thickness_multiplier, 1);
}
function computeGridFadeAlpha(params) {
  const fade_start = params.fade_distance;
  const fade_end = params.fade_distance * params.fade_strength;
  return 1 - Math.min(
    1,
    Math.max(0, (params.dist - fade_start) / (fade_end - fade_start))
  );
}
function drawInfiniteGrid(software_renderer, params) {
  const grid_y = params.grid_y ?? 0;
  const cell_size = params.cell_size ?? 1;
  const section_size = params.section_size ?? 10;
  const fade_distance = params.fade_distance ?? 100;
  const fade_strength = params.fade_strength ?? 1.5;
  const grid_color = params.grid_color ?? [0.93, 0.93, 0.93];
  const section_color = params.section_color ?? [0.8, 0.8, 1];
  const gamma_out = params.gamma_out ?? true;
  const camera = params.camera;
  const view = camera.view;
  const proj = camera.proj;
  const inv_view = mat45.create();
  mat45.invert(inv_view, view);
  const cam_pos_x = inv_view[12];
  const cam_pos_y = inv_view[13];
  const cam_pos_z = inv_view[14];
  const vp = mat45.create();
  mat45.multiply(vp, proj, view);
  const inv_vp = mat45.create();
  mat45.invert(inv_vp, vp);
  for (let y = 0; y < software_renderer.height; y++) {
    for (let x = 0; x < software_renderer.width; x++) {
      const ndc_x = x / (software_renderer.width - 1) * 2 - 1;
      const ndc_y = 1 - y / (software_renderer.height - 1) * 2;
      const near_point = vec44.fromValues(ndc_x, ndc_y, -1, 1);
      const far_point = vec44.fromValues(ndc_x, ndc_y, 1, 1);
      vec44.transformMat4(near_point, near_point, inv_vp);
      vec44.transformMat4(far_point, far_point, inv_vp);
      near_point[0] /= near_point[3];
      near_point[1] /= near_point[3];
      near_point[2] /= near_point[3];
      far_point[0] /= far_point[3];
      far_point[1] /= far_point[3];
      far_point[2] /= far_point[3];
      const ray_dir_x = far_point[0] - near_point[0];
      const ray_dir_y = far_point[1] - near_point[1];
      const ray_dir_z = far_point[2] - near_point[2];
      if (Math.abs(ray_dir_y) < 1e-6) continue;
      const t = (grid_y - near_point[1]) / ray_dir_y;
      if (t < 0 || t > 1) continue;
      const world_x = near_point[0] + t * ray_dir_x;
      const world_z = near_point[2] + t * ray_dir_z;
      const world_pt = vec44.fromValues(world_x, grid_y, world_z, 1);
      const clip_pt = vec44.create();
      vec44.transformMat4(clip_pt, world_pt, vp);
      const ndc_z = clip_pt[2] / clip_pt[3];
      const depth_01 = ndc_z * 0.5 + 0.5;
      const di = y * software_renderer.width + x;
      if (depth_01 >= software_renderer.depth[di]) continue;
      const dx = world_x - cam_pos_x;
      const dy = grid_y - cam_pos_y;
      const dz = world_z - cam_pos_z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const alpha = computeGridFadeAlpha({
        dist,
        fade_distance,
        fade_strength
      });
      if (alpha <= 0) continue;
      const g1 = computeGridLineIntensity({
        world_x,
        world_z,
        cell_size,
        dist,
        screen_width: software_renderer.width,
        screen_height: software_renderer.height,
        line_thickness_multiplier: 0.8
      });
      const g2 = computeGridLineIntensity({
        world_x,
        world_z,
        cell_size: section_size,
        dist,
        screen_width: software_renderer.width,
        screen_height: software_renderer.height,
        line_thickness_multiplier: 0.5
        // Thicker section lines
      });
      const grid_strength = Math.max(g1, g2);
      if (grid_strength <= 0) continue;
      const final_r = grid_color[0] * (1 - g2) + section_color[0] * g2;
      const final_g = grid_color[1] * (1 - g2) + section_color[1] * g2;
      const final_b = grid_color[2] * (1 - g2) + section_color[2] * g2;
      const final_alpha = grid_strength * alpha;
      if (final_alpha <= 0.01) continue;
      let out_r = final_r;
      let out_g = final_g;
      let out_b = final_b;
      if (gamma_out) {
        out_r = srgbEncodeLinear01(clamp(out_r, 0, 1));
        out_g = srgbEncodeLinear01(clamp(out_g, 0, 1));
        out_b = srgbEncodeLinear01(clamp(out_b, 0, 1));
      } else {
        out_r = clamp(out_r, 0, 1);
        out_g = clamp(out_g, 0, 1);
        out_b = clamp(out_b, 0, 1);
      }
      const dst_idx = (y * software_renderer.width + x) * 4;
      const dst_r = (software_renderer.buffer[dst_idx + 0] ?? 0) / 255;
      const dst_g = (software_renderer.buffer[dst_idx + 1] ?? 0) / 255;
      const dst_b = (software_renderer.buffer[dst_idx + 2] ?? 0) / 255;
      const dst_a = (software_renderer.buffer[dst_idx + 3] ?? 0) / 255;
      const one_minus_a = 1 - final_alpha;
      const blend_r = out_r * final_alpha + dst_r * one_minus_a;
      const blend_g = out_g * final_alpha + dst_g * one_minus_a;
      const blend_b = out_b * final_alpha + dst_b * one_minus_a;
      const blend_a = final_alpha + dst_a * one_minus_a;
      software_renderer.setPixel(
        x,
        y,
        clamp(blend_r, 0, 1) * 255 | 0,
        clamp(blend_g, 0, 1) * 255 | 0,
        clamp(blend_b, 0, 1) * 255 | 0,
        clamp(blend_a, 0, 1) * 255 | 0
      );
    }
  }
}

// lib/render/resolveRenderOptions.ts
var CAMERA_UP_VALUES = /* @__PURE__ */ new Set(["y+", "y-", "x+", "x-", "z+", "z-"]);
function resolveCameraUp(up) {
  return up != null && CAMERA_UP_VALUES.has(up) ? up : DEFAULT_RENDER_OPTIONS.up;
}
function resolveCameraRotation(cameraRotation) {
  if (cameraRotation == null) {
    return DEFAULT_RENDER_OPTIONS.cameraRotation;
  }
  const resolveAxis = (value) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  return {
    x: resolveAxis(cameraRotation.x),
    y: resolveAxis(cameraRotation.y),
    z: resolveAxis(cameraRotation.z)
  };
}
function resolveRenderOptions(options = {}) {
  const supersampling = typeof options.supersampling === "number" && Number.isFinite(options.supersampling) ? Math.max(1, Math.floor(options.supersampling)) : DEFAULT_RENDER_OPTIONS.supersampling;
  return {
    ...DEFAULT_RENDER_OPTIONS,
    ...options,
    supersampling,
    lightDir: options.lightDir != null ? options.lightDir : DEFAULT_RENDER_OPTIONS.lightDir,
    camPos: options.camPos !== void 0 ? options.camPos : DEFAULT_RENDER_OPTIONS.camPos,
    lookAt: options.lookAt !== void 0 ? options.lookAt : DEFAULT_RENDER_OPTIONS.lookAt,
    up: resolveCameraUp(options.up),
    cameraRotation: resolveCameraRotation(options.cameraRotation)
  };
}

// lib/render/renderDrawCalls.ts
function renderDrawCalls(drawCalls, optionsInput = {}, imageFactory = createUint8Bitmap) {
  const options = resolveRenderOptions(optionsInput);
  const renderWidth = options.width * options.supersampling;
  const renderHeight = options.height * options.supersampling;
  const camera = buildCamera(
    drawCalls,
    renderWidth,
    renderHeight,
    options.fov,
    options.camPos ?? null,
    options.lookAt ?? null,
    options.up,
    options.cameraRotation ?? null
  );
  const renderer = new SoftwareRenderer(renderWidth, renderHeight, imageFactory);
  let rgb = null;
  if (options.backgroundColor) {
    if (typeof options.backgroundColor === "string") {
      rgb = hexToRgb(options.backgroundColor);
    } else {
      rgb = options.backgroundColor;
    }
  }
  if (rgb) {
    const [r, g, b] = rgb;
    renderer.clear([
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255),
      255
    ]);
  } else {
    renderer.clear([0, 0, 0, 0]);
  }
  const allDrawCalls = [...drawCalls];
  let infiniteGridOptions = null;
  if (options.grid) {
    const userGridOptions = typeof options.grid === "boolean" ? {} : options.grid;
    if (userGridOptions.infiniteGrid) {
      infiniteGridOptions = userGridOptions;
    } else {
      const aabb = computeWorldAABB(drawCalls);
      const sizeX = aabb.max[0] - aabb.min[0];
      const sizeZ = aabb.max[2] - aabb.min[2];
      const maxSize = Math.max(sizeX, sizeZ);
      const defaultSize = Math.ceil(maxSize * 1.2 / 2) * 2;
      const defaultOffset = {
        x: (aabb.min[0] + aabb.max[0]) / 2,
        y: aabb.min[1],
        z: (aabb.min[2] + aabb.max[2]) / 2
      };
      const defaultGridOptions = {
        size: defaultSize > 0 ? defaultSize : 10,
        offset: defaultOffset
      };
      const finalGridOptions = {
        ...defaultGridOptions,
        ...userGridOptions,
        offset: {
          ...defaultGridOptions.offset,
          ...userGridOptions.offset
        }
      };
      allDrawCalls.push(createGrid(finalGridOptions));
    }
  }
  const opaqueDraws = allDrawCalls.filter(
    (dc) => (dc.material.alphaMode ?? "OPAQUE") === "OPAQUE"
  );
  const maskDraws = allDrawCalls.filter(
    (dc) => (dc.material.alphaMode ?? "OPAQUE") === "MASK"
  );
  const blendDraws = allDrawCalls.filter(
    (dc) => (dc.material.alphaMode ?? "OPAQUE") === "BLEND"
  );
  const renderGroup = (dcs) => {
    for (const dc of dcs) {
      if (dc.mode === 1) {
        renderer.drawLines(dc, camera, options.gamma);
      } else {
        renderer.drawMesh(
          dc,
          camera,
          { dir: options.lightDir, ambient: options.ambient },
          dc.material,
          options.cull,
          options.gamma
        );
      }
    }
  };
  renderGroup(opaqueDraws);
  renderGroup(maskDraws);
  if (infiniteGridOptions) {
    const aabb = computeWorldAABB(drawCalls);
    const modelCenterY = (aabb.min[1] + aabb.max[1]) / 2;
    const gridY = infiniteGridOptions.offset?.y ?? modelCenterY;
    drawInfiniteGrid(renderer, {
      camera,
      grid_y: gridY,
      cell_size: infiniteGridOptions.cellSize,
      section_size: infiniteGridOptions.sectionSize,
      fade_distance: infiniteGridOptions.fadeDistance,
      fade_strength: infiniteGridOptions.fadeStrength,
      grid_color: infiniteGridOptions.gridColor,
      section_color: infiniteGridOptions.sectionColor,
      gamma_out: options.gamma
    });
  }
  renderGroup(blendDraws);
  for (const dc of drawCalls) {
    if (!dc.showHiddenEdges) continue;
    const edgeDrawCall = createEdgeDrawCall(dc);
    if (!edgeDrawCall) continue;
    renderer.drawLines(edgeDrawCall, camera, options.gamma, {
      depthCompare: "less-equal",
      depthWrite: false,
      depthBias: 1e-4
    });
    renderer.drawLines(edgeDrawCall, camera, options.gamma, {
      depthCompare: "greater",
      depthWrite: false,
      depthBias: 1e-4,
      dashed: true,
      dashLength: 4 * options.supersampling,
      opacity: 0.35
    });
  }
  if (options.debugPoints?.length) {
    drawDebugPoints(
      renderer,
      camera,
      options.debugPoints,
      options.debugFontSize,
      options.debugPointColor,
      options.debugLabelColor
    );
  }
  const bitmap = options.supersampling > 1 ? downsampleBitmap(
    renderer.bitmap,
    options.width,
    options.height,
    imageFactory
  ) : renderer.bitmap;
  if (options.textOverlay) drawTextOverlay(bitmap, options.textOverlay);
  return { bitmap, camera, options };
}

// lib/gltf/createInfiniteGrid.ts
import { mat4 as mat46 } from "gl-matrix";
function createInfiniteGrid(options = {}) {
  const cellSize = options.cellSize ?? 1;
  const sectionSize = options.sectionSize ?? 10;
  const fadeDistance = options.fadeDistance ?? 100;
  const fadeStrength = options.fadeStrength ?? 1.5;
  const gridColor = options.gridColor ?? [0.93, 0.93, 0.93];
  const sectionColor = options.sectionColor ?? [0.8, 0.8, 1];
  const size = 1e3;
  const positions = new Float32Array([
    -size,
    0,
    -size,
    size,
    0,
    -size,
    size,
    0,
    size,
    -size,
    0,
    size
  ]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const model = mat46.create();
  const offset = options.offset ?? {};
  mat46.fromTranslation(model, [offset.x ?? 0, offset.y ?? 0, offset.z ?? 0]);
  return {
    positions,
    indices,
    normals: null,
    uvs: null,
    model,
    material: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: null,
      alphaMode: "BLEND"
    },
    mode: 4,
    // triangles
    isInfiniteGrid: true,
    cellSize,
    sectionSize,
    fadeDistance,
    fadeStrength,
    gridColor,
    sectionColor
  };
}

// lib/gltf/createSceneFromGLTF.ts
import { mat4 as mat47 } from "gl-matrix";
var COMPONENT_INFO = {
  5120: {
    name: "BYTE",
    size: 1,
    array: Int8Array,
    norm: (v) => Math.max(-1, v / 127)
  },
  5121: {
    name: "UNSIGNED_BYTE",
    size: 1,
    array: Uint8Array,
    norm: (v) => v / 255
  },
  5122: {
    name: "SHORT",
    size: 2,
    array: Int16Array,
    norm: (v) => Math.max(-1, v / 32767)
  },
  5123: {
    name: "UNSIGNED_SHORT",
    size: 2,
    array: Uint16Array,
    norm: (v) => v / 65535
  },
  5125: {
    name: "UNSIGNED_INT",
    size: 4,
    array: Uint32Array,
    norm: (v) => v / 4294967295
  },
  5126: { name: "FLOAT", size: 4, array: Float32Array, norm: (v) => v }
};
var NUM_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
};
function readShowHiddenEdges(extras) {
  if (typeof extras?.poppygl?.showHiddenEdges === "boolean") {
    return extras.poppygl.showHiddenEdges;
  }
  if (typeof extras?.showHiddenEdges === "boolean") {
    return extras.showHiddenEdges;
  }
  return void 0;
}
function getBufferViewSlice(ctx, bufferViewIndex, byteOffset) {
  const { gltf, buffers } = ctx;
  const bufferView = gltf.bufferViews?.[bufferViewIndex];
  if (!bufferView)
    throw new Error(`Invalid bufferView index ${bufferViewIndex}`);
  if (typeof bufferView.buffer !== "number")
    throw new Error(`bufferView ${bufferViewIndex} missing buffer reference`);
  const bufferIndex = bufferView.buffer;
  const buffer = buffers[bufferIndex];
  if (!buffer) throw new Error(`Missing buffer at index ${bufferIndex}`);
  const viewOffset = bufferView.byteOffset ?? 0;
  const totalByteLength = bufferView.byteLength ?? buffer.byteLength - viewOffset;
  const baseOffset = buffer.byteOffset + viewOffset + byteOffset;
  const viewArray = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset + viewOffset,
    totalByteLength
  );
  return {
    array: new Uint8Array(
      viewArray.buffer,
      baseOffset,
      totalByteLength - byteOffset
    ),
    stride: bufferView.byteStride ?? 0,
    byteOffsetInView: baseOffset
  };
}
function readAccessorAsFloat32(ctx, accessorIndex) {
  const { gltf } = ctx;
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Invalid accessor index ${accessorIndex}`);
  if (accessor.sparse) throw new Error("Sparse accessors are not supported.");
  const compInfo = COMPONENT_INFO[accessor.componentType];
  const numComponents = NUM_COMPONENTS[accessor.type];
  if (!compInfo || !numComponents)
    throw new Error(
      `Unsupported accessor componentType ${accessor.componentType}`
    );
  const byteOffset = accessor.byteOffset ?? 0;
  if (typeof accessor.bufferView !== "number")
    throw new Error(`Accessor ${accessorIndex} missing bufferView`);
  const {
    array: src,
    stride: bufferViewStride,
    byteOffsetInView
  } = getBufferViewSlice(ctx, accessor.bufferView, byteOffset);
  const stride = bufferViewStride || compInfo.size * numComponents;
  const count = accessor.count;
  const out = new Float32Array(count * numComponents);
  const absoluteByteOffset = byteOffsetInView;
  const canUseTightView = stride === compInfo.size * numComponents && absoluteByteOffset % compInfo.size === 0;
  if (canUseTightView) {
    const TypedArrayCtor = compInfo.array;
    const typed = new TypedArrayCtor(
      src.buffer,
      src.byteOffset,
      count * numComponents
    );
    if (compInfo.name === "FLOAT" && !accessor.normalized) {
      return new Float32Array(typed.buffer, typed.byteOffset, typed.length);
    }
    for (let i = 0; i < typed.length; i++) {
      out[i] = accessor.normalized ? compInfo.norm(typed[i]) : typed[i];
    }
    return out;
  }
  const dataView = new DataView(src.buffer, src.byteOffset, src.byteLength);
  let outIndex = 0;
  for (let i = 0; i < count; i++) {
    const elementOffset = i * stride;
    for (let c = 0; c < numComponents; c++) {
      const componentOffset = elementOffset + c * compInfo.size;
      let value;
      switch (accessor.componentType) {
        case 5120:
          value = dataView.getInt8(componentOffset);
          break;
        case 5121:
          value = dataView.getUint8(componentOffset);
          break;
        case 5122:
          value = dataView.getInt16(componentOffset, true);
          break;
        case 5123:
          value = dataView.getUint16(componentOffset, true);
          break;
        case 5125:
          value = dataView.getUint32(componentOffset, true);
          break;
        case 5126:
          value = dataView.getFloat32(componentOffset, true);
          break;
        default:
          throw new Error(`Unknown componentType ${accessor.componentType}`);
      }
      out[outIndex++] = accessor.normalized ? compInfo.norm(value) : value;
    }
  }
  return out;
}
function readIndices(ctx, accessorIndex) {
  const { gltf } = ctx;
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Invalid accessor index ${accessorIndex}`);
  if (accessor.type !== "SCALAR")
    throw new Error("Index accessor must be SCALAR");
  const compInfo = COMPONENT_INFO[accessor.componentType];
  if (!compInfo)
    throw new Error(
      `Unsupported index component type ${accessor.componentType}`
    );
  if (accessor.componentType !== 5121 && accessor.componentType !== 5123 && accessor.componentType !== 5125) {
    throw new Error("Index componentType must be UNSIGNED_BYTE/SHORT/INT");
  }
  const byteOffset = accessor.byteOffset ?? 0;
  if (typeof accessor.bufferView !== "number")
    throw new Error(`Index accessor ${accessorIndex} missing bufferView`);
  const {
    array: src,
    stride: bufferViewStride,
    byteOffsetInView
  } = getBufferViewSlice(ctx, accessor.bufferView, byteOffset);
  const stride = bufferViewStride || compInfo.size;
  const count = accessor.count;
  const absoluteByteOffset = byteOffsetInView;
  const canUseTightView = stride === compInfo.size && absoluteByteOffset % compInfo.size === 0;
  if (canUseTightView) {
    const TypedArrayCtor = compInfo.array;
    const typed = new TypedArrayCtor(src.buffer, src.byteOffset, count);
    if (accessor.componentType === 5125) {
      return new Uint32Array(typed.buffer, typed.byteOffset, typed.length);
    }
    return new Uint32Array(typed);
  }
  const dataView = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const elementOffset = i * stride;
    switch (accessor.componentType) {
      case 5121:
        out[i] = dataView.getUint8(elementOffset);
        break;
      case 5123:
        out[i] = dataView.getUint16(elementOffset, true);
        break;
      case 5125:
        out[i] = dataView.getUint32(elementOffset, true);
        break;
    }
  }
  return out;
}
function nodeLocalMatrix(node) {
  if (node.matrix) {
    const m2 = mat47.create();
    for (let i = 0; i < 16; i++) m2[i] = node.matrix[i];
    return m2;
  }
  const translation = node.translation || [0, 0, 0];
  const rotation = node.rotation || [0, 0, 0, 1];
  const scale = node.scale || [1, 1, 1];
  const m = mat47.create();
  const tmp = mat47.create();
  mat47.fromRotationTranslationScale(tmp, rotation, translation, scale);
  mat47.copy(m, tmp);
  return m;
}
function getMaterial(gltf, textures, images, materialIndex) {
  const material = (gltf.materials || [])[materialIndex ?? -1] || {};
  const pbr = material.pbrMetallicRoughness || {};
  const factor = pbr.baseColorFactor || [1, 1, 1, 1];
  let texImg = null;
  if (pbr.baseColorTexture && Number.isInteger(pbr.baseColorTexture.index)) {
    const texIndex = pbr.baseColorTexture.index;
    const tex = textures[texIndex];
    if (tex && Number.isInteger(tex.source)) {
      const imageIndex = tex.source;
      texImg = images[imageIndex] || null;
    }
  }
  const alphaMode = typeof material.alphaMode === "string" ? material.alphaMode : "OPAQUE";
  const alphaCutoff = typeof material.alphaCutoff === "number" ? material.alphaCutoff : 0.5;
  return {
    baseColorFactor: factor,
    baseColorTexture: texImg,
    alphaMode,
    alphaCutoff
  };
}
function createSceneFromGLTF(gltf, resources) {
  const ctx = { gltf, buffers: resources.buffers };
  const textures = gltf.textures || [];
  const nodes = gltf.nodes || [];
  const meshes = gltf.meshes || [];
  const scenes = gltf.scenes || [];
  const sceneIndex = Number.isInteger(gltf.scene) ? gltf.scene : 0;
  const scene = scenes[sceneIndex] || { nodes: [] };
  const drawCalls = [];
  function traverse(nodeIndex, parentMatrix) {
    const node = nodes[nodeIndex];
    if (!node) return;
    const local = nodeLocalMatrix(node);
    const world = mat47.create();
    mat47.multiply(world, parentMatrix, local);
    if (Number.isInteger(node.mesh)) {
      const mesh = meshes[node.mesh];
      if (mesh) {
        for (const primitive of mesh.primitives || []) {
          if (primitive.mode != null && primitive.mode !== 4) continue;
          const posAcc = primitive.attributes?.POSITION;
          if (posAcc == null) continue;
          const normalsAcc = primitive.attributes?.NORMAL;
          const uvAcc = primitive.attributes?.TEXCOORD_0;
          const positions = readAccessorAsFloat32(ctx, posAcc);
          const normals = normalsAcc != null ? readAccessorAsFloat32(ctx, normalsAcc) : null;
          const uvs = uvAcc != null ? readAccessorAsFloat32(ctx, uvAcc) : null;
          const indices = primitive.indices != null ? readIndices(ctx, primitive.indices) : null;
          const colorAcc = primitive.attributes?.COLOR_0;
          const colors = colorAcc != null ? readAccessorAsFloat32(ctx, colorAcc) : null;
          const material = getMaterial(
            gltf,
            textures,
            resources.images,
            primitive.material
          );
          drawCalls.push({
            positions,
            normals,
            uvs,
            indices,
            model: world,
            material,
            colors,
            showHiddenEdges: readShowHiddenEdges(primitive.extras) ?? readShowHiddenEdges(node.extras) ?? readShowHiddenEdges(mesh.extras) ?? false
          });
        }
      }
    }
    for (const childIndex of node.children || []) {
      traverse(childIndex, world);
    }
  }
  const identity = mat47.create();
  for (const rootIndex of scene.nodes || []) {
    traverse(rootIndex, identity);
  }
  return { gltf, drawCalls };
}

// lib/gltf/resourceUtils.ts
import { decode } from "fast-png";

// lib/utils/bytes.ts
function getNodeBuffer() {
  const maybeBuffer = globalThis.Buffer;
  if (!maybeBuffer) {
    throw new Error("Node Buffer API is not available in this runtime.");
  }
  return maybeBuffer;
}
function base64ToUint8Array(base64) {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(getNodeBuffer().from(base64, "base64"));
}

// lib/gltf/resourceUtils.ts
function bufferFromDataURI(uri) {
  const match = uri.match(/^data:.*?;base64,(.*)$/);
  if (!match) throw new Error(`Unsupported data URI: ${uri.slice(0, 64)}...`);
  return base64ToUint8Array(match[1]);
}
function isPNG(filenameOrUri) {
  return /\.png(\?|$)/i.test(filenameOrUri) || /image\/png/i.test(filenameOrUri);
}
function isJPG(filenameOrUri) {
  return /(\.jpe?g(\?|$)|image\/jpe?g)/i.test(filenameOrUri);
}
function detectMimeTypeFromBuffer(buf, hint) {
  if (hint) return hint;
  if (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71 && buf[4] === 13 && buf[5] === 10 && buf[6] === 26 && buf[7] === 10)
    return "image/png";
  if (buf.length >= 2 && buf[0] === 255 && buf[1] === 216) return "image/jpeg";
  return null;
}
async function decodeImageViaFastPng(buf) {
  const decoded = decode(buf);
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data)
  };
}
async function decodeImageViaPureImage(buf, mimeType) {
  const { PassThrough } = await import("readable-stream");
  const PImage = await import("pureimage");
  const stream = new PassThrough();
  stream.end(buf);
  if (mimeType === "image/png") return PImage.decodePNGFromStream(stream);
  if (mimeType === "image/jpeg" || mimeType === "image/jpg")
    return PImage.decodeJPEGFromStream(stream);
  throw new Error(`Unsupported embedded image mimeType: ${mimeType}`);
}
async function decodeImageFromBuffer(buf, mimeType) {
  const type = detectMimeTypeFromBuffer(buf, mimeType);
  if (!type) {
    throw new Error(
      `Unsupported embedded image mimeType: ${mimeType ?? "unknown"}`
    );
  }
  if (type === "image/png") {
    return decodeImageViaFastPng(buf);
  }
  return decodeImageViaPureImage(buf, type);
}

// lib/gltf/parseGLB.ts
var MAGIC = 1179937895;
var JSON_CHUNK_TYPE = 1313821514;
var BIN_CHUNK_TYPE = 5130562;
function parseGLB(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) throw new Error("Invalid GLB header magic.");
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}.`);
  const length = view.getUint32(8, true);
  const decoder = new TextDecoder();
  let json = null;
  let binaryChunk = null;
  const chunks = [];
  let offset = 12;
  while (offset < length) {
    if (offset + 8 > length) throw new Error("Truncated GLB chunk header.");
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + chunkLength > length)
      throw new Error("Truncated GLB chunk data.");
    const chunkData = new Uint8Array(arrayBuffer, offset, chunkLength);
    offset += chunkLength;
    if (chunkType === JSON_CHUNK_TYPE) {
      json = JSON.parse(decoder.decode(chunkData));
    } else if (chunkType === BIN_CHUNK_TYPE) {
      binaryChunk = chunkData;
    } else {
      chunks.push({ type: chunkType, data: chunkData });
    }
  }
  if (!json) throw new Error("GLB file is missing JSON chunk.");
  return { gltf: json, binaryChunk, chunks };
}

// lib/gltf/loadGLTFWithResourcesFromURL.ts
function ensureFetch(fetchImpl) {
  const impl = fetchImpl ?? globalThis.fetch;
  if (!impl)
    throw new Error("Global fetch API is not available; provide fetchImpl.");
  return impl;
}
async function fetchBinary(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
async function loadGLTFWithResourcesFromURL(url, options = {}) {
  const fetchImpl = ensureFetch(options.fetchImpl);
  const response = await fetchImpl(url);
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`
    );
  const resolvedURL = new URL(response.url || url);
  const baseURL = resolvedURL;
  const sourceBuffer = await response.arrayBuffer();
  const header = sourceBuffer.byteLength >= 4 ? new DataView(sourceBuffer, 0, 4) : null;
  const isGLB = header?.getUint32(0, true) === 1179937895;
  let gltf;
  const totalBuffers = () => Array.isArray(gltf?.buffers) ? gltf.buffers.length : 0;
  let buffers = [];
  if (isGLB) {
    const parsed = parseGLB(sourceBuffer);
    gltf = parsed.gltf;
    buffers = new Array(totalBuffers()).fill(null);
    if (parsed.binaryChunk) buffers[0] = parsed.binaryChunk;
  } else {
    const text = new TextDecoder().decode(new Uint8Array(sourceBuffer));
    gltf = JSON.parse(text);
    buffers = new Array(totalBuffers()).fill(null);
  }
  async function resolveBuffer(index, entry) {
    if (buffers[index]) return buffers[index];
    if (entry?.uri) {
      if (entry.uri.startsWith("data:")) {
        const buf2 = bufferFromDataURI(entry.uri);
        buffers[index] = buf2;
        return buf2;
      }
      const resourceURL = new URL(
        decodeURIComponent(entry.uri),
        baseURL
      ).toString();
      const buf = await fetchBinary(fetchImpl, resourceURL);
      buffers[index] = buf;
      return buf;
    }
    throw new Error(
      `Buffer ${index} is missing a uri and no GLB chunk was provided.`
    );
  }
  await Promise.all(
    (gltf.buffers || []).map(async (entry, idx) => {
      await resolveBuffer(idx, entry);
    })
  );
  async function resolveImage(img) {
    if (img.uri) {
      if (img.uri.startsWith("data:")) {
        const buf2 = bufferFromDataURI(img.uri);
        return decodeImageFromBuffer(buf2, img.mimeType);
      }
      const resourceURL = new URL(
        decodeURIComponent(img.uri),
        baseURL
      ).toString();
      const hintedMime = img.mimeType ? img.mimeType : isPNG(img.uri) ? "image/png" : isJPG(img.uri) ? "image/jpeg" : null;
      const buf = await fetchBinary(fetchImpl, resourceURL);
      return decodeImageFromBuffer(buf, hintedMime);
    }
    if (typeof img.bufferView === "number") {
      const bufferView = gltf.bufferViews?.[img.bufferView];
      if (!bufferView)
        throw new Error(`Invalid image bufferView index ${img.bufferView}`);
      const buffer = await resolveBuffer(
        bufferView.buffer,
        gltf.buffers?.[bufferView.buffer]
      );
      if (!buffer)
        throw new Error(`Missing buffer for image bufferView ${img.bufferView}`);
      const byteOffset = bufferView.byteOffset ?? 0;
      const byteLength = bufferView.byteLength;
      if (typeof byteLength !== "number") {
        throw new Error(
          `bufferView ${img.bufferView} missing byteLength for image.`
        );
      }
      const slice = buffer.subarray(byteOffset, byteOffset + byteLength);
      return decodeImageFromBuffer(slice, img.mimeType);
    }
    throw new Error(
      "images[*] entry missing uri or bufferView; unsupported in this loader."
    );
  }
  const images = await Promise.all(
    (gltf.images || []).map((img) => resolveImage(img))
  );
  return {
    gltf,
    resources: {
      buffers,
      images
    }
  };
}

// lib/image/encodePNG.ts
import { encode } from "fast-png";
async function encodePNG(image) {
  return encode({
    width: image.width,
    height: image.height,
    data: image.data,
    channels: 4,
    depth: 8
  });
}

// lib/render/renderSceneFromGLTF.ts
function readTextOverlay(value) {
  if (typeof value !== "object" || value === null || !("messages" in value) || !Array.isArray(value.messages) || !value.messages.every((message) => typeof message === "string") || "title" in value && value.title !== void 0 && typeof value.title !== "string")
    return null;
  return value;
}
function renderSceneFromGLTF(scene, options = {}, imageFactory) {
  const sceneIndex = Number.isInteger(scene.gltf?.scene) ? scene.gltf.scene : 0;
  const embedded = scene.gltf?.scenes?.[sceneIndex]?.extras?.poppygl?.textOverlay;
  const textOverlay = readTextOverlay(
    options.textOverlay === void 0 ? embedded : options.textOverlay
  );
  return renderDrawCalls(
    scene.drawCalls,
    { ...options, textOverlay },
    imageFactory
  );
}

// lib/render/renderGLTFToPNGFromURL.ts
async function renderGLTFToPNGFromURL(url, options = {}) {
  const { fetchImpl, ...renderOptions } = options;
  const { gltf, resources } = await loadGLTFWithResourcesFromURL(url, {
    fetchImpl
  });
  const scene = createSceneFromGLTF(gltf, resources);
  const { bitmap } = renderSceneFromGLTF(
    scene,
    renderOptions,
    createUint8Bitmap
  );
  return encodePNG(bitmap);
}

// lib/render/renderGLTFToPNGFromGLB.ts
function normalizeToArrayBuffer(source) {
  if (source instanceof ArrayBuffer) return source;
  const { buffer, byteOffset, byteLength } = source;
  const viewBuffer = buffer;
  return viewBuffer.slice(byteOffset, byteOffset + byteLength);
}
async function renderGLTFToPNGFromGLB(glb, options = {}) {
  const arrayBuffer = normalizeToArrayBuffer(glb);
  const { gltf, binaryChunk } = parseGLB(arrayBuffer);
  const totalBuffers = Array.isArray(gltf.buffers) ? gltf.buffers.length : 0;
  const buffers = new Array(totalBuffers);
  for (let index = 0; index < totalBuffers; index++) {
    const entry = gltf.buffers[index];
    if (entry?.uri) {
      if (!entry.uri.startsWith("data:")) {
        throw new Error(
          `Buffer ${index} references external resource ${entry.uri}. Use renderGLTFToPNGFromURL for GLBs with external buffer URIs.`
        );
      }
      buffers[index] = bufferFromDataURI(entry.uri);
      continue;
    }
    if (!binaryChunk) {
      throw new Error(
        `GLB is missing the binary chunk required for buffer ${index}.`
      );
    }
    buffers[index] = binaryChunk;
  }
  const resolveBufferViewSlice = (bufferViewIndex) => {
    const bufferView = gltf.bufferViews?.[bufferViewIndex];
    if (!bufferView) {
      throw new Error(`Invalid bufferView index ${bufferViewIndex}.`);
    }
    const bufferIndex = bufferView.buffer;
    const buffer = buffers[bufferIndex];
    if (!buffer) {
      throw new Error(
        `Missing buffer data for bufferView ${bufferViewIndex} (buffer ${bufferIndex}).`
      );
    }
    const byteOffset = bufferView.byteOffset ?? 0;
    const byteLength = bufferView.byteLength;
    if (typeof byteLength !== "number") {
      throw new Error(`bufferView ${bufferViewIndex} is missing byteLength.`);
    }
    return buffer.subarray(byteOffset, byteOffset + byteLength);
  };
  const images = await Promise.all(
    (gltf.images ?? []).map(async (image, imageIndex) => {
      if (image.uri) {
        if (!image.uri.startsWith("data:")) {
          throw new Error(
            `Image ${imageIndex} references external resource ${image.uri}. Embed textures or load via renderGLTFToPNGFromURL.`
          );
        }
        const imageBytes = bufferFromDataURI(image.uri);
        return decodeImageFromBuffer(imageBytes, image.mimeType);
      }
      if (typeof image.bufferView === "number") {
        const slice = resolveBufferViewSlice(image.bufferView);
        return decodeImageFromBuffer(slice, image.mimeType);
      }
      throw new Error(
        `Image ${imageIndex} must supply a data URI or bufferView for GLB rendering.`
      );
    })
  );
  const scene = createSceneFromGLTF(gltf, { buffers, images });
  const { bitmap } = renderSceneFromGLTF(scene, options, createUint8Bitmap);
  return encodePNG(bitmap);
}
export {
  DEFAULT_LIGHT_DIR,
  DEFAULT_RENDER_OPTIONS,
  SoftwareRenderer,
  bufferFromDataURI,
  buildCamera,
  computeSmoothNormals,
  computeWorldAABB,
  createEdgeDrawCall,
  createGrid,
  createInfiniteGrid,
  createSceneFromGLTF,
  createUint8Bitmap,
  decodeImageFromBuffer,
  drawInfiniteGrid,
  encodePNG,
  getDefaultRenderOptions,
  hexToRgb,
  isJPG,
  isPNG,
  loadGLTFWithResourcesFromURL,
  renderDrawCalls,
  renderGLTFToPNGFromGLB,
  renderGLTFToPNGFromURL,
  renderSceneFromGLTF,
  resolveRenderOptions
};
