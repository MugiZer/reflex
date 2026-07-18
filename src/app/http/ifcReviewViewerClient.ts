export function renderIfcReviewViewerClientScript(): string {
  return `
(function () {
  async function createIfcReviewViewer(options) {
    const container = options.container;
    const status = options.status;
    const geometryUrl = options.geometryUrl;
    const actionStepIds = options.highlightStepIds || [];
    const elementInfo = options.elementInfo || {};
    const onSelect = options.onSelect || function () {};
    status.textContent = "Loading IFC geometry...";

    const THREE = await import("three");
    const controlsModule = await import("https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js");
    const response = await fetch(geometryUrl);
    if (!response.ok) throw new Error("IFC geometry fetch failed: " + response.status);
    const payload = await response.json();
    if (!payload.meshes || payload.meshes.length === 0) throw new Error("No displayable IFC geometry was extracted.");

    container.innerHTML = "";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f4f2);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const controls = new controlsModule.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xaeb8b3, 2.6));
    const directional = new THREE.DirectionalLight(0xffffff, 2.2);
    directional.position.set(12, 18, 10);
    scene.add(directional);
    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    const actionSet = new Set(actionStepIds);
    const blockedSet = new Set(Object.keys(elementInfo).filter(function (id) {
      return elementInfo[id].status === "blocked";
    }).map(Number));
    const selectedSet = new Set();
    const modelObjects = [];
    payload.meshes.forEach(function (mesh) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
      geometry.setIndex(mesh.indices);
      geometry.computeBoundingBox();
      const material = new THREE.MeshStandardMaterial({
        color: 0x9aa7a3,
        roughness: 0.72,
        metalness: 0.02,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const object = new THREE.Mesh(geometry, material);
      object.userData.expressId = mesh.expressId;
      modelRoot.add(object);
      modelObjects.push(object);
    });

    const viewState = { mode: "all", contextVisible: true };
    const tooltip = document.createElement("div");
    tooltip.className = "viewer-tooltip";
    tooltip.hidden = true;
    container.appendChild(tooltip);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    frameObjects(THREE, modelObjects, camera, controls);
    function resize() {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    function hitAt(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(modelObjects.filter(function (object) { return object.visible; }), false)[0];
    }

    function handlePointerMove(event) {
      const hit = hitAt(event);
      if (!hit) {
        handlePointerLeave();
        renderer.domElement.style.cursor = "grab";
        return;
      }
      const id = hit.object.userData.expressId;
      const info = elementInfo[id] || null;
      renderer.domElement.style.cursor = info ? "pointer" : "grab";
      tooltip.innerHTML = "<strong>" + escapeHtml(info ? info.label : "IFC element #" + id) + "</strong><span>" +
        escapeHtml(info ? info.detail : "Model context - no thermal action") +
        "</span><small>" + (info ? "Click to open this assembly" : "Context geometry") + "</small>";
      tooltip.style.left = Math.max(10, Math.min(event.offsetX + 14, container.clientWidth - 270)) + "px";
      tooltip.style.top = Math.max(10, event.offsetY - 8) + "px";
      tooltip.hidden = false;
    }

    function handlePointerLeave() {
      tooltip.hidden = true;
    }

    function handleClick(event) {
      const hit = hitAt(event);
      if (!hit) return;
      const id = hit.object.userData.expressId;
      const info = elementInfo[id] || null;
      if (!info) return;
      onSelect(id, info);
    }

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("click", handleClick);

    function applyAppearance() {
      modelObjects.forEach(function (object) {
        const id = object.userData.expressId;
        const isAction = actionSet.has(id);
        const isBlocked = blockedSet.has(id);
        const isSelected = selectedSet.has(id);
        const visibleForMode = isSelected || viewState.mode === "all" ||
          (viewState.mode === "actions" && isAction) ||
          (viewState.mode === "isolated" && isSelected);
        const contextAllowed = viewState.contextVisible || isAction || isSelected;
        object.visible = visibleForMode && contextAllowed;
        object.material.color.setHex(isSelected ? 0x2563eb : isBlocked ? 0xdc2626 : isAction ? 0xf59e0b : 0x9aa7a3);
        object.material.opacity = isSelected || isBlocked || isAction ? 1 : 0.3;
        object.material.transparent = !(isSelected || isBlocked || isAction);
      });
    }

    let disposed = false;
    let animationFrameId = 0;
    function animate() {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    }
    applyAppearance();
    animate();
    status.textContent = highlightText(actionStepIds, payload.truncated);

    return {
      setHighlight(nextStepIds) {
        actionSet.clear();
        (nextStepIds || []).forEach(function (id) { actionSet.add(id); });
        applyAppearance();
        status.textContent = highlightText(nextStepIds || [], payload.truncated);
      },
      select(stepIds) {
        selectedSet.clear();
        (stepIds || []).forEach(function (id) { selectedSet.add(id); });
        applyAppearance();
      },
      fit() { frameObjects(THREE, modelObjects, camera, controls); },
      showAll() { viewState.mode = "all"; applyAppearance(); },
      showActions() {
        viewState.mode = "actions";
        applyAppearance();
        frameObjects(THREE, modelObjects.filter(function (object) { return object.visible; }), camera, controls);
      },
      isolateSelected() {
        viewState.mode = "isolated";
        applyAppearance();
        frameObjects(THREE, modelObjects.filter(function (object) { return object.visible; }), camera, controls);
      },
      setContextVisible(visible) { viewState.contextVisible = visible; applyAppearance(); },
      dispose() {
        disposed = true;
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener("resize", resize);
        renderer.domElement.removeEventListener("pointermove", handlePointerMove);
        renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
        renderer.domElement.removeEventListener("click", handleClick);
        controls.dispose();
        modelObjects.forEach(function (object) {
          object.geometry.dispose();
          object.material.dispose();
        });
        renderer.dispose();
        container.innerHTML = "";
      },
    };
  }

  function frameObjects(THREE, objects, camera, controls) {
    if (!objects.length) return;
    const boxes = objects.map(function (object) {
      object.geometry.computeBoundingBox();
      return object.geometry.boundingBox.clone();
    }).filter(function (box) { return !box.isEmpty(); });
    if (!boxes.length) return;
    const centersByAxis = [0, 1, 2].map(function (axis) {
      return boxes.map(function (box) {
        return (box.min.getComponent(axis) + box.max.getComponent(axis)) / 2;
      }).sort(function (a, b) { return a - b; });
    });
    const low = centersByAxis.map(function (values) { return values[Math.floor(values.length * 0.01)]; });
    const high = centersByAxis.map(function (values) { return values[Math.floor(values.length * 0.99)]; });
    const box = new THREE.Box3();
    boxes.forEach(function (candidate) {
      const center = candidate.getCenter(new THREE.Vector3());
      if (center.x >= low[0] && center.x <= high[0] &&
          center.y >= low[1] && center.y <= high[1] &&
          center.z >= low[2] && center.z <= high[2]) box.union(candidate);
    });
    if (box.isEmpty()) boxes.forEach(function (candidate) { box.union(candidate); });
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1);
    camera.position.set(center.x + radius * 1.15, center.y + radius * 0.8, center.z + radius * 1.15);
    camera.near = Math.max(radius / 1000, 0.01);
    camera.far = radius * 30;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }

  function highlightText(stepIds, truncated) {
    const prefix = truncated ? "Partial IFC model loaded (viewer limit). " : "Whole IFC model loaded. ";
    if (!stepIds || stepIds.length === 0) return prefix + "No assembly actions are highlighted.";
    return prefix + stepIds.length + " action elements highlighted.";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  window.createIfcReviewViewer = createIfcReviewViewer;
})();
`;
}
