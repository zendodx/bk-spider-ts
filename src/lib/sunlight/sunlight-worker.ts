/**
 * 采光分析 - 日照射线遮挡计算 Worker
 * 迁移自 building-sunlight-simulator/js/sunlight-worker.js
 *
 * 沿用原方案：将 Worker 运行时逻辑序列化为字符串，通过 Blob URL 动态创建 Worker，
 * 避免额外的 webpack worker-loader 配置，浏览器端可直接使用。
 */

/** 序列化后传给 Worker 的三角网格数据 */
export interface SerializedMesh {
  positions: Float32Array | number[];
  indices?: Uint32Array | Uint16Array | number[] | null;
  matrixWorld: Float32Array | number[];
}

export interface SunlightWorkerPayload {
  meshes: SerializedMesh[];
  origins: Float32Array;
  outwardNormals: Float32Array;
  directions: Float32Array;
  timeStep: number;
  near: number;
  far: number;
}

export type SunlightWorkerMessage =
  | { type: 'progress'; value: number }
  | { type: 'complete'; hours: ArrayBuffer }
  | { type: 'error'; message: string };

function sunlightWorkerRuntime() {
  /* eslint-disable */
  // 该函数体会被 toString() 序列化后放入 Worker 执行环境，不能引用外部作用域的任何变量。
  ('use strict');

  const EPSILON = 1e-9;
  const LEAF_TRIANGLE_LIMIT = 8;
  let cancelled = false;

  function transformPoint(positions: any, offset: number, matrix: any) {
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    return {
      x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    };
  }

  function createTriangle(a: any, b: any, c: any) {
    const e1x = b.x - a.x;
    const e1y = b.y - a.y;
    const e1z = b.z - a.z;
    const e2x = c.x - a.x;
    const e2y = c.y - a.y;
    const e2z = c.z - a.z;
    const normalX = e1y * e2z - e1z * e2y;
    const normalY = e1z * e2x - e1x * e2z;
    const normalZ = e1x * e2y - e1y * e2x;
    if (normalX * normalX + normalY * normalY + normalZ * normalZ <= EPSILON) return null;

    const minX = Math.min(a.x, b.x, c.x);
    const minY = Math.min(a.y, b.y, c.y);
    const minZ = Math.min(a.z, b.z, c.z);
    const maxX = Math.max(a.x, b.x, c.x);
    const maxY = Math.max(a.y, b.y, c.y);
    const maxZ = Math.max(a.z, b.z, c.z);
    return {
      ax: a.x,
      ay: a.y,
      az: a.z,
      e1x,
      e1y,
      e1z,
      e2x,
      e2y,
      e2z,
      bounds: { minX, minY, minZ, maxX, maxY, maxZ },
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
      centerZ: (minZ + maxZ) * 0.5,
    };
  }

  function createTriangles(serializedMeshes: any[]) {
    const triangles: any[] = [];
    serializedMeshes.forEach(mesh => {
      const { positions, indices, matrixWorld } = mesh;
      const triangleCount = indices ? Math.floor(indices.length / 3) : Math.floor(positions.length / 9);
      for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
        const base = triangleIndex * 3;
        const ia = indices ? indices[base] : base;
        const ib = indices ? indices[base + 1] : base + 1;
        const ic = indices ? indices[base + 2] : base + 2;
        const triangle = createTriangle(
          transformPoint(positions, ia * 3, matrixWorld),
          transformPoint(positions, ib * 3, matrixWorld),
          transformPoint(positions, ic * 3, matrixWorld)
        );
        if (triangle) triangles.push(triangle);
      }
    });
    return triangles;
  }

  function mergeBounds(items: any[]) {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
    };
    items.forEach(item => {
      bounds.minX = Math.min(bounds.minX, item.bounds.minX);
      bounds.minY = Math.min(bounds.minY, item.bounds.minY);
      bounds.minZ = Math.min(bounds.minZ, item.bounds.minZ);
      bounds.maxX = Math.max(bounds.maxX, item.bounds.maxX);
      bounds.maxY = Math.max(bounds.maxY, item.bounds.maxY);
      bounds.maxZ = Math.max(bounds.maxZ, item.bounds.maxZ);
    });
    return bounds;
  }

  function buildTriangleBvh(items: any[]): any {
    if (items.length === 0) return null;
    const bounds = mergeBounds(items);
    if (items.length <= LEAF_TRIANGLE_LIMIT) return { bounds, items };

    const sizeX = bounds.maxX - bounds.minX;
    const sizeY = bounds.maxY - bounds.minY;
    const sizeZ = bounds.maxZ - bounds.minZ;
    const centerKey = sizeX >= sizeY && sizeX >= sizeZ ? 'centerX' : sizeY >= sizeZ ? 'centerY' : 'centerZ';
    items.sort((a, b) => a[centerKey] - b[centerKey]);
    const middle = Math.floor(items.length / 2);
    return {
      bounds,
      left: buildTriangleBvh(items.slice(0, middle)),
      right: buildTriangleBvh(items.slice(middle)),
    };
  }

  function rayIntersectsBounds(
    bounds: any,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    near: number,
    far: number
  ) {
    let minimum = near;
    let maximum = far;

    if (Math.abs(dx) <= EPSILON) {
      if (ox < bounds.minX || ox > bounds.maxX) return false;
    } else {
      const inverse = 1 / dx;
      let first = (bounds.minX - ox) * inverse;
      let second = (bounds.maxX - ox) * inverse;
      if (first > second) {
        const swap = first;
        first = second;
        second = swap;
      }
      minimum = Math.max(minimum, first);
      maximum = Math.min(maximum, second);
      if (maximum < minimum) return false;
    }

    if (Math.abs(dy) <= EPSILON) {
      if (oy < bounds.minY || oy > bounds.maxY) return false;
    } else {
      const inverse = 1 / dy;
      let first = (bounds.minY - oy) * inverse;
      let second = (bounds.maxY - oy) * inverse;
      if (first > second) {
        const swap = first;
        first = second;
        second = swap;
      }
      minimum = Math.max(minimum, first);
      maximum = Math.min(maximum, second);
      if (maximum < minimum) return false;
    }

    if (Math.abs(dz) <= EPSILON) {
      if (oz < bounds.minZ || oz > bounds.maxZ) return false;
    } else {
      const inverse = 1 / dz;
      let first = (bounds.minZ - oz) * inverse;
      let second = (bounds.maxZ - oz) * inverse;
      if (first > second) {
        const swap = first;
        first = second;
        second = swap;
      }
      minimum = Math.max(minimum, first);
      maximum = Math.min(maximum, second);
      if (maximum < minimum) return false;
    }
    return true;
  }

  function rayIntersectsTriangle(
    triangle: any,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    near: number,
    far: number
  ) {
    const px = dy * triangle.e2z - dz * triangle.e2y;
    const py = dz * triangle.e2x - dx * triangle.e2z;
    const pz = dx * triangle.e2y - dy * triangle.e2x;
    const determinant = triangle.e1x * px + triangle.e1y * py + triangle.e1z * pz;
    if (determinant <= EPSILON) return false;

    const inverse = 1 / determinant;
    const tx = ox - triangle.ax;
    const ty = oy - triangle.ay;
    const tz = oz - triangle.az;
    const u = (tx * px + ty * py + tz * pz) * inverse;
    if (u < 0 || u > 1) return false;

    const qx = ty * triangle.e1z - tz * triangle.e1y;
    const qy = tz * triangle.e1x - tx * triangle.e1z;
    const qz = tx * triangle.e1y - ty * triangle.e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inverse;
    if (v < 0 || u + v > 1) return false;

    const dist = (triangle.e2x * qx + triangle.e2y * qy + triangle.e2z * qz) * inverse;
    return dist >= near && dist <= far;
  }

  function isRayBlocked(
    node: any,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    near: number,
    far: number
  ): boolean {
    if (!node || !rayIntersectsBounds(node.bounds, ox, oy, oz, dx, dy, dz, near, far)) return false;
    if (node.items) {
      for (const triangle of node.items) {
        if (rayIntersectsTriangle(triangle, ox, oy, oz, dx, dy, dz, near, far)) return true;
      }
      return false;
    }
    return (
      isRayBlocked(node.left, ox, oy, oz, dx, dy, dz, near, far) ||
      isRayBlocked(node.right, ox, oy, oz, dx, dy, dz, near, far)
    );
  }

  function runAnalysis(payload: any) {
    cancelled = false;
    const { origins, outwardNormals, directions, timeStep, near, far } = payload;
    const bvh = buildTriangleBvh(createTriangles(payload.meshes));
    const pointCount = origins.length / 3;
    const directionCount = directions.length / 3;
    const hours = new Float32Array(pointCount);
    const pointsPerBatch = 8;
    let pointIndex = 0;

    function processBatch() {
      if (cancelled) return;
      try {
        const batchEnd = Math.min(pointIndex + pointsPerBatch, pointCount);
        for (; pointIndex < batchEnd; pointIndex++) {
          const originOffset = pointIndex * 3;
          const normalOffset = pointIndex * 2;
          const ox = origins[originOffset];
          const oy = origins[originOffset + 1];
          const oz = origins[originOffset + 2];

          for (let directionIndex = 0; directionIndex < directionCount; directionIndex++) {
            const directionOffset = directionIndex * 3;
            const dx = directions[directionOffset];
            const dy = directions[directionOffset + 1];
            const dz = directions[directionOffset + 2];
            if (dx * dx + dy * dy + dz * dz < 1e-12) continue;
            if (outwardNormals[normalOffset] * dx + outwardNormals[normalOffset + 1] * dz <= 1e-6) continue;
            if (!isRayBlocked(bvh, ox, oy, oz, dx, dy, dz, near, far)) {
              hours[pointIndex] += timeStep;
            }
          }
        }

        (self as any).postMessage({ type: 'progress', value: pointIndex / pointCount });
        if (pointIndex < pointCount) {
          setTimeout(processBatch, 0);
        } else {
          (self as any).postMessage({ type: 'complete', hours: hours.buffer }, [hours.buffer]);
        }
      } catch (error: any) {
        (self as any).postMessage({ type: 'error', message: error?.message || String(error) });
      }
    }

    processBatch();
  }

  (self as any).onmessage = (event: any) => {
    const message = event.data || {};
    if (message.type === 'cancel') {
      cancelled = true;
      return;
    }
    if (message.type !== 'start') return;
    try {
      runAnalysis(message.payload);
    } catch (error: any) {
      (self as any).postMessage({ type: 'error', message: error?.message || String(error) });
    }
  };
  /* eslint-enable */
}

/**
 * 创建日照分析 Web Worker（仅可在浏览器环境调用）
 */
export function createSunlightAnalysisWorker(): Worker {
  const source = `(${sunlightWorkerRuntime.toString()})();`;
  const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return new Worker(objectUrl);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
