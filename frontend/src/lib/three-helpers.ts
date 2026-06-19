import * as THREE from "three";
import { clamp, clusterIdForNode, clusterLabelFromId, hashUnit } from "./helpers";
import type { GraphNode, ThreeCluster, VectorEdge } from "../types";

// three.js-dependent scene helpers, kept in their own module so `three` only
// loads inside the lazy Map chunk (never the initial bundle).
// Organic, force-directed layout: edges (manual relations + semantic proximity)
// act as springs and every node repels every other, so PROXIMITY encodes
// relatedness — related notes drift together into natural clusters instead of
// sitting on a geometric ring. Seeded deterministically so it doesn't jump
// between loads, then settled and frozen (no continuous motion).
export function buildThreeNodePositions(nodes: GraphNode[], edges: VectorEdge[]) {
  const count = nodes.length;
  const indexById = new Map<string, number>();
  nodes.forEach((node, i) => indexById.set(node.id, i));

  const connectionCounts = new Map<string, number>();
  edges.forEach((edge) => {
    connectionCounts.set(edge.from_id, (connectionCounts.get(edge.from_id) ?? 0) + 1);
    connectionCounts.set(edge.to_id, (connectionCounts.get(edge.to_id) ?? 0) + 1);
  });

  const px = new Float64Array(count);
  const py = new Float64Array(count);
  const pz = new Float64Array(count);
  nodes.forEach((node, i) => {
    const theta = hashUnit(`${node.id}-t`) * Math.PI * 2;
    const phi = Math.acos(hashUnit(`${node.id}-u`) * 2 - 1);
    const radius = 9 + hashUnit(`${node.id}-r`) * 7;
    px[i] = radius * Math.sin(phi) * Math.cos(theta);
    py[i] = radius * Math.cos(phi) * 0.62;
    pz[i] = radius * Math.sin(phi) * Math.sin(theta);
  });

  const links: Array<{ a: number; b: number; w: number }> = [];
  edges.forEach((edge) => {
    const a = indexById.get(edge.from_id);
    const b = indexById.get(edge.to_id);
    if (a === undefined || b === undefined || a === b) return;
    links.push({ a, b, w: edge.source === "relation" ? 1 : Math.max(0.3, edge.score) });
  });

  const iterations = count > 320 ? 150 : 260;
  const repulsion = 30;
  const springLength = 5.5;
  const dx = new Float64Array(count);
  const dy = new Float64Array(count);
  const dz = new Float64Array(count);

  for (let iter = 0; iter < iterations; iter += 1) {
    const cooling = 1 - iter / iterations;
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
        const force = repulsion / distSq;
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

    links.forEach((link) => {
      const ex = px[link.a] - px[link.b];
      const ey = py[link.a] - py[link.b];
      const ez = pz[link.a] - pz[link.b];
      const dist = Math.sqrt(ex * ex + ey * ey + ez * ez) || 0.01;
      const force = ((dist - springLength) / dist) * 0.07 * link.w;
      dx[link.a] -= ex * force;
      dy[link.a] -= ey * force;
      dz[link.a] -= ez * force;
      dx[link.b] += ex * force;
      dy[link.b] += ey * force;
      dz[link.b] += ez * force;
    });

    const maxStep = 2.6 * cooling + 0.18;
    for (let i = 0; i < count; i += 1) {
      dx[i] -= px[i] * 0.013;
      dy[i] -= py[i] * 0.013;
      dz[i] -= pz[i] * 0.013;
      const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i] + dz[i] * dz[i]) || 1;
      const step = clamp(len, 0, maxStep);
      px[i] += (dx[i] / len) * step;
      py[i] += (dy[i] / len) * step;
      pz[i] += (dz[i] / len) * step;
    }
  }

  let maxExtent = 1;
  for (let i = 0; i < count; i += 1) {
    py[i] *= 0.72;
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
