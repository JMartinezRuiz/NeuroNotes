import * as THREE from "three";
import { clamp, clusterIdForNode, clusterLabelFromId, hashUnit } from "./helpers";
import type { GraphNode, ThreeCluster, VectorEdge } from "../types";

// three.js-dependent scene helpers, kept in their own module so `three` only
// loads inside the lazy Map chunk (never the initial bundle).
// Embedding-space layout: node positions come from the backend's PCA projection
// of the note VECTORS (x/y/z), so distance in the map = distance in vector space —
// how an LLM would "see" the notes near/far. NOT arbitrary. A light repulsion-only
// pass (no edge springs) just declutters overlapping points so the cloud stays
// breathable while preserving the embedding-space arrangement. Deterministic.
export function buildThreeNodePositions(nodes: GraphNode[], edges: VectorEdge[]) {
  const count = nodes.length;

  const connectionCounts = new Map<string, number>();
  edges.forEach((edge) => {
    connectionCounts.set(edge.from_id, (connectionCounts.get(edge.from_id) ?? 0) + 1);
    connectionCounts.set(edge.to_id, (connectionCounts.get(edge.to_id) ?? 0) + 1);
  });

  const px = new Float64Array(count);
  const py = new Float64Array(count);
  const pz = new Float64Array(count);
  nodes.forEach((node, i) => {
    if ("x" in node && typeof node.x === "number") {
      px[i] = node.x * 14;
      py[i] = node.y * 9;
      pz[i] = node.z * 14;
    } else {
      const theta = hashUnit(`${node.id}-t`) * Math.PI * 2;
      const phi = Math.acos(hashUnit(`${node.id}-u`) * 2 - 1);
      const radius = 10 + hashUnit(`${node.id}-r`) * 6;
      px[i] = radius * Math.sin(phi) * Math.cos(theta);
      py[i] = radius * Math.cos(phi) * 0.6;
      pz[i] = radius * Math.sin(phi) * Math.sin(theta);
    }
  });

  const dx = new Float64Array(count);
  const dy = new Float64Array(count);
  const dz = new Float64Array(count);
  const relaxIterations = count > 320 ? 8 : 18;
  for (let iter = 0; iter < relaxIterations; iter += 1) {
    dx.fill(0);
    dy.fill(0);
    dz.fill(0);
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        let ex = px[i] - px[j];
        const ey = py[i] - py[j];
        const ez = pz[i] - pz[j];
        let distSq = ex * ex + ey * ey + ez * ez;
        if (distSq < 0.05) {
          distSq = 0.05;
          ex = hashUnit(`${i}-${j}`) - 0.5;
        }
        const dist = Math.sqrt(distSq);
        const force = 6 / distSq;
        const fx = (ex / dist) * force;
        const fy = (ey / dist) * force;
        const fz = (ez / dist) * force;
        dx[i] += fx;
        dy[i] += fy;
        dz[i] += fz;
        dx[j] -= fx;
        dy[j] -= fy;
        dz[j] -= fz;
      }
    }
    for (let i = 0; i < count; i += 1) {
      const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i] + dz[i] * dz[i]) || 1;
      const step = clamp(len, 0, 1.4);
      px[i] += (dx[i] / len) * step;
      py[i] += (dy[i] / len) * step;
      pz[i] += (dz[i] / len) * step;
    }
  }

  let maxExtent = 1;
  for (let i = 0; i < count; i += 1) {
    maxExtent = Math.max(maxExtent, Math.hypot(px[i], py[i], pz[i]));
  }
  const scale = 16 / maxExtent;

  const positions = new Map<string, THREE.Vector3>();
  nodes.forEach((node, i) => positions.set(node.id, new THREE.Vector3(px[i] * scale, py[i] * scale, pz[i] * scale)));

  const groups = new Map<string, GraphNode[]>();
  nodes.forEach((node) => {
    const id = clusterIdForNode(node);
    groups.set(id, [...(groups.get(id) ?? []), node]);
  });
  const clusters: ThreeCluster[] = Array.from(groups.entries())
    .sort((left, right) => right[1].length - left[1].length || clusterLabelFromId(left[0]).localeCompare(clusterLabelFromId(right[0])))
    .map(([id, groupNodes]) => {
      const center = new THREE.Vector3();
      groupNodes.forEach((node) => center.add(positions.get(node.id) as THREE.Vector3));
      center.multiplyScalar(1 / Math.max(1, groupNodes.length));
      let radius = 3;
      groupNodes.forEach((node) => {
        radius = Math.max(radius, center.distanceTo(positions.get(node.id) as THREE.Vector3));
      });
      return {
        id,
        label: clusterLabelFromId(id),
        count: groupNodes.length,
        radius,
        color: groupNodes[0]?.color ?? "#6ee7d8",
        position: center.clone(),
        labelPosition: new THREE.Vector3(center.x, center.y + radius * 0.55 + 2, center.z),
      };
    });

  return { positions, connectionCounts, clusters };
}

export function makeThreeColor(value: string | undefined) {
  const color = new THREE.Color();
  try {
    color.set(value || "#6ee7d8");
  } catch {
    color.set("#6ee7d8");
  }
  return color;
}

export function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.34, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new THREE.CanvasTexture(canvas);
}

export function addLineSegments(root: THREE.Group, values: number[], material: THREE.Material, geometries: Set<THREE.BufferGeometry>) {
  if (!values.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
  geometries.add(geometry);
  root.add(new THREE.LineSegments(geometry, material));
}
