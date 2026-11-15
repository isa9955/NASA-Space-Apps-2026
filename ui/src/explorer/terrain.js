import { robustPatches, pixelToLonLat, fitAt } from "../lib/mask";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { pointFor, uvFor } from "./model";

const imageCache = new Map();
const readImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
function loadImage(src) {
  if (!imageCache.has(src))
    imageCache.set(
      src,
      readImage(src).catch((e) => {
        imageCache.delete(src);
        throw e;
      }),
    );
  return imageCache.get(src);
}

export async function createTerrain(host, data, onPick) {
  const { terrain: t, region } = data;
  const base = await loadImage(data.baseUrl),
    maskImages = [];
  for (const url of data.maskUrls) maskImages.push(await loadImage(url));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#191d1e");
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 500);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive 3D Mars terrain. Drag to orbit, right-drag to pan, scroll to zoom.",
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.dampingFactor = 0.09;
  controls.minDistance = 12;
  controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI * 0.47;
  const reset = (mode = "3d") => {
    controls.target.set(0, 5, -3);
    camera.position.set(
      mode === "2d" ? 0 : 38,
      mode === "2d" ? 95 : 32,
      mode === "2d" ? -2.99 : 19,
    );
    controls.update();
  };
  reset();

  const masks = maskImages.map((img, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height);
    const raw = new Uint8Array(img.width * img.height);
    // Convert sRGB CSS colors to byte values without treating them as terrain lighting.
    const rgb = region.layers[i].color
      .match(/\w\w/g)
      .map((x) => parseInt(x, 16));
    for (let k = 0; k < raw.length; k++) {
      const value = pixels.data[k * 4];
      raw[k] = value;
      pixels.data[k * 4] = rgb[0];
      pixels.data[k * 4 + 1] = rgb[1];
      pixels.data[k * 4 + 2] = rgb[2];
      pixels.data[k * 4 + 3] =
        value >= 128
          ? 75
          : value
            ? (Math.floor(k / img.width) + (k % img.width)) % 8 < 3
              ? 90
              : 15
            : 0;
    }
    ctx.putImageData(pixels, 0, 0);
    const areaPerPixel =
      (region.region.dataset.sizeKm[0] * region.region.dataset.sizeKm[1]) /
      raw.length;
    const patches = robustPatches(
      raw,
      img.width,
      img.height,
      Math.ceil(0.02 / areaPerPixel),
      2,
    ).map((p) => ({
      area: p.pixels * areaPerPixel,
      location: pixelToLonLat(
        p.x,
        p.y,
        img.width,
        img.height,
        region.region.bounds,
      ),
    }));
    return {
      canvas,
      raw,
      width: img.width,
      height: img.height,
      patches: patches.sort((a, b) => b.area - a.area).slice(0, 2),
    };
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 3072;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const positions = new Float32Array(t.rows * t.cols * 3),
    uvs = new Float32Array(t.rows * t.cols * 2),
    indices = [];
  for (let r = 0; r < t.rows; r++)
    for (let c = 0; c < t.cols; c++) {
      const i = r * t.cols + c,
        u = t.colFractions[c],
        v = t.rowFractions[r];
      positions[i * 3] = (u - 0.5) * 40;
      positions[i * 3 + 1] = (t.elevation[r][c] + 2421) / 100;
      positions[i * 3 + 2] = (v - 0.5) * 80;
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = 1 - v;
      if (r < t.rows - 1 && c < t.cols - 1) {
        const a = i,
          b = i + 1,
          d = i + t.cols,
          e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xfff1db, 0x4a4b50, 2.1));
  const sun = new THREE.DirectionalLight(0xffe7cc, 1.7);
  sun.position.set(-35, 65, -15);
  scene.add(sun);
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  let down = null;
  const pointerDown = (e) => {
    down = [e.clientX, e.clientY];
  };
  const pointerUp = (e) => {
    if (
      !down ||
      Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 ||
      e.button !== 0
    )
      return;
    const box = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      (-(e.clientY - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(mesh)[0];
    if (hit?.uv) onPick(pointFor(hit.uv.x, 1 - hit.uv.y, region.region.bounds));
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestAnimationFrame(() => !stopped && animate());
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let stopped = false;
  function height(u, v) {
    const c = Math.min(t.cols - 2, Math.max(0, Math.floor(u * (t.cols - 1)))),
      r = Math.min(t.rows - 2, Math.max(0, Math.floor(v * (t.rows - 1))));
    const fx =
        (u - t.colFractions[c]) / (t.colFractions[c + 1] - t.colFractions[c]),
      fy =
        (v - t.rowFractions[r]) / (t.rowFractions[r + 1] - t.rowFractions[r]);
    let h;
    if (fx + fy < 1)
      h =
        t.elevation[r][c] * (1 - fx - fy) +
        t.elevation[r][c + 1] * fx +
        t.elevation[r + 1][c] * fy;
    else
      h =
        t.elevation[r + 1][c + 1] * (fx + fy - 1) +
        t.elevation[r][c + 1] * (1 - fy) +
        t.elevation[r + 1][c] * (1 - fx);
    return (h + 2421) / 100;
  }
  const animate = () => {
    if (stopped) return;
    renderer.render(scene, camera);
    host.parentElement.querySelectorAll("[data-map-point]").forEach((el) => {
      const p = JSON.parse(el.dataset.mapPoint),
        [u, v] = uvFor(p, region.region.bounds),
        world = new THREE.Vector3(
          (u - 0.5) * 40,
          height(u, v) + 0.06,
          (v - 0.5) * 80,
        ),
        pos = world.clone().project(camera);
      const x = (pos.x * 0.5 + 0.5) * host.clientWidth,
        y = (-pos.y * 0.5 + 0.5) * host.clientHeight;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      el.style.visibility =
        pos.z < 1 &&
        pos.z > -1 &&
        x > 0 &&
        x < host.clientWidth &&
        y > 0 &&
        y < host.clientHeight
          ? "visible"
          : "hidden";
    });
  };
  controls.addEventListener("change", animate);
  observer.disconnect();
  observer.observe(host);
  animate();
  function update({ route, focus, layers }) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#bba185";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    region.layers.forEach((l, i) => {
      if (layers[l.id])
        ctx.drawImage(masks[i].canvas, 0, 0, canvas.width, canvas.height);
    });
    if (route?.status === "ok")
      for (const kind of ["standard", "safe"]) {
        const variant = route[kind];
        if (!variant) continue;
        ctx.strokeStyle = kind === "standard" ? "#69c5ce" : "#efb54e";
        ctx.lineWidth = focus === kind ? 5 : 3.8;
        ctx.globalAlpha = focus && focus !== kind ? 0.25 : 1;
        ctx.setLineDash(kind === "safe" ? [13, 9] : []);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        variant.geometry.coordinates.forEach((p, i) => {
          const [u, v] = uvFor(p, region.region.bounds);
          i
            ? ctx.lineTo(u * canvas.width, v * canvas.height)
            : ctx.moveTo(u * canvas.width, v * canvas.height);
        });
        ctx.stroke();
      }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    texture.needsUpdate = true;
    animate();
  }
  update({ route: null, focus: null, layers: {} });
  return {
    update,
    reset,
    refresh: animate,
    patches: region.layers.flatMap((layer, i) =>
      masks[i].patches.map((p, rank) => ({ ...p, layer, rank: rank + 1 })),
    ),
    zoom: (factor) => {
      camera.position
        .sub(controls.target)
        .multiplyScalar(factor)
        .add(controls.target);
      controls.update();
    },
    center: (p) => {
      const [u, v] = uvFor(p, region.region.bounds);
      const next = new THREE.Vector3(
        (u - 0.5) * 40,
        height(u, v),
        (v - 0.5) * 80,
      );
      camera.position.add(next.clone().sub(controls.target));
      controls.target.copy(next);
      controls.update();
      animate();
    },
    zoneFits: (p) =>
      region.layers.flatMap((l, i) => {
        const m = masks[i],
          fit = fitAt(
            p,
            { values: m.raw, width: m.width, height: m.height },
            region.region.bounds,
          );
        return fit
          ? [{ ...l, fit: fit === "robust" ? "Robust" : "Nominal only" }]
          : [];
      }),
    destroy: () => {
      stopped = true;
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
