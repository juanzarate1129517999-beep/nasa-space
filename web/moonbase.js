(function () {
  "use strict";
  const DEG = Math.PI / 180;
  const U = 10;

  function dirLonLat(T, lon, lat) {
    const a = lon * DEG, b = lat * DEG;
    return new T.Vector3(Math.cos(b) * Math.cos(a), Math.sin(b), -Math.cos(b) * Math.sin(a));
  }

  function ephemAt(M, date) {
    const t0 = Date.parse(M.ephem.start + "T00:00:00Z");
    const n = M.ephem.sun.length;
    let f = (date.getTime() - t0) / 3600000 / M.ephem.step_h;
    const clamped = f < 0 || f > n - 1;
    f = Math.max(0, Math.min(n - 1.001, f));
    const i = Math.floor(f), k = f - i;
    const lerpAz = (a, b) => { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return (a + d * k + 360) % 360; };
    const pick = (arr) => [lerpAz(arr[i][0], arr[i + 1][0]), arr[i][1] + (arr[i + 1][1] - arr[i][1]) * k];
    const days = Math.max(0, Math.min(M.subsolar.rows.length - 1, Math.round((date.getTime() - t0) / 86400000)));
    return { sun: pick(M.ephem.sun), earth: pick(M.ephem.earth), sub: M.subsolar.rows[days], clamped };
  }

  function init(host, opts) {
    opts = opts || {};
    const T = window.THREE;
    if (!T || !host) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" }); } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.outputEncoding = T.sRGBEncoding;
    host.appendChild(renderer.domElement);
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const labelLayer = document.createElement("div");
    labelLayer.className = "lab3d__labels mb-labels";
    host.appendChild(labelLayer);
    const fade = document.createElement("div");
    fade.className = "mb-fade";
    host.appendChild(fade);
    const base = opts.base || "assets/moon/";
    const loader = new T.TextureLoader();
    const tex = (u) => { const t = loader.load(u); t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t; };

    const camera = new T.PerspectiveCamera(40, 1, 0.01, 20000);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false;

    const stars = tex("assets/3d/starmap_4k.jpg");
    stars.mapping = T.EquirectangularReflectionMapping;

    const moonScene = new T.Scene();
    moonScene.background = stars;
    moonScene.add(new T.AmbientLight(0xffffff, 0.06));
    const moonSun = new T.DirectionalLight(0xffffff, 2.4);
    moonScene.add(moonSun);
    const moonMat = new T.MeshStandardMaterial({ map: tex(base + "lroc_color_2k.jpg"), roughness: 1, metalness: 0 });
    const ldem = loader.load(base + "ldem_3_8bit.jpg");
    moonMat.displacementMap = ldem; moonMat.displacementScale = 0.012; moonMat.bumpMap = ldem; moonMat.bumpScale = 0.004;
    const moon = new T.Mesh(new T.SphereGeometry(1, 256, 128), moonMat);
    moonScene.add(moon);
    const siteMarks = new T.Group();
    moon.add(siteMarks);

    const terrScene = new T.Scene();
    terrScene.background = stars;
    const ambient = new T.HemisphereLight(0x9fb4d0, 0x151515, 0.035);
    terrScene.add(ambient);
    const sun = new T.DirectionalLight(0xfff4e6, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    terrScene.add(sun, sun.target);
    const earthlight = new T.DirectionalLight(0x8fb4ff, 0.05);
    terrScene.add(earthlight);

    let M = null, terrain = null, baseP = null, frameN = { north: null, east: null };
    const modules = {}, labels = {};
    let mode = "moon", selected = null, onSel = null, dateOff = 0, running = true, visible = true;

    function label(id, text, cls = "") {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "l3 mb-l " + cls;
      el.textContent = text;
      el.addEventListener("click", (e) => { e.stopPropagation(); if (mode === "base" && modules[id]) select(id); else if (id === "site" && mode === "moon") descend(); });
      labelLayer.appendChild(el);
      labels[id] = { el, pos: () => null, scene: null };
      return labels[id];
    }

    function buildMarkers() {
      M.sites.forEach((s) => {
        const isBase = s.id === M.site.id;
        const d = dirLonLat(T, s.lon, s.lat).multiplyScalar(1.004);
        const m = new T.Mesh(new T.SphereGeometry(isBase ? 0.011 : 0.006, 12, 8), new T.MeshBasicMaterial({ color: isBase ? 0xf97316 : 0x7dd3fc }));
        m.position.copy(d);
        siteMarks.add(m);
        if (isBase) {
          const L = label("site", `${s.name} · base site`, "mb-l--base");
          L.pos = () => moon.localToWorld(d.clone().multiplyScalar(1.01)); L.scene = "moon";
        }
      });
    }

    function heightAt(gx, gy) {
      const n = M.site.grid, h = terrain.heights;
      const x = Math.max(0, Math.min(n - 1.001, gx)), y = Math.max(0, Math.min(n - 1.001, gy));
      const i = Math.floor(y), j = Math.floor(x), fy = y - i, fx = x - j;
      const v = (r, c) => h[r * n + c];
      return (v(i, j) * (1 - fx) * (1 - fy) + v(i, j + 1) * fx * (1 - fy) + v(i + 1, j) * (1 - fx) * fy + v(i + 1, j + 1) * fx * fy) / U;
    }
    const span = () => { const c = M.site.cell_m / U; return { c, half: ((M.site.grid - 1) * c) / 2 }; };
    function toScene(x, y) {
      const S = M.site, { c, half } = span();
      const gx = (x - S.x0) / S.cell_m - 0.5, gy = (S.y0 - y) / S.cell_m - 0.5;
      return new T.Vector3(gx * c - half, heightAt(gx, gy), gy * c - half);
    }
    function localDir(azDeg, elDeg) {
      const az = azDeg * DEG, el = elDeg * DEG;
      const h = frameN.east.clone().multiplyScalar(Math.sin(az)).add(frameN.north.clone().multiplyScalar(Math.cos(az))).multiplyScalar(Math.cos(el));
      return new T.Vector3(h.x, Math.sin(el), h.z).normalize();
    }

    async function buildTerrain() {
      const S = M.site, n = S.grid;
      const buf = await (await fetch(base + "terrain_site01.bin")).arrayBuffer();
      const raw = new Int16Array(buf);
      const heights = new Float32Array(n * n);
      for (let k = 0; k < n * n; k++) heights[k] = raw[k] / 10;
      terrain = { heights };
      const size = ((n - 1) * S.cell_m) / U;
      const geo = new T.PlaneGeometry(size, size, n - 1, n - 1);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) pos.setY(k, heights[k] / U);
      geo.computeVertexNormals();
      const mat = new T.MeshStandardMaterial({ map: tex(base + "terrain_site01.jpg"), roughness: 1, metalness: 0, color: 0x9a978f });
      const mesh = new T.Mesh(geo, mat);
      mesh.receiveShadow = true; mesh.castShadow = true;
      terrScene.add(mesh);
      const b = M.base;
      const rho = Math.hypot(b.x, b.y);
      const nx = b.x / rho, ny = b.y / rho;
      frameN.north = new T.Vector3(nx, 0, -ny);
      frameN.east = new T.Vector3(-ny, 0, -nx);
      baseP = toScene(b.x, b.y);
      buildBase();
      const earth = new T.Mesh(new T.SphereGeometry(53, 48, 32), new T.MeshBasicMaterial({ map: tex("assets/3d/earth_day_2k.jpg") }));
      earth.name = "earth";
      terrScene.add(earth);
      modules.__earth = earth;
    }

    const white = new T.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.55, metalness: 0.15 });
    const grey = new T.MeshStandardMaterial({ color: 0x8b9099, roughness: 0.6, metalness: 0.5 });
    const dark = new T.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5, metalness: 0.6 });
    const glass = new T.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.8, emissive: 0x0a1a2a });
    const solar = new T.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.3, metalness: 0.7, emissive: 0x050a18 });
    const orange = new T.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });

    function shell(len, r, clip) {
      const g = new T.Group();
      const mat = white.clone();
      mat.clippingPlanes = [clip]; mat.clipShadows = true; mat.side = T.DoubleSide;
      const body = new T.Mesh(new T.CylinderGeometry(r, r, len, 48, 1, true), mat);
      body.rotation.z = Math.PI / 2;
      const capG = new T.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const c1 = new T.Mesh(capG, mat); c1.rotation.z = -Math.PI / 2; c1.position.x = len / 2; c1.scale.y = 0.45;
      const c2 = new T.Mesh(capG, mat); c2.rotation.z = Math.PI / 2; c2.position.x = -len / 2; c2.scale.y = 0.45;
      [body, c1, c2].forEach((m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
      const rmat = new T.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.5, metalness: 0.3, clippingPlanes: [clip] });
      for (let k = -2; k <= 2; k++) {
        const ring = new T.Mesh(new T.TorusGeometry(r * 1.005, 0.006, 6, 48), rmat);
        ring.rotation.y = Math.PI / 2; ring.position.x = (k * len) / 5; g.add(ring);
      }
      return g;
    }
    function interior(len, r) {
      const g = new T.Group();
      const floor = new T.Mesh(new T.BoxGeometry(len * 0.96, 0.01, r * 1.3), grey);
      floor.position.y = -r * 0.55; g.add(floor);
      for (let k = 0; k < 4; k++) {
        const rack = new T.Mesh(new T.BoxGeometry(len / 6, r * 0.9, r * 0.32), k % 2 ? dark : grey);
        rack.position.set(-len * 0.36 + k * len * 0.24, -r * 0.1, -r * 0.48);
        rack.castShadow = true; g.add(rack);
      }
      const fabric = new T.Mesh(new T.BoxGeometry(len * 0.18, r * 0.5, 0.01), new T.MeshStandardMaterial({ color: 0xc9b98f, roughness: 1 }));
      fabric.position.set(len * 0.2, -r * 0.05, r * 0.55); g.add(fabric);
      const ext = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.16, 16), new T.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.4 }));
      ext.position.set(-len * 0.35, -r * 0.42, r * 0.5); g.add(ext);
      const sensor = new T.Mesh(new T.BoxGeometry(0.05, 0.03, 0.03), new T.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x22d3ee, emissiveIntensity: 1.2 }));
      sensor.position.set(0, r * 0.62, 0); g.add(sensor);
      const flame = new T.Mesh(new T.SphereGeometry(0.07, 24, 16), new T.MeshBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      const core = new T.Mesh(new T.SphereGeometry(0.035, 16, 12), new T.MeshBasicMaterial({ color: 0xffb070 }));
      flame.add(core);
      flame.position.set(-len * 0.1, -r * 0.3, r * 0.05);
      g.add(flame);
      const glow = new T.PointLight(0x7aa2ff, 0, 1.2);
      glow.position.copy(flame.position); g.add(glow);
      const char = new T.Mesh(new T.BoxGeometry(len * 0.18, r * 0.5, 0.012), new T.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 }));
      char.position.copy(fabric.position); char.scale.x = 0.001; g.add(char);
      const NS = 70, sp = new Float32Array(NS * 3), seed = [];
      for (let i = 0; i < NS; i++) seed.push([Math.random(), Math.random() - 0.5, Math.random() - 0.5]);
      const sg = new T.BufferGeometry(); sg.setAttribute("position", new T.BufferAttribute(sp, 3));
      const sm = new T.PointsMaterial({ color: 0x9ca3af, size: 0.03, transparent: true, opacity: 0, depthWrite: false });
      const smoke = new T.Points(sg, sm); g.add(smoke);
      const fog = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({ color: 0xe5f3ff, transparent: true, opacity: 0, depthWrite: false }));
      fog.scale.setScalar(0.001); g.add(fog);
      const src = {
        droplet: flame.position.clone(),
        fabric: fabric.position.clone().add(new T.Vector3(-len * 0.09, 0, -0.02)),
        plastic: new T.Vector3(-len * 0.36 + 2 * len * 0.24, r * 0.38, -r * 0.3),
      };
      g.userData = { flame, glow, char, fabric, smoke, sg, sm, seed, fog, sensor, src, len, r };
      g.visible = false;
      return g;
    }
    function legs(g, len, r) {
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        const l = new T.Mesh(new T.CylinderGeometry(0.025, 0.035, r * 0.9, 8), grey);
        l.position.set((sx * len) / 3, -r * 1.2, (sz * r) / 1.6); l.castShadow = true; g.add(l);
      }));
    }

    function addModule(id, name, group, local, ofs, interiorGroup, clip, r) {
      group.position.copy(baseP).add(ofs);
      group.position.y = heightAt(...gridOf(group.position)) + r * 1.65;
      terrScene.add(group);
      modules[id] = { group, interior: interiorGroup, clip, r };
      const L = label(id, name);
      L.pos = () => group.localToWorld(local.clone()); L.scene = "terr";
    }
    function gridOf(p) {
      const { c, half } = span();
      return [(p.x + half) / c, (p.z + half) / c];
    }

    function buildBase() {
      const yaw = Math.atan2(frameN.north.x, frameN.north.z);
      const R = (v) => v.clone().applyAxisAngle(new T.Vector3(0, 1, 0), yaw);
      const clipH = new T.Plane(new T.Vector3(0, -1, 0), 1e6);
      const hab = new T.Group();
      hab.add(shell(1.4, 0.32, clipH));
      const inH = interior(1.4, 0.32); hab.add(inH);
      legs(hab, 1.4, 0.32);
      hab.rotation.y = yaw;
      addModule("habitat", "Surface habitat", hab, new T.Vector3(0, 0.45, 0), new T.Vector3(0, 0, 0), inH, clipH, 0.32);

      const clipA = new T.Plane(new T.Vector3(0, -1, 0), 1e6);
      const air = new T.Group();
      air.add(shell(0.5, 0.22, clipA));
      const inA = interior(0.5, 0.22); air.add(inA);
      legs(air, 0.5, 0.22);
      const hatch = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.03, 24), grey); hatch.rotation.z = Math.PI / 2; hatch.position.x = 0.3; air.add(hatch);
      air.rotation.y = yaw;
      addModule("airlock", "Airlock and EVA prep", air, new T.Vector3(0, 0.35, 0), R(new T.Vector3(1.25, 0, 0)), inA, clipA, 0.22);
      const tunnel = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.34, 24), white);
      tunnel.rotation.z = Math.PI / 2; tunnel.rotation.y = yaw;
      tunnel.position.copy(baseP).add(R(new T.Vector3(0.9, 0, 0))); tunnel.position.y = hab.position.y - 0.08;
      terrScene.add(tunnel);

      const clipR = new T.Plane(new T.Vector3(0, -1, 0), 1e6);
      const rov = new T.Group();
      const cab = shell(0.55, 0.17, clipR); cab.position.y = 0.05; rov.add(cab);
      const inR = interior(0.55, 0.17); inR.position.y = 0.05; rov.add(inR);
      const chassis = new T.Mesh(new T.BoxGeometry(0.75, 0.06, 0.36), grey); chassis.position.y = -0.14; chassis.castShadow = true; rov.add(chassis);
      for (let k = 0; k < 3; k++) [-1, 1].forEach((s) => {
        const w = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.05, 20), dark);
        w.rotation.x = Math.PI / 2; w.position.set(-0.28 + k * 0.28, -0.2, s * 0.2); w.castShadow = true; rov.add(w);
      });
      const win = new T.Mesh(new T.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
      win.rotation.z = -Math.PI / 2; win.position.set(0.35, 0.06, 0); win.scale.set(1, 0.4, 1); rov.add(win);
      rov.rotation.y = yaw + 0.5;
      addModule("rover", "Pressurized rover", rov, new T.Vector3(0, 0.3, 0), R(new T.Vector3(-0.4, 0, 1.6)), inR, clipR, 0.13);

      const mast = new T.Group();
      const pole = new T.Mesh(new T.CylinderGeometry(0.02, 0.03, 2.4, 10), grey); pole.position.y = 1.2; pole.castShadow = true; mast.add(pole);
      const panel = new T.Mesh(new T.BoxGeometry(0.02, 0.9, 0.6), solar); panel.position.y = 2.1; panel.castShadow = true; mast.add(panel);
      mast.position.copy(baseP).add(R(new T.Vector3(-1.4, 0, -0.9)));
      mast.position.y = heightAt(...gridOf(mast.position));
      terrScene.add(mast);
      modules.__panel = panel; modules.__mast = mast;
      const dishG = new T.Group();
      const dpole = new T.Mesh(new T.CylinderGeometry(0.015, 0.02, 0.7, 8), grey); dpole.position.y = 0.35; dishG.add(dpole);
      const dish = new T.Mesh(new T.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), white.clone());
      dish.material.side = T.DoubleSide; dish.position.y = 0.72; dishG.add(dish);
      dishG.position.copy(baseP).add(R(new T.Vector3(1.0, 0, 0.9)));
      dishG.position.y = heightAt(...gridOf(dishG.position));
      terrScene.add(dishG);
      modules.__dish = dish;
      const tag = label("comms", "Antenna aimed at Earth", "mb-l--sm"); tag.pos = () => dish.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.2, 0)); tag.scene = "terr";
      const ptag = label("power", "Solar array tracking the Sun", "mb-l--sm"); ptag.pos = () => panel.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.6, 0)); ptag.scene = "terr";
      const flood = new T.PointLight(0xffe2c4, 2.2, 14, 1.6);
      flood.position.copy(baseP).add(new T.Vector3(0, 3.2, 0));
      terrScene.add(flood);
      const mk = new T.Mesh(new T.RingGeometry(2.6, 2.7, 64), new T.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35, side: T.DoubleSide }));
      mk.rotation.x = -Math.PI / 2; mk.position.copy(baseP); mk.position.y += 0.05; terrScene.add(mk);
    }

    function applyTime() {
      if (!M) return;
      const date = new Date(Date.now() + dateOff);
      const E = ephemAt(M, date);
      const sd = dirLonLat(T, E.sub[2], E.sub[3]);
      moonSun.position.copy(sd.clone().multiplyScalar(10));
      if (frameN.north) {
        const s = localDir(E.sun[0], E.sun[1]);
        sun.position.copy(baseP).add(s.clone().multiplyScalar(600));
        sun.target.position.copy(baseP);
        sun.intensity = E.sun[1] > -2.5 ? 2.6 * Math.min(1, Math.max(0.1, (E.sun[1] + 2.5) / 2.5)) : 0.1;
        const sc = sun.shadow.camera;
        sc.left = -900; sc.right = 900; sc.top = 900; sc.bottom = -900; sc.near = 1; sc.far = 2400; sc.updateProjectionMatrix();
        const e = localDir(E.earth[0], E.earth[1]);
        modules.__earth.position.copy(baseP).add(e.clone().multiplyScalar(3200));
        earthlight.position.copy(e);
        earthlight.intensity = E.earth[1] > 0 ? 0.08 : 0;
        if (modules.__panel) { const yawS = Math.atan2(s.x, s.z); modules.__panel.parent.rotation.y = yawS; modules.__panel.rotation.y = Math.PI / 2; }
        if (modules.__dish) { const tgt = modules.__earth.position.clone(); modules.__dish.lookAt(tgt); modules.__dish.rotateX(Math.PI / 2); }
      }
      if (opts.onTime) opts.onTime({ date, sun: E.sun, earth: E.earth, clamped: E.clamped });
    }

    let fly = null;
    function flyTo(p, t, dur = 1600) { fly = { fp: camera.position.clone(), ft: controls.target.clone(), tp: p, tt: t, t0: performance.now(), dur: reduce ? 1 : dur }; }

    function showMoon() {
      mode = "moon"; select(null);
      controls.minDistance = 1.35; controls.maxDistance = 8;
      const b = M.base, d = dirLonLat(T, b.lon, b.lat);
      const view = dirLonLat(T, b.lon + 10, -48);
      camera.near = 0.01; camera.far = 200; camera.updateProjectionMatrix();
      camera.position.copy(view.multiplyScalar(3.4)); controls.target.set(0, 0, 0);
      if (opts.onMode) opts.onMode("moon");
      return d;
    }
    function descend() {
      if (!terrain) return;
      const d = dirLonLat(T, M.base.lon, M.base.lat);
      flyTo(d.clone().multiplyScalar(1.25), d.clone(), 1500);
      fade.classList.add("on");
      setTimeout(() => {
        mode = "base";
        camera.near = 0.02; camera.far = 20000; camera.updateProjectionMatrix();
        controls.minDistance = 1.2; controls.maxDistance = 900;
        const back = frameN.north.clone().multiplyScalar(-1).add(frameN.east.clone().multiplyScalar(0.6)).normalize();
        camera.position.copy(baseP).add(back.clone().multiplyScalar(420)).add(new T.Vector3(0, 220, 0));
        controls.target.copy(baseP);
        flyTo(baseP.clone().add(back.clone().multiplyScalar(26)).add(new T.Vector3(0, 9, 0)), baseP.clone(), 3200);
        fade.classList.remove("on");
        if (opts.onMode) opts.onMode("base");
      }, reduce ? 10 : 1300);
    }
    function select(id) {
      Object.entries(modules).forEach(([k, m]) => {
        if (k.startsWith("__")) return;
        const on = k === id;
        m.clip.constant = on ? m.group.position.y + m.r * 0.15 : 1e6;
        m.interior.visible = on;
        if (labels[k]) labels[k].el.classList.toggle("is-on", on);
      });
      selected = id;
      if (id && modules[id]) {
        const g = modules[id].group.position.clone();
        const dir = camera.position.clone().sub(controls.target).normalize();
        flyTo(g.clone().add(dir.multiplyScalar(2.6)).add(new T.Vector3(0, 1.4, 0)), g, 1100);
      }
      if (onSel) onSel(id);
    }

    const ray = new T.Raycaster(), mouse = new T.Vector2();
    let down = null;
    renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      if (mode === "moon") { if (ray.intersectObject(moon, false).length && M) { const hit = ray.intersectObject(moon, false)[0].point; const d = dirLonLat(T, M.base.lon, M.base.lat); if (hit.normalize().distanceTo(d) < 0.25) descend(); } return; }
      const ids = Object.keys(modules).filter((k) => !k.startsWith("__"));
      const hit = ray.intersectObjects(ids.map((k) => modules[k].group), true)[0];
      if (!hit) return;
      let o = hit.object; while (o && !ids.some((k) => modules[k].group === o)) o = o.parent;
      const id = ids.find((k) => modules[k].group === o);
      if (id) select(id === selected ? null : id);
    });

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    addEventListener("resize", resize); resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(host);

    const proj = new T.Vector3();
    let lastTime = 0;
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (!visible || !M) return;
      if (fly) {
        const k = Math.min(1, (now - fly.t0) / fly.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camera.position.lerpVectors(fly.fp, fly.tp, e); controls.target.lerpVectors(fly.ft, fly.tt, e);
        if (k >= 1) fly = null;
      }
      if (now - lastTime > 1000) { lastTime = now; applyTime(); }
      if (selected && modules[selected]) {
        const it = modules[selected].interior.userData;
        const flick = 0.85 + 0.25 * Math.sin(now / 160) + 0.1 * Math.sin(now / 37);
        it.flame.position.copy(it.src.droplet); it.flame.visible = true;
        it.flame.scale.setScalar(flick); it.glow.intensity = 0.9 + 0.4 * Math.sin(now / 120);
        it.char.scale.x = 0.001; it.sm.opacity = 0; it.fog.material.opacity = 0; it.sensor.material.emissive.setHex(0x22d3ee);
      }
      controls.update();
      renderer.render(mode === "moon" ? moonScene : terrScene, camera);
      const W = host.clientWidth, H = host.clientHeight;
      Object.values(labels).forEach((L) => {
        const near = !L.el.classList.contains("mb-l--sm") || camera.position.distanceTo(controls.target) < 14;
        const want = near && ((mode === "moon" && L.scene === "moon") || (mode === "base" && L.scene === "terr"));
        const p = want ? L.pos() : null;
        if (!p) { L.el.classList.add("is-hidden"); return; }
        proj.copy(p).project(camera);
        const x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H;
        let hidden = proj.z > 1 || x < 0 || x > W || y < 0 || y > H;
        if (mode === "moon" && !hidden) hidden = p.clone().normalize().dot(camera.position.clone().normalize()) < 0.15;
        L.el.classList.toggle("is-hidden", hidden);
        L.el.style.transform = `translate(${Math.min(W - L.el.offsetWidth - 6, x + 10).toFixed(1)}px, ${(y - 12).toFixed(1)}px)`;
      });
    }

    fetch(base + "moon.json").then((r) => r.json()).then(async (m) => {
      M = m;
      buildMarkers();
      showMoon();
      await buildTerrain();
      applyTime();
      if (opts.onReady) opts.onReady(M);
      if (opts.start === "base") descend();
    }).catch((e) => { console.error("[Skylab Phoenix] moon data failed", e); host.classList.add("lab3d__view--off"); });
    requestAnimationFrame(frame);

    return {
      descend, showMoon, select,
      onSelect(fn) { onSel = fn; },
      setTimeOffset(ms) { dateOff = ms; applyTime(); },
      mode: () => mode,
      pause() { running = false; },
      resume() { resize(); if (!running) { running = true; requestAnimationFrame(frame); } },
      resize,
    };
  }
  window.PhoenixMoon = { init };
})();
