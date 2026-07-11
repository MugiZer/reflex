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
        color: isHighlighted ? 0xf59e0b : rgbToHex(mesh.color),
        roughness: 0.72,
        metalness: 0.02,
        transparent: !isHighlighted,
        opacity: isHighlighted ? 1 : 0.58,
        side: THREE.DoubleSide,
      });
      material.userData.baseColor = rgbToHex(mesh.color);
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
    status.textContent = highlightText(highlightStepIds);

    return {
      setHighlight(nextStepIds) {
        const nextHighlightSet = new Set(nextStepIds || []);
        modelRoot.traverse(function (object) {
          if (!object.isMesh) return;
          const highlighted = nextHighlightSet.has(object.userData.expressId);
          object.material.color.setHex(highlighted ? 0xf59e0b : object.material.userData.baseColor);
          object.material.opacity = highlighted ? 1 : 0.58;
          object.material.transparent = !highlighted;
        });
        status.textContent = highlightText(nextStepIds || []);
      },
      dispose() {
        disposed = true;
        window.removeEventListener("resize", resize);
        renderer.dispose();
      },
    };
  }

  function frameModel(THREE, modelRoot, camera, controls) {
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1);
    camera.position.set(center.x + radius, center.y + radius * 0.65, center.z + radius);
    camera.near = Math.max(radius / 1000, 0.01);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }

  function rgbToHex(color) {
    const r = Math.round((color && color[0] !== undefined ? color[0] : 0.62) * 255);
    const g = Math.round((color && color[1] !== undefined ? color[1] : 0.66) * 255);
    const b = Math.round((color && color[2] !== undefined ? color[2] : 0.62) * 255);
    return (r << 16) + (g << 8) + b;
  }

  function highlightText(stepIds) {
    if (!stepIds || stepIds.length === 0) {
      return "IFC model loaded.";
    }
    return "IFC model loaded. Display STEP ids: " + stepIds.join(", ");
  }

  window.createIfcReviewViewer = createIfcReviewViewer;
})();
`;
}
