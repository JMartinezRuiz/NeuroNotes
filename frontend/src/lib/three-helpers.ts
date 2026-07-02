import * as THREE from "three";
import { clamp, hashUnit } from "./utils";
import type { MapEdge, MapNode } from "../types";

// three.js-dependent helpers, isolated so `three` only loads inside the lazy
// Map chunk. Node positions come from the backend's PCA projection of the note
// EMBEDDINGS (x/y/z): distance in the map = distance in meaning. A light
// repulsion-only pass just declutters overlapping points — deterministic, and
// it never reorganizes the embedding-space arrangement.

export type ThreeCluster = {
  id: string;
  label: string;
  count: number;
  position: THREE.Vector3;
  labelPosition: THREE.Vector3;
};

export function buildNodeLayout(nodes: MapNode[], edges: MapEdge[]) {
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
    if (typeof node.x === "number") {
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

  // Clusters = the notes' first tags (the AI's own organization), for quiet
  // floating group labels.
  const groups = new Map<string, MapNode[]>();
  nodes.forEach((node) => {
    const tag = (node.tags[0] || "").trim();
    if (!tag) return;
    groups.set(tag, [...(groups.get(tag) ?? []), node]);
  });
  const clusters: ThreeCluster[] = Array.from(groups.entries())
    .filter(([, groupNodes]) => groupNodes.length >= 2)
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([tag, groupNodes]) => {
      const center = new THREE.Vector3();
      groupNodes.forEach((node) => center.add(positions.get(node.id) as THREE.Vector3));
      center.multiplyScalar(1 / Math.max(1, groupNodes.length));
      let radius = 3;
      groupNodes.forEach((node) => {
        radius = Math.max(radius, center.distanceTo(positions.get(node.id) as THREE.Vector3));
      });
      return {
        id: tag,
        label: tag,
        count: groupNodes.length,
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

export function chooseVisibleEdges(edges: MapEdge[], nodeCount: number) {
  const limit = Math.max(24, Math.min(edges.length, Math.round(nodeCount * 0.72)));
  const strong = edges.filter((edge) => edge.source === "strong");
  const semantic = edges.filter((edge) => edge.source === "semantic").sort((a, b) => b.score - a.score);
  const edgeMap = new Map<string, MapEdge>();
  [...strong, ...semantic].forEach((edge) => {
    if (edgeMap.size >= limit) return;
    const key = [edge.from_id, edge.to_id].sort().join("::");
    if (!edgeMap.has(key)) edgeMap.set(key, edge);
  });
  return Array.from(edgeMap.values());
}
