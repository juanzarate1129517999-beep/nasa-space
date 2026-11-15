(function () {
  "use strict";
  function rackTexture(T, seed) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#c9ccd1"; g.fillRect(0, 0, 256, 512);
    let r = seed;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let y = 8; y < 504;) {
      const h = 40 + Math.floor(rnd() * 70);
      if (y + h > 504) break;
      g.fillStyle = rnd() > 0.7 ? "#a9b0b8" : "#d8dadd"; g.fillRect(10, y, 236, h - 6);
      g.strokeStyle = "#5b616a"; g.lineWidth = 3; g.strokeRect(10, y, 236, h - 6);
      g.fillStyle = "#3b4048"; g.fillRect(24, y + 8, 30, 6); g.fillRect(202, y + 8, 30, 6);
      if (rnd() > 0.6) { g.fillStyle = ["#2563eb", "#f59e0b", "#16a34a"][Math.floor(rnd() * 3)]; g.fillRect(110, y + 10, 36, 10); }
      y += h;
    }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }

  function init(host, opts) {
    opts = opts || {};
    const T = window.THREE;
    if (!T || !host) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    host.appendChild(renderer.domElement);
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layer = document.createElement("div");
    layer.className = "lab3d__labels src-layer";
    host.appendChild(layer);

    const scene = new T.Scene();
    scene.background = new T.Color(0x05070b);
    scene.fog = new T.Fog(0x05070b, 6, 14);
    const hemi = new T.HemisphereLight(0xe6edf7, 0x2a2d33, 0.42); scene.add(hemi);
    [-2.4, 0, 2.4].forEach((x) => { const l = new T.PointLight(0xf4f7ff, 0.45, 5); l.position.set(x, 0.85, 0); scene.add(l); });
    const camera = new T.PerspectiveCamera(58, 1, 0.05, 60);
    const home = { p: new T.Vector3(-3.4, 0.15, 0.25), t: new T.Vector3(1.2, -0.05, 0) };
    camera.position.copy(home.p);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 0.4; controls.maxDistance = 4;
    controls.target.copy(home.t);

    const L = 7.2, W = 2.1;
    const shell = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, L + 1, 40, 1, true), new T.MeshStandardMaterial({ color: 0x4b5563, side: T.BackSide, roughness: 0.9 }));
    shell.rotation.z = Math.PI / 2; scene.add(shell);
    const rackM = [3, 7, 11, 19].map((k) => new T.MeshStandardMaterial({ map: rackTexture(T, k), roughness: 0.75 }));
    for (let side = 0; side < 4; side++) for (let k = 0; k < 7; k++) {
      const ang = (side * Math.PI) / 2;
      const r = new T.Mesh(new T.BoxGeometry(L / 7 - 0.05, 0.06, W - 0.12), rackM[(k + side) % 4]);
      r.position.set(-L / 2 + (k + 0.5) * (L / 7), Math.cos(ang) * (W / 2), Math.sin(ang) * (W / 2));
      r.rotation.x = ang; scene.add(r);
    }
    const lampM = new T.MeshBasicMaterial({ color: 0xf8fafc });
    [-2.4, 0, 2.4].forEach((x) => { const l = new T.Mesh(new T.BoxGeometry(0.8, 0.02, 0.3), lampM); l.position.set(x, W / 2 - 0.05, 0); scene.add(l); });
    const rail = new T.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.5 });
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([y, z]) => { const h = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, L, 8), rail); h.rotation.z = Math.PI / 2; h.position.set(0, y * 0.86, z * 0.86); scene.add(h); });
    const hatch = new T.Mesh(new T.TorusGeometry(0.62, 0.06, 12, 40), new T.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.5, roughness: 0.4 }));
    hatch.rotation.y = Math.PI / 2; hatch.position.x = L / 2 - 0.02; scene.add(hatch);
    const dark = new T.Mesh(new T.CircleGeometry(0.6, 32), new T.MeshBasicMaterial({ color: 0x020305 }));
    dark.rotation.y = -Math.PI / 2; dark.position.x = L / 2; scene.add(dark);

    const inlet = new T.Mesh(new T.BoxGeometry(0.05, 0.36, 0.5), new T.MeshStandardMaterial({ color: 0x334155, emissive: 0x0ea5e9, emissiveIntensity: 0.25 }));
    inlet.position.set(-L / 2 + 0.06, 0.55, -0.4); scene.add(inlet);
    const detM = new T.MeshStandardMaterial({ color: 0x111827, emissive: 0x22c55e, emissiveIntensity: 0.8 });
    const detector = new T.Mesh(new T.BoxGeometry(0.16, 0.08, 0.16), detM);
    detector.position.set(2.2, W / 2 - 0.08, 0.55); scene.add(detector);
    const pfe = new T.Group();
    pfe.add(new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.42, 16), new T.MeshStandardMaterial({ color: 0x1f2937 })));
    const band = new T.Mesh(new T.CylinderGeometry(0.072, 0.072, 0.06, 16), new T.MeshStandardMaterial({ color: 0xdc2626 })); band.position.y = 0.12; pfe.add(band);
    pfe.position.set(-1.6, -0.8, 0.85); scene.add(pfe);

    const S = {};
    const cable = new T.Group();
    for (let k = 0; k < 5; k++) {
      const c = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 2.6, 8), new T.MeshStandardMaterial({ color: [0x111827, 0xf2f2f2, 0xb91c1c, 0x1d4ed8, 0x6b7280][k], roughness: 0.6 }));
      c.rotation.z = Math.PI / 2; c.position.set(0, 0.03 * (k % 3), 0.035 * k); cable.add(c);
    }
    cable.position.set(0.4, 0.72, -0.78); scene.add(cable);
    S.wiring = { at: new T.Vector3(0.6, 0.74, -0.72), kind: "smoke" };
    const bag = new T.Mesh(new T.BoxGeometry(0.55, 0.42, 0.32), new T.MeshStandardMaterial({ color: 0xe7e2d3, roughness: 1 }));
    bag.position.set(-0.6, -0.68, -0.72); scene.add(bag);
    const strap = new T.Mesh(new T.BoxGeometry(0.57, 0.04, 0.34), new T.MeshStandardMaterial({ color: 0x4b5563 })); strap.position.copy(bag.position); scene.add(strap);
    const char = new T.Mesh(new T.BoxGeometry(0.56, 0.43, 0.33), new T.MeshStandardMaterial({ color: 0x17120d, roughness: 1 }));
    char.position.copy(bag.position); char.scale.set(0.001, 1, 1); scene.add(char);
    S.fabric = { at: bag.position.clone().add(new T.Vector3(0.28, 0.1, 0.17)), kind: "spread" };
    const pouch = new T.Mesh(new T.BoxGeometry(0.16, 0.22, 0.06), new T.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.3, transparent: true, opacity: 0.85 }));
    pouch.position.set(1.5, -0.35, 0.82); scene.add(pouch);
    S.liquid = { at: new T.Vector3(1.45, -0.2, 0.55), kind: "drops" };
    const panel = new T.Mesh(new T.BoxGeometry(0.5, 0.32, 0.02), new T.MeshStandardMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.45, roughness: 0.1 }));
    panel.position.set(-1.9, 0.2, -0.95); scene.add(panel);
    S.plastic = { at: new T.Vector3(-1.66, 0.05, -0.92), kind: "flame" };
    const pipe = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.4, 12), new T.MeshStandardMaterial({ color: 0xa3a3a3, metalness: 0.7, roughness: 0.3 }));
    pipe.position.set(2.7, -0.15, -0.85); scene.add(pipe);
    const valve = new T.Mesh(new T.SphereGeometry(0.06, 16, 12), new T.MeshStandardMaterial({ color: 0x16a34a, metalness: 0.4 }));
    valve.position.set(2.7, -0.2, -0.82); scene.add(valve);
    S.gas = { at: new T.Vector3(2.7, -0.2, -0.72), kind: "cool" };

    const flameMat = () => new T.MeshBasicMaterial({ color: 0x4f7cff, transparent: true, opacity: 0.6, depthWrite: false });
    const flames = [];
    for (let i = 0; i < 7; i++) {
      const f = new T.Mesh(new T.SphereGeometry(0.05, 20, 14), flameMat());
      const core = new T.Mesh(new T.SphereGeometry(0.022, 12, 8), new T.MeshBasicMaterial({ color: 0xffb36b }));
      f.add(core); f.userData.core = core; f.visible = false; scene.add(f); flames.push(f);
    }
    const fLight = new T.PointLight(0xff9a4a, 0, 2.5); scene.add(fLight);
    const NS = 140, sPos = new Float32Array(NS * 3), sAge = new Float32Array(NS);
    for (let i = 0; i < NS; i++) sAge[i] = Math.random();
    const sGeo = new T.BufferGeometry(); sGeo.setAttribute("position", new T.BufferAttribute(sPos, 3));
    const sMat = new T.PointsMaterial({ color: 0xa1a1aa, size: 0.045, transparent: true, opacity: 0, depthWrite: false });
    scene.add(new T.Points(sGeo, sMat));
    const fog = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({ color: 0xe5f3ff, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(fog);
    const NA = 60, aPos = new Float32Array(NA * 6), aSeed = [];
    for (let i = 0; i < NA; i++) aSeed.push([Math.random() * L - L / 2, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0.12 + Math.random() * 0.2]);
    const aGeo = new T.BufferGeometry(); aGeo.setAttribute("position", new T.BufferAttribute(aPos, 3));
    const aMat = new T.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.35 });
    scene.add(new T.LineSegments(aGeo, aMat));

    const spots = {};
    (opts.sources || []).forEach((s) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "hs"; b.innerHTML = `<i></i><span>${s.label}</span>`;
      b.addEventListener("click", () => { if (opts.onPick) opts.onPick(s.id); });
      layer.appendChild(b);
      spots[s.id] = b;
    });
    const detLab = document.createElement("span"); detLab.className = "l3 hs-det"; detLab.textContent = opts.detectorLabel || "Smoke detector"; layer.appendChild(detLab);

    const st = { id: null, step: 0, fire: 0, smoke: 0, alarm: 0, fans: 1, sup: 0, t: 0 };
    const tgt = { fire: 0, smoke: 0, alarm: 0, fans: 1, sup: 0 };
    let fly = null;
    function flyTo(p, t) { fly = { fp: camera.position.clone(), ft: controls.target.clone(), tp: p, tt: t, t0: performance.now(), dur: reduce ? 1 : 1300 }; }
    function show(id, step) {
      const changed = id !== st.id;
      st.id = id; st.step = step || 0;
      if (changed) st.t = 0;
      const P = [{ fire: 0, smoke: 0, alarm: 0, fans: 1, sup: 0 }, { fire: 0.6, smoke: 0.3, alarm: 0, fans: 1, sup: 0 }, { fire: 1, smoke: 1, alarm: 0, fans: 1, sup: 0 }, { fire: 0.35, smoke: 0.6, alarm: 1, fans: 0, sup: 1 }][st.step];
      Object.assign(tgt, P);
      if (!id) { flyTo(home.p.clone(), home.t.clone()); return; }
      const a = S[id].at;
      const side = a.z > 0 ? -1 : 1;
      flyTo(new T.Vector3(a.x - 1.0, a.y * 0.4, a.z + side * 0.95), a.clone());
      Object.entries(spots).forEach(([k, b]) => b.classList.toggle("is-on", k === id));
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
      st.t += dt;
      const a = Math.min(1, dt * 1.6);
      ["fire", "smoke", "alarm", "fans", "sup"].forEach((k) => { st[k] += (tgt[k] - st[k]) * a; });
      if (fly) {
        const k = Math.min(1, (now - fly.t0) / fly.dur), e = 1 - Math.pow(1 - k, 3);
        camera.position.lerpVectors(fly.fp, fly.tp, e); controls.target.lerpVectors(fly.ft, fly.tt, e);
        if (k >= 1) fly = null;
      }
      for (let i = 0; i < NA; i++) {
        const s = aSeed[i]; s[0] += dt * 0.8 * st.fans * (0.6 + s[3]); if (s[0] > L / 2) s[0] = -L / 2;
        aPos.set([s[0], s[1], s[2], s[0] + s[3] * st.fans, s[1], s[2]], i * 6);
      }
      aGeo.attributes.position.needsUpdate = true; aMat.opacity = 0.35 * st.fans;
      const src = st.id ? S[st.id] : null;
      const flick = 0.85 + 0.2 * Math.sin(now / 130) + 0.08 * Math.sin(now / 41);
      flames.forEach((f) => { f.visible = false; f.material.opacity = 0.6; f.userData.core.material.color.setHex(0xffb36b); });
      char.scale.x = 0.001;
      if (src) {
        const fire = st.fire * (1 - 0.6 * st.sup);
        const at = src.at;
        if (src.kind === "flame") { const f = flames[0]; f.visible = fire > 0.02; f.position.copy(at); f.scale.setScalar(Math.max(0.001, fire * flick * 1.6)); f.material.color.setHex(0x4f7cff); }
        if (src.kind === "spread") {
          const p = Math.min(1, st.t / 14) * Math.min(1, st.fire * 1.2);
          char.scale.x = Math.max(0.001, p); char.position.x = bag.position.x + 0.28 * (1 - p);
          for (let i = 0; i < 4; i++) { const f = flames[i]; f.visible = fire > 0.02; f.position.copy(bag.position).add(new T.Vector3(0.28 - 0.56 * p + 0.02, -0.15 + i * 0.1, 0.17)); f.scale.set(0.9 * fire * flick, 1.5 * fire * flick, 0.6); f.userData.core.material.color.setHex(0xffc27a); f.material.color.setHex(0xff8a3d); }
        }
        if (src.kind === "drops") {
          for (let i = 0; i < 6; i++) { const f = flames[i]; f.visible = fire > 0.02; f.position.copy(at).add(new T.Vector3(Math.sin(i * 2.1 + st.t * 0.3) * 0.18, Math.cos(i * 1.7 + st.t * 0.25) * 0.14, Math.sin(i * 3.3) * 0.08)); f.scale.setScalar(Math.max(0.001, (0.5 + 0.12 * i) * fire * flick)); f.material.color.setHex(0x1f4fe0); f.material.opacity = 0.55; f.userData.core.material.color.setHex(0xffa04a); }
        }
        if (src.kind === "cool") { const f = flames[0]; f.visible = fire > 0.02; f.position.copy(at); f.scale.setScalar(Math.max(0.001, fire * 2.2)); f.material.color.setHex(0x1a2a55); f.material.opacity = 0.35; f.userData.core.material.color.setHex(0x22305a); }
        fLight.position.copy(at); fLight.intensity = src.kind === "cool" || src.kind === "smoke" ? 0.15 * fire : 1.5 * fire;
        if (src.kind === "smoke") { cable.children.forEach((c, i) => { c.material.emissive = c.material.emissive || new T.Color(); c.material.emissive.setRGB(0.6 * st.fire * (0.6 + 0.4 * Math.sin(now / 200 + i)), 0.15 * st.fire, 0); }); }
        else cable.children.forEach((c) => c.material.emissive && c.material.emissive.setRGB(0, 0, 0));
        const drift = 0.15 + 0.85 * st.fans;
        for (let i = 0; i < NS; i++) {
          sAge[i] += dt * drift * 0.22; if (sAge[i] > 1) sAge[i] = 0;
          const t = sAge[i], sp = 0.05 + t * 0.4;
          const jx = Math.sin(i * 12.9898) * sp, jz = Math.cos(i * 78.233) * sp;
          sPos.set([at.x + t * 2.6 * st.fans + jx, at.y + t * 0.6 * st.fans + jz * 0.5, at.z + jz * 0.6 - t * at.z * 0.3], i * 3);
        }
        sGeo.attributes.position.needsUpdate = true;
        sMat.opacity = 0.55 * st.smoke * (src.kind === "cool" ? 0.15 : 1);
        fog.position.copy(at); fog.scale.setScalar(Math.max(0.001, st.sup * 0.6)); fog.material.opacity = 0.16 * st.sup;
      } else { sMat.opacity *= 0.9; fLight.intensity = 0; fog.material.opacity = 0; }
      detM.emissive.setHex(st.alarm > 0.5 && Math.sin(now / 150) > 0 ? 0xef4444 : 0x22c55e);
      controls.update();
      renderer.render(scene, camera);
      const Wd = host.clientWidth, Hd = host.clientHeight;
      const place = (el, p) => {
        proj.copy(p).project(camera);
        const x = (proj.x * 0.5 + 0.5) * Wd, y = (-proj.y * 0.5 + 0.5) * Hd;
        const out = proj.z > 1 || x < 0 || x > Wd || y < 0 || y > Hd;
        el.classList.toggle("is-hidden", out);
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      };
      Object.entries(spots).forEach(([k, b]) => place(b, S[k].at));
      place(detLab, detector.position.clone().add(new T.Vector3(0, -0.1, 0)));
    }
    requestAnimationFrame(frame);
    return { show, pause() { running = false; }, resume() { resize(); if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }, resize };
  }
  window.PhoenixSources = { init };
})();
