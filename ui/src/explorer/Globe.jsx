import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "./globe.css";

export function Globe() {
  const host = useRef(null),
    pin = useRef(null),
    reset = useRef(null);
  const [error, setError] = useState("");
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2", { antialias: true });
    if (!context) {
      setWebglUnavailable(true);
      setError("Interactive rotation is unavailable here. The site explorer is still available.");
      return;
    }
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, canvas, context });
    } catch {
      setWebglUnavailable(true);
      setError("Interactive rotation is unavailable here. The site explorer is still available.");
      return;
    }
    renderer.setClearColor("#111718");
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    host.current.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Mars globe. Drag to rotate and scroll to zoom.",
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 7;
    // Equirectangular mapping: longitude zero at texture center, north at top.
    const lon = THREE.MathUtils.degToRad(30.18),
      lat = THREE.MathUtils.degToRad(40.74);
    const site = new THREE.Vector3(
      Math.cos(lat) * Math.cos(lon),
      Math.sin(lat),
      -Math.cos(lat) * Math.sin(lon),
    );
    reset.current = () => {
      camera.position.copy(site).multiplyScalar(3.8);
      controls.target.set(0, 0, 0);
      controls.update();
    };
    reset.current();
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    const material = new THREE.MeshBasicMaterial({ color: "#bb7552" });
    scene.add(new THREE.Mesh(geometry, material));
    let disposed = false,
      texture;
    new THREE.TextureLoader().load(
      "/mars-2k.jpg",
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        texture = loaded;
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.color.set("white");
        material.needsUpdate = true;
        draw();
      },
      undefined,
      () =>
        !disposed &&
        setError(
          "Surface image unavailable. Site navigation is still available.",
        ),
    );
    const markerGeometry = new THREE.SphereGeometry(0.018, 12, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: "#ffba68" });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(site).multiplyScalar(1.012);
    scene.add(marker);
    function draw() {
      renderer.render(scene, camera);
      const projected = marker.position.clone().project(camera);
      const visible =
        site.dot(camera.position.clone().sub(site)) > 0 &&
        Math.abs(projected.x) < 0.95 &&
        Math.abs(projected.y) < 0.9;
      if (pin.current) {
        pin.current.style.visibility = visible ? "visible" : "hidden";
        pin.current.style.left = `${(projected.x + 1) * 50}%`;
        pin.current.style.top = `${(1 - projected.y) * 50}%`;
      }
    }
    controls.addEventListener("change", draw);
    const observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = host.current;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    });
    observer.observe(host.current);
    return () => {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      texture?.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      reset.current = null;
    };
  }, []);
  return (
    <section className="globe-page">
      <header className="globe-header">
        <strong>
          MARS <span>SITE PLANNER</span>
        </strong>
        <span>PLANET OVERVIEW · DESKTOP PROTOTYPE</span>
      </header>
      <div className="globe-stage" ref={host}>
        {webglUnavailable && <div className="globe-static" role="img" aria-label="Illustrative global Mars surface map; rotation is unavailable." />}
        <a ref={pin} className="site-pin" href="/explorer">
          Deuteronilus Mensae <span>Explore site →</span>
        </a>
      </div>
      <aside className="globe-card">
        <span className="globe-eyebrow">ONE PLANET. ONE DETAILED SITE.</span>
        <h1>
          Find your way
          <br />
          to the surface.
        </h1>
        <p>
          Rotate Mars to explore its geography. Open Deuteronilus Mensae to
          compare traverses and inspect the mapped terrain.
        </p>
        <div className="site-summary">
          <strong>Deuteronilus Mensae</strong>
          <span>~40.74° N · 30.18° E</span>
          <span>4 × 8 km detailed terrain coverage</span>
        </div>
        <a className="primary overview-enter" href="/explorer">
          Open detailed explorer →
        </a>
        <button onClick={() => reset.current?.()}>Locate site</button>
        <p className="globe-limit">
          Global imagery is visual context only. Scientific tools are available
          within the regional dataset. The site marker is enlarged for
          visibility.
        </p>
        {error && <p role="status">{error}</p>}
      </aside>
      <footer className="globe-footer">
        <span>Drag to rotate · Scroll to zoom · Select the site to enter</span>
        <span>
          Illustrative surface map:{" "}
          <a
            href="https://www.solarsystemscope.com/textures/"
            target="_blank"
            rel="noreferrer"
          >
            Solar System Scope
          </a>{" "}
          · CC BY 4.0 · color adjusted; may include filled gaps
        </span>
      </footer>
    </section>
  );
}
