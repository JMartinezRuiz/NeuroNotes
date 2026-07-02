import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { agentHex } from "../lib/api";
import { clamp, trimText } from "../lib/utils";
import {
  addLineSegments,
  buildNodeLayout,
  chooseVisibleEdges,
  createGlowTexture,
  makeThreeColor,
} from "../lib/three-helpers";
import type { MapEdge, MapNode } from "../types";

// The "observatory": a luminous constellation of the user's notes, positioned by
// PCA of their embeddings. Built ONCE per data change; selection is applied
// imperatively every frame so clicking never rebuilds (or re-frames) the scene.
export function Scene3D({
  nodes,
  edges,
  selectedNoteId,
  onSelectNote,
}: {
  nodes: MapNode[];
  edges: MapEdge[];
  selectedNoteId: string;
  onSelectNote: (noteId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const layout = useMemo(() => buildNodeLayout(nodes, edges), [nodes, edges]);

  const selectedIdRef = useRef(selectedNoteId);
  const onSelectRef = useRef(onSelectNote);
  onSelectRef.current = onSelectNote;
  useEffect(() => {
    selectedIdRef.current = selectedNoteId;
  }, [selectedNoteId]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = canvasMountRef.current;
    if (!host || !mount || !nodes.length) return;
    const hostElement: HTMLDivElement = host;
    const mountElement: HTMLDivElement = mount;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080b12, 0.013);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
    camera.position.set(0, 8, 42);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x080b12, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "three-map-canvas";
    renderer.domElement.setAttribute("aria-label", "Mapa 3D de notas");
    renderer.domElement.tabIndex = 0;
    mountElement.appendChild(renderer.domElement);

    const root = new THREE.Group();
    root.rotation.x = -0.34;
    root.rotation.y = 0.52;
    scene.add(root);

    const { positions, connectionCounts } = layout;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const glowTexture = createGlowTexture();
    const sphereGeometry = new THREE.SphereGeometry(0.42, 24, 14);
    const pulseGeometry = new THREE.SphereGeometry(0.08, 12, 8);
    const ringGeometry = new THREE.TorusGeometry(0.78, 0.02, 10, 90);
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>([sphereGeometry, pulseGeometry, ringGeometry]);
    const clickable: THREE.Object3D[] = [];
    const meshById = new Map<string, THREE.Mesh>();

    const ambient = new THREE.AmbientLight(0xc9d7ff, 0.78);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(12, 18, 16);
    const sideLight = new THREE.PointLight(0x2ee6d6, 3.6, 80);
    sideLight.position.set(-16, 10, 20);
    const rimLight = new THREE.PointLight(0x8c99f0, 2.8, 90);
    rimLight.position.set(20, 4, -22);
    scene.add(ambient, keyLight, sideLight, rimLight);

    // Edges computed once — strong (best neighbor) in teal, the rest in indigo.
    const strongLinePositions: number[] = [];
    const semanticLinePositions: number[] = [];
    const visibleEdges = chooseVisibleEdges(edges, nodes.length);
    visibleEdges.forEach((edge) => {
      const from = positions.get(edge.from_id);
      const to = positions.get(edge.to_id);
      if (!from || !to) return;
      const target = edge.source === "strong" ? strongLinePositions : semanticLinePositions;
      target.push(from.x, from.y, from.z, to.x, to.y, to.z);
    });

    const strongLineMaterial = new THREE.LineBasicMaterial({ color: 0x2ee6d6, transparent: true, opacity: 0.5 });
    const semanticLineMaterial = new THREE.LineBasicMaterial({ color: 0x8c99f0, transparent: true, opacity: 0.16 });
    materials.add(strongLineMaterial);
    materials.add(semanticLineMaterial);
    addLineSegments(root, strongLinePositions, strongLineMaterial, geometries);
    addLineSegments(root, semanticLinePositions, semanticLineMaterial, geometries);

    nodes.forEach((node) => {
      const position = positions.get(node.id);
      if (!position) return;
      const color = makeThreeColor(agentHex(node.created_by));
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.32),
        emissiveIntensity: 0.5,
        metalness: 0.1,
        roughness: 0.66,
      });
      materials.add(material);

      const mesh = new THREE.Mesh(sphereGeometry, material);
      const connections = connectionCounts.get(node.id) ?? 0;
      const baseScale = Math.min(1.5, 0.78 + connections * 0.06);
      mesh.position.copy(position);
      mesh.scale.setScalar(baseScale);
      mesh.userData = { baseScale, noteId: node.id };
      clickable.push(mesh);
      meshById.set(node.id, mesh);
      root.add(mesh);

      const haloMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity: 0.2 + Math.min(0.24, baseScale * 0.13),
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      materials.add(haloMaterial);
      const halo = new THREE.Sprite(haloMaterial);
      halo.position.copy(position);
      halo.scale.setScalar(3.7 * baseScale);
      root.add(halo);
    });

    const selectionRingMaterial = new THREE.MeshBasicMaterial({ color: 0x2ee6d6, transparent: true, opacity: 0.95, depthWrite: false });
    materials.add(selectionRingMaterial);
    const selectionRing = new THREE.Mesh(ringGeometry, selectionRingMaterial);
    selectionRing.visible = false;
    root.add(selectionRing);

    const selectionGlowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x2ee6d6,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    materials.add(selectionGlowMaterial);
    const selectionGlow = new THREE.Sprite(selectionGlowMaterial);
    selectionGlow.visible = false;
    root.add(selectionGlow);

    // "Living" pulses travelling along the strongest connections.
    const animatedEdges = visibleEdges
      .slice()
      .sort((a, b) => Number(b.source === "strong") - Number(a.source === "strong") || b.score - a.score)
      .slice(0, 22);
    const pulses: Array<{ mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; offset: number; speed: number }> = [];
    animatedEdges.forEach((edge, index) => {
      const from = positions.get(edge.from_id);
      const to = positions.get(edge.to_id);
      if (!from || !to) return;
      const material = new THREE.MeshBasicMaterial({
        color: edge.source === "strong" ? 0x2ee6d6 : 0x8c99f0,
        transparent: true,
        opacity: edge.source === "strong" ? 0.55 : 0.3,
        depthWrite: false,
      });
      materials.add(material);
      const pulse = new THREE.Mesh(pulseGeometry, material);
      root.add(pulse);
      pulses.push({
        mesh: pulse,
        from: from.clone(),
        to: to.clone(),
        offset: (index * 0.137) % 1,
        speed: edge.source === "strong" ? 0.18 : 0.12,
      });
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let targetRotationX = -0.34;
    let targetRotationY = 0.52;
    let targetCameraZ = 42;
    let isDragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let rafId = 0;
    const startTime = window.performance.now();

    function resize() {
      const width = Math.max(1, hostElement.clientWidth);
      const height = Math.max(1, hostElement.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function noteIdAtPoint(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickable, false)[0];
      const noteId = hit?.object.userData.noteId;
      if (typeof noteId === "string") return noteId;

      root.updateMatrixWorld();
      camera.updateMatrixWorld();
      let nearestNoteId = "";
      let nearestDistance = Number.POSITIVE_INFINITY;
      positions.forEach((position, projectedNoteId) => {
        const projected = position.clone().applyMatrix4(root.matrixWorld).project(camera);
        if (projected.z < -1 || projected.z > 1) return;
        const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
        const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
        const radius = 18 + Math.min(14, (connectionCounts.get(projectedNoteId) || 0) * 2.2);
        const distance = Math.hypot(clientX - x, clientY - y);
        if (distance <= radius && distance < nearestDistance) {
          nearestDistance = distance;
          nearestNoteId = projectedNoteId;
        }
      });
      return nearestNoteId;
    }

    function pickNode(clientX: number, clientY: number) {
      const noteId = noteIdAtPoint(clientX, clientY);
      if (noteId) onSelectRef.current(noteId);
    }

    function hideHoverLabel() {
      const label = hostElement.querySelector<HTMLElement>(".three-hover-label");
      if (label) label.style.opacity = "0";
      renderer.domElement.style.cursor = "grab";
    }

    function showHoverLabel(event: PointerEvent) {
      const noteId = noteIdAtPoint(event.clientX, event.clientY);
      const note = noteId ? nodeById.get(noteId) : null;
      const label = hostElement.querySelector<HTMLElement>(".three-hover-label");
      if (!label || !note) {
        hideHoverLabel();
        return;
      }
      const rect = hostElement.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left + 14, 70, Math.max(70, rect.width - 70));
      const y = clamp(event.clientY - rect.top - 16, 28, Math.max(28, rect.height - 28));
      label.textContent = note.title;
      label.style.opacity = "1";
      label.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
      renderer.domElement.style.cursor = "pointer";
    }

    function onPointerDown(event: PointerEvent) {
      isDragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!isDragging) {
        showHoverLabel(event);
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      targetRotationY += dx * 0.006;
      targetRotationX = clamp(targetRotationX + dy * 0.0045, -1.0, 0.28);
      lastX = event.clientX;
      lastY = event.clientY;
    }

    function onPointerUp(event: PointerEvent) {
      if (!moved) pickNode(event.clientX, event.clientY);
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    }

    function onPointerCancel() {
      isDragging = false;
      hideHoverLabel();
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      targetCameraZ = clamp(targetCameraZ + event.deltaY * 0.025, 24, 66);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostElement);
    resize();

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.domElement.addEventListener("pointerleave", hideHoverLabel);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    function updateLabels() {
      const labels = hostElement.querySelectorAll<HTMLElement>(".three-node-label");
      const clusterLabels = hostElement.querySelectorAll<HTMLElement>(".three-cluster-label");
      root.updateMatrixWorld();
      camera.updateMatrixWorld();
      const selectedId = selectedIdRef.current;
      labels.forEach((label) => {
        const noteId = label.dataset.nodeId;
        const position = noteId ? positions.get(noteId) : null;
        if (!position) {
          label.style.opacity = "0";
          return;
        }
        const projected = position.clone().applyMatrix4(root.matrixWorld).project(camera);
        const visible = projected.z > -1 && projected.z < 1;
        const hostWidth = hostElement.clientWidth;
        const hostHeight = hostElement.clientHeight;
        const x = clamp((projected.x * 0.5 + 0.5) * hostWidth, 92, Math.max(92, hostWidth - 92));
        const y = clamp((-projected.y * 0.5 + 0.5) * hostHeight, 42, Math.max(42, hostHeight - 42));
        const isSelected = noteId === selectedId;
        const depthOpacity = clamp(1.12 - projected.z, 0.18, 1);
        label.style.opacity = visible ? String(isSelected ? 1 : depthOpacity * 0.88) : "0";
        label.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        label.style.zIndex = String(Math.round((1 - projected.z) * 1000));
      });
      clusterLabels.forEach((label) => {
        const cluster = layout.clusters.find((item) => item.id === label.dataset.clusterId);
        const position = cluster?.labelPosition;
        if (!position) {
          label.style.opacity = "0";
          return;
        }
        const projected = position.clone().applyMatrix4(root.matrixWorld).project(camera);
        const visible = projected.z > -1 && projected.z < 1;
        const hostWidth = hostElement.clientWidth;
        const hostHeight = hostElement.clientHeight;
        const x = clamp((projected.x * 0.5 + 0.5) * hostWidth, 72, Math.max(72, hostWidth - 72));
        const y = clamp((-projected.y * 0.5 + 0.5) * hostHeight, 38, Math.max(38, hostHeight - 38));
        label.style.opacity = visible ? "0.82" : "0";
        label.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        label.style.zIndex = String(Math.round((1 - projected.z) * 700));
      });
    }

    function animate() {
      const elapsed = (window.performance.now() - startTime) / 1000;
      if (!isDragging) targetRotationY += 0.0008;
      root.rotation.x += (targetRotationX - root.rotation.x) * 0.08;
      root.rotation.y += (targetRotationY - root.rotation.y) * 0.08;
      camera.position.z += (targetCameraZ - camera.position.z) * 0.08;
      camera.lookAt(0, 0, 0);

      strongLineMaterial.opacity = 0.42 + Math.sin(elapsed * 1.35) * 0.05;
      semanticLineMaterial.opacity = 0.13 + Math.sin(elapsed * 0.9) * 0.035;
      sideLight.intensity = 2.8 + Math.sin(elapsed * 1.2) * 0.35;
      rimLight.intensity = 2.5 + Math.cos(elapsed * 0.9) * 0.32;

      const selectedId = selectedIdRef.current;
      meshById.forEach((mesh, noteId) => {
        const baseScale = Number(mesh.userData.baseScale) || 1;
        const selected = noteId === selectedId;
        const pulse = Math.sin(elapsed * (selected ? 2.4 : 1.4) + baseScale * 2) * (selected ? 0.06 : 0.018);
        mesh.scale.setScalar(baseScale * (selected ? 1.34 : 1) * (1 + pulse));
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = selected ? 0.98 : 0.5;
      });

      const selectedMesh = selectedId ? meshById.get(selectedId) : undefined;
      if (selectedMesh) {
        const sBase = Number(selectedMesh.userData.baseScale) || 1;
        selectionRing.visible = true;
        selectionGlow.visible = true;
        selectionRing.position.copy(selectedMesh.position);
        selectionGlow.position.copy(selectedMesh.position);
        selectionRing.lookAt(camera.position);
        selectionRing.scale.setScalar(sBase * (1.7 + Math.sin(elapsed * 2.8) * 0.1));
        selectionGlow.scale.setScalar(sBase * 6);
        selectionGlowMaterial.opacity = 0.42 + Math.sin(elapsed * 2.6) * 0.12;
      } else {
        selectionRing.visible = false;
        selectionGlow.visible = false;
      }

      pulses.forEach((pulse) => {
        const t = (elapsed * pulse.speed + pulse.offset) % 1;
        pulse.mesh.position.lerpVectors(pulse.from, pulse.to, t);
        const material = pulse.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = 0.2 + Math.sin(t * Math.PI) * 0.62;
      });

      updateLabels();
      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(animate);
    }

    function startLoop() {
      if (!rafId) rafId = window.requestAnimationFrame(animate);
    }
    function stopLoop() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") startLoop();
      else stopLoop();
    }
    document.addEventListener("visibilitychange", onVisibility);
    // One synchronous frame so the map is never blank while RAF is paused.
    animate();

    return () => {
      stopLoop();
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("pointerleave", hideHoverLabel);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (renderer.domElement.parentElement === mountElement) mountElement.removeChild(renderer.domElement);
      scene.traverse((object) => {
        const disposable = object as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        if (disposable.geometry) geometries.add(disposable.geometry);
        if (Array.isArray(disposable.material)) {
          disposable.material.forEach((material) => materials.add(material));
        } else if (disposable.material) {
          materials.add(disposable.material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      glowTexture.dispose();
      renderer.dispose();
    };
  }, [nodes, edges, layout]);

  const selectedNode = nodes.find((node) => node.id === selectedNoteId);

  return (
    <div className="three-map-host" ref={hostRef}>
      <div className="three-canvas-mount" ref={canvasMountRef} />
      <div className="three-label-layer">
        <div className="three-hover-label" />
        {layout.clusters.map((cluster) => (
          <div className="three-cluster-label" data-cluster-id={cluster.id} key={cluster.id}>
            <span>{cluster.label}</span>
            <small>{cluster.count}</small>
          </div>
        ))}
        {selectedNode ? (
          <button
            className="three-node-label selected"
            data-node-id={selectedNode.id}
            onClick={() => onSelectNote(selectedNode.id)}
            type="button"
          >
            <span style={{ backgroundColor: agentHex(selectedNode.created_by) }} />
            {trimText(selectedNode.title, 28)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
