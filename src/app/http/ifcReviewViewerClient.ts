export function renderIfcReviewViewerClientScript(): string {
  return `
(function () {
  async function createIfcReviewViewer(options) {
    const container = options.container;
    const status = options.status;
    const geometryUrl = options.geometryUrl;
    const highlightStepIds = options.highlightStepIds || [];
    status.textContent = "Loading IFC geometry...";

    const THREE = await import("three");
    const controlsModule = await import("https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js");
    const response = await fetch(geometryUrl);
    if (!response.ok) {
      throw new Error("IFC geometry fetch failed: " + response.status);
    }
    const payload = await response.json();
    if (!payload.meshes || payload.meshes.length === 0) {
      throw new Error("No displayable IFC geometry was extracted.");
    }

    container.innerHTML = "";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xedf1ed);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const controls = new controlsModule.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bdb8, 2.6));
    const directional = new THREE.DirectionalLight(0xffffff, 2.2);
    directional.position.set(12, 18, 10);
    scene.add(directional);
    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    const highlightSet = new Set(highlightStepIds);
    for (const mesh of payload.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
      geometry.setIndex(mesh.indices);
      const isHighlighted = highlightSet.has(mesh.expressId);
      const material = new THREE.MeshStandardMaterial({
        color: isHighlighted ? 0xf59e0b : 0x9aa7a3,
        roughness: 0.72,
        metalness: 0.02,
        transparent: !isHighlighted,
        opacity: isHighlighted ? 1 : 0.5,
        side: THREE.DoubleSide,
      });
      material.userData.baseColor = 0x9aa7a3;
      const object = new THREE.Mesh(geometry, material);
      object.userData.expressId = mesh.expressId;
      modelRoot.add(object);
    }

    frameModel(THREE, modelRoot, camera, controls);
    function resize() {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);
    var disposed = false;
    function animate() {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();
    status.textContent = highlightText(highlightStepIds, payload.truncated);

    return {
      setHighlight(nextStepIds) {
        const nextHighlightSet = new Set(nextStepIds || []);
        modelRoot.traverse(function (object) {
          if (!object.isMesh) return;
          const highlighted = nextHighlightSet.has(object.userData.expressId);
          object.material.color.setHex(highlighted ? 0xf59e0b : object.material.userData.baseColor);
          object.material.opacity = highlighted ? 1 : 0.5;
          object.material.transparent = !highlighted;
        });
        status.textContent = highlightText(nextStepIds || [], payload.truncated);
      },
      dispose() {
        disposed = true;
        window.removeEventListener("resize", resize);
        renderer.dispose();
      },
    };
  }

  function frameModel(THREE, modelRoot, camera, controls) {
    const boxes = modelRoot.children.map(function (object) {
      object.geometry.computeBoundingBox();
      return object.geometry.boundingBox.clone();
    }).filter(function (box) { return !box.isEmpty(); });
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
          center.z >= low[2] && center.z <= high[2]) {
        box.union(candidate);
      }
    });
    if (box.isEmpty()) box.setFromObject(modelRoot);
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
    if (truncated) {
      return "Partial IFC model loaded (viewer limit). " + (stepIds ? stepIds.length : 0) + " elements needing input are highlighted.";
    }
    if (!stepIds || stepIds.length === 0) {
      return "IFC model loaded.";
    }
    return "IFC model loaded. " + stepIds.length + " elements needing input are highlighted.";
  }

  window.createIfcReviewViewer = createIfcReviewViewer;
})();
`;
}
