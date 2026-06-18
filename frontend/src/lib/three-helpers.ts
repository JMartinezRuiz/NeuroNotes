import * as THREE from "three";
import { clamp, clusterIdForNode, clusterLabelFromId, hashUnit } from "./helpers";
import type { GraphNode, ThreeCluster, VectorEdge } from "../types";

// three.js-dependent scene helpers, kept in their own module so `three` only
// loads inside the lazy Map chunk (never the initial bundle).
export function buildThreeNodePositions(nodes: GraphNode[], edges: VectorEdge[]) {
  const connectionCounts = new Map<string, number>();
  edges.forEach((edge) => {
    connectionCounts.set(edge.from_id, (connectionCounts.get(edge.from_id) ?? 0) + 1);
    connectionCounts.set(edge.to_id, (connectionCounts.get(edge.to_id) ?? 0) + 1);
  });

  const groups = new Map<string, GraphNode[]>();
  nodes.forEach((node) => {
    const id = clusterIdForNode(node);
    groups.set(id, [...(groups.get(id) ?? []), node]);
  });

  const orderedGroups = Array.from(groups.entries()).sort(
    ([leftId, leftNodes], [rightId, rightNodes]) => rightNodes.length - leftNodes.length || clusterLabelFromId(leftId).localeCompare(clusterLabelFromId(rightId)),
  );
  const positions = new Map<string, THREE.Vector3>();
  const clusters: ThreeCluster[] = [];
  const groupCount = Math.max(orderedGroups.length, 1);
  const centerRing = clamp(groupCount * 2.35, 9.5, 25);

  orderedGroups.forEach(([clusterId, groupNodes], groupIndex) => {
    const groupAngle = groupCount === 1 ? 0 : (Math.PI * 2 * groupIndex) / groupCount - Math.PI / 2;
    const centerRadius = groupCount === 1 ? 0 : centerRing;
    const center = new THREE.Vector3(Math.cos(groupAngle) * centerRadius, 0, Math.sin(groupAngle) * centerRadius);
    const sortedNodes = groupNodes.slice().sort((a, b) => b.linkCount - a.linkCount || a.title.localeCompare(b.title));
    const clusterRadius = clamp(2.7 + Math.sqrt(groupNodes.length) * 0.6, 3.7, 8.2);
    const clusterColor = sortedNodes[0]?.color ?? "#6ee7d8";
    clusters.push({
      id: clusterId,
      label: clusterLabelFromId(clusterId),
      count: groupNodes.length,
      radius: clusterRadius + 1.0,
      color: clusterColor,
      position: center.clone(),
      labelPosition: new THREE.Vector3(center.x, 6.4, center.z),
    });

    sortedNodes.forEach((node, index) => {
      const hasVectorPosition = "x" in node && typeof node.x === "number";
      const localAngle = (Math.PI * 2 * index) / Math.max(sortedNodes.length, 1) + hashUnit(`${node.id}-angle`) * 0.52;
      const localRadius = Math.sqrt(index + 1) / Math.sqrt(sortedNodes.length + 1) * clusterRadius;
      const vectorX = hasVectorPosition ? node.x : hashUnit(`${node.id}-x`) - 0.5;
      const vectorY = hasVectorPosition ? node.y : hashUnit(`${node.id}-y`) - 0.5;
      const vectorZ = hasVectorPosition ? node.z : hashUnit(`${node.id}-z`) - 0.5;
      const connections = connectionCounts.get(node.id) ?? 0;
      const x = center.x + Math.cos(localAngle) * localRadius + vectorX * 1.35;
      const z = center.z + Math.sin(localAngle) * localRadius + vectorY * 1.35;
      const y = clamp(vectorZ * 5.5 + Math.min(2.6, connections * 0.08), -5.8, 6.8);
      positions.set(node.id, new THREE.Vector3(x, y, z));
    });
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
