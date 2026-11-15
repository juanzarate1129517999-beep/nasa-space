(function () {
  "use strict";
  function init(host) {
    const T = window.THREE;
    if (!T || !host) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    host.appendChild(renderer.domElement);
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layer = document.createElement("div");
    layer.className = "lab3d__labels";
    host.appendChild(layer);

    const scene = new T.Scene();
    scene.background = new T.Color(0x05070b);
    scene.add(new T.HemisphereLight(0xdfe7f5, 0x30333a, 0.32));
    const key = new T.PointLight(0xffffff, 0.9, 20); key.position.set(0, 1.1, 0); scene.add(key);
    const camera = new T.PerspectiveCamera(55, 1, 0.05, 100);
    camera.position.set(-2.7, 0.3, 0.4);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 0.6; controls.maxDistance = 3.2;
    controls.target.set(0.2, 0, 0);

    const L = 6, W = 2.1;
    const wallM = new T.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.8 });
    const rackTex = (seed) => {
      const c = document.createElement("canvas"); c.width = 256; c.height = 512;
      const g = c.getContext("2d");
      g.fillStyle = "#c9ccd1"; g.fillRect(0, 0, 256, 512);
      let r = seed;
      const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
      for (let y = 8; y < 504; ) {
        const h = 40 + Math.floor(rnd() * 70);
        if (y + h > 504) break;
        g.fillStyle = rnd() > 0.7 ? "#a9b0b8" : "#d8dadd"; g.fillRect(10, y, 236, h - 6);
        g.strokeStyle = "#5b616a"; g.lineWidth = 3; g.strokeRect(10, y, 236, h - 6);
        g.fillStyle = "#3b4048"; g.fillRect(24, y + 8, 30, 6); g.fillRect(202, y + 8, 30, 6);
        if (rnd() > 0.6) { g.fillStyle = ["#2563eb", "#f59e0b", "#16a34a"][Math.floor(rnd() * 3)]; g.fillRect(110, y + 10, 36, 10); }
        y += h;
      }
      const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
    };
    const rackM = [3, 7, 11, 19].map((k) => new T.MeshStandardMaterial({ map: rackTex(k), roughness: 0.75, metalness: 0.05 }));
    const shell = new T.Mesh(new T.CylinderGeometry(1.45, 1.45, L + 0.6, 40, 1, true), new T.MeshStandardMaterial({ color: 0x6b7280, side: T.BackSide, roughness: 0.9 }));
    shell.rotation.z = Math.PI / 2; scene.add(shell);
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < 6; k++) {
        const r = new T.Mesh(new T.BoxGeometry(L / 6 - 0.04, 0.06, W - 0.1), rackM[(k + side) % 4]);
        const ang = (side * Math.PI) / 2;
        r.position.set(-L / 2 + (k + 0.5) * (L / 6), Math.cos(ang) * (W / 2), Math.sin(ang) * (W / 2));
        r.rotation.x = ang;
        scene.add(r);
      }
    }
    const rail = new T.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.5 });
    [[0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]].forEach(([y, z]) => {
      const h = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, L, 8), rail); h.rotation.z = Math.PI / 2; h.position.set(0, y * 0.95, z * 0.95); scene.add(h);
    });
    const inlet = new T.Mesh(new T.BoxGeometry(0.06, 0.5, 0.5), new T.MeshStandardMaterial({ color: 0x334155, emissive: 0x0ea5e9, emissiveIntensity: 0.25 }));
    inlet.position.set(-L / 2 + 0.05, 0.4, 0); scene.add(inlet);
    const ret = new T.Mesh(new T.BoxGeometry(0.06, 0.5, 0.5), new T.MeshStandardMaterial({ color: 0x334155 }));
    ret.position.set(L / 2 - 0.05, -0.4, 0); scene.add(ret);
    const detM = new T.MeshStandardMaterial({ color: 0x111827, emissive: 0x22c55e, emissiveIntensity: 0.6 });
    const detector = new T.Mesh(new T.BoxGeometry(0.12, 0.08, 0.16), detM);
    detector.position.set(L / 2 - 0.14, -0.4, 0.38); scene.add(detector);
    const pfe = new T.Group();
    const bottle = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.42, 16), new T.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 }));
    const band = new T.Mesh(new T.CylinderGeometry(0.072, 0.072, 0.06, 16), new T.MeshStandardMaterial({ color: 0xdc2626 }));
    band.position.y = 0.12; pfe.add(bottle, band); pfe.position.set(-1.2, -0.85, -0.85); scene.add(pfe);
    const mask = new T.Mesh(new T.TorusGeometry(0.08, 0.025, 8, 20), new T.MeshStandardMaterial({ color: 0xf8fafc }));
    mask.position.set(-1.0, -0.85, -0.6); scene.add(mask);
    const fireAt = new T.Vector3(0.4, -0.95, 0.35);
    const flame = new T.Mesh(new T.SphereGeometry(0.09, 24, 16), new T.MeshBasicMaterial({ color: 0x4f7cff, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
    const core = new T.Mesh(new T.SphereGeometry(0.045, 16, 12), new T.MeshBasicMaterial({ color: 0xffa25a }));
    flame.add(core); flame.position.copy(fireAt); scene.add(flame);
    const fireLight = new T.PointLight(0xff9a4a, 0, 3); fireLight.position.copy(fireAt); scene.add(fireLight);

    const NA = 70, aPos = new Float32Array(NA * 6), aSeed = [];
    for (let i = 0; i < NA; i++) aSeed.push([Math.random() * L - L / 2, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0.15 + Math.random() * 0.2]);
    const aGeo = new T.BufferGeometry(); aGeo.setAttribute("position", new T.BufferAttribute(aPos, 3));
    const aMat = new T.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5 });
    scene.add(new T.LineSegments(aGeo, aMat));
    const NS = 160, sPos = new Float32Array(NS * 3), sAge = new Float32Array(NS);
    for (let i = 0; i < NS; i++) sAge[i] = Math.random();
    const sGeo = new T.BufferGeometry(); sGeo.setAttribute("position", new T.BufferAttribute(sPos, 3));
    const sMat = new T.PointsMaterial({ color: 0x9ca3af, size: 0.05, transparent: true, opacity: 0, depthWrite: false });
    scene.add(new T.Points(sGeo, sMat));

    const labels = {};
    const lab = (id, text, pos) => { const el = document.createElement("span"); el.className = "l3"; el.textContent = text; layer.appendChild(el); labels[id] = { el, pos }; };
    lab("inlet", "Fresh air in", inlet.position.clone().add(new T.Vector3(0.1, 0.35, 0)));
    lab("return", "Air return", ret.position.clone().add(new T.Vector3(-0.1, -0.35, 0)));
    lab("detector", "Smoke detector", detector.position.clone().add(new T.Vector3(-0.05, 0.12, 0)));
    lab("fire", "Fire", fireAt.clone().add(new T.Vector3(0, 0.16, 0)));
    lab("pfe", "CO₂ extinguisher", pfe.position.clone().add(new T.Vector3(0, 0.3, 0)));
    lab("mask", "Oxygen mask", mask.position.clone().add(new T.Vector3(0, 0.14, 0)));

    const st = { fans: 1, fire: 0, smoke: 0, alarm: 0, suppress: 0, show: ["inlet", "return"] };
    const tgt = { ...st };
    const views = [
      { cam: [-2.7, 0.3, 0.4], look: [0.4, -0.1, 0] },
      { cam: [-0.7, -0.2, 0.7], look: [0.4, -0.85, 0.35] },
      { cam: [1.5, 0.1, 0.7], look: [2.8, -0.4, 0.3] },
      { cam: [-1.9, -0.35, 0.3], look: [-1.1, -0.85, -0.7] },
      { cam: [-2.7, 0.3, 0.4], look: [0.4, -0.1, 0] },
    ];
    const STEPS = [
      { fans: 1, fire: 0, smoke: 0, alarm: 0, suppress: 0, show: ["inlet", "return"] },
      { fans: 1, fire: 1, smoke: 1, alarm: 0, suppress: 0, show: ["fire", "inlet", "return"] },
      { fans: 1, fire: 1, smoke: 1, alarm: 1, suppress: 0, show: ["fire", "detector", "return"] },
      { fans: 0, fire: 0.25, smoke: 0.4, alarm: 1, suppress: 1, show: ["pfe", "mask", "fire"] },
      { fans: 1, fire: 1, smoke: 1, alarm: 0, suppress: 0, show: ["fire", "detector", "inlet"] },
    ];
    let fly = null;
    function go(i) {
      Object.assign(tgt, STEPS[i]);
      st.show = STEPS[i].show;
      const v = views[i];
      fly = { fp: camera.position.clone(), ft: controls.target.clone(), tp: new T.Vector3(...v.cam), tt: new T.Vector3(...v.look), t0: performance.now(), dur: reduce ? 1 : 1400 };
    }

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    addEventListener("resize", resize); resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    let running = true, visible = true, last = performance.now();
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(host);
    const proj = new T.Vector3();
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      const a = Math.min(1, dt * 1.8);
      ["fans", "fire", "smoke", "alarm", "suppress"].forEach((k) => { st[k] += (tgt[k] - st[k]) * a; });
      if (fly) {
        const k = Math.min(1, (now - fly.t0) / fly.dur), e = 1 - Math.pow(1 - k, 3);
        camera.position.lerpVectors(fly.fp, fly.tp, e); controls.target.lerpVectors(fly.ft, fly.tt, e);
        if (k >= 1) fly = null;
      }
      for (let i = 0; i < NA; i++) {
        const s = aSeed[i];
        s[0] += dt * 0.9 * st.fans * (0.6 + s[3]);
        if (s[0] > L / 2) s[0] = -L / 2;
        aPos.set([s[0], s[1], s[2], s[0] + s[3] * st.fans, s[1], s[2]], i * 6);
      }
      aGeo.attributes.position.needsUpdate = true;
      aMat.opacity = 0.5 * st.fans;
      const drift = 0.12 + 0.75 * st.fans;
      for (let i = 0; i < NS; i++) {
        sAge[i] += dt * drift * 0.25;
        if (sAge[i] > 1) sAge[i] = 0;
        const t = sAge[i], sp = 0.08 + t * 0.5;
        const jx = Math.sin(i * 12.9898) * sp, jz = Math.cos(i * 78.233) * sp;
        sPos.set([fireAt.x + t * (L / 2 - fireAt.x) * st.fans + jx * 0.6, fireAt.y + t * 0.5 * st.fans + jz * 0.4 + (1 - st.fans) * jx * 0.3, fireAt.z + jz * 0.5], i * 3);
      }
      sGeo.attributes.position.needsUpdate = true;
      sMat.opacity = 0.5 * st.smoke;
      const f = st.fire * (1 - 0.7 * st.suppress);
      flame.scale.setScalar(Math.max(0.001, f * (0.9 + 0.15 * Math.sin(now / 140))));
      flame.visible = f > 0.02;
      fireLight.intensity = 1.6 * f;
      detM.emissive.setHex(st.alarm > 0.5 && Math.sin(now / 160) > 0 ? 0xef4444 : 0x22c55e);
      controls.update();
      renderer.render(scene, camera);
      const Wd = host.clientWidth, Hd = host.clientHeight;
      Object.entries(labels).forEach(([id, l]) => {
        const on = st.show.includes(id) && (id !== "fire" || f > 0.05);
        proj.copy(l.pos).project(camera);
        const x = (proj.x * 0.5 + 0.5) * Wd, y = (-proj.y * 0.5 + 0.5) * Hd;
        l.el.classList.toggle("is-hidden", !on || proj.z > 1 || x < 0 || x > Wd || y < 0 || y > Hd);
        l.el.style.transform = `translate(${Math.min(Wd - l.el.offsetWidth - 6, x + 10).toFixed(1)}px, ${(y - 12).toFixed(1)}px)`;
      });
    }
    requestAnimationFrame(frame);
    return { go, pause() { running = false; }, resume() { resize(); if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }, resize };
  }
  window.PhoenixCabin = { init };
})();
