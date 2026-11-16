(function () {
  "use strict";
  const FVS = `uniform float uG; uniform float uT; uniform float uR; uniform float uFlow; varying vec3 vN; varying vec3 vP; varying float vH;
    void main(){ vec3 p = position; float up = max(p.y, 0.0);
      p.y *= 1.0 + uG * (2.4 * up + 0.15); p.xz *= 1.0 - uG * 0.62 * up * up; p.y += uG * 0.3;
      float dn = max(p.x, 0.0); p.x += uFlow * (0.25 + 1.6 * dn * dn); p.yz *= 1.0 - uFlow * 0.25 * dn;
      float n = sin(uT * 9.0 + p.y * 6.0 + p.x * 3.0) * 0.035 + sin(uT * 13.0 + p.z * 7.0 + p.y * 4.0) * 0.025;
      p += normal * n * (0.25 + 1.4 * uG * up + 0.8 * uFlow * dn); p *= uR; vH = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);
      vec4 w = modelMatrix * vec4(p, 1.0); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w; }`;
  const FFS = `uniform vec3 uCam; uniform float uSoot; uniform float uGlow; uniform float uG; uniform float uLayer; varying vec3 vN; varying vec3 vP; varying float vH;
    void main(){ vec3 v = normalize(uCam - vP); float fr = pow(1.0 - abs(dot(normalize(vN), v)), 1.7);
      vec3 blue = vec3(0.25, 0.45, 1.0); vec3 orange = vec3(1.0, 0.42, 0.06); vec3 yellow = vec3(1.0, 0.8, 0.32);
      float s = uSoot * mix(0.55, 1.0, smoothstep(0.2, 0.9, vH)) * (uG > 0.01 ? smoothstep(0.15, 0.6, vH) : 0.8);
      vec3 col = mix(blue, mix(orange, yellow, uLayer), s);
      float a = (0.12 + 0.88 * fr) * uGlow * (uLayer > 0.5 ? 0.55 : 1.0);
      if (uG > 0.01) a *= mix(1.0, 0.25, smoothstep(0.75, 1.0, vH));
      gl_FragColor = vec4(col * a, a); }`;
  const KEYS = ["o2", "p", "co2", "he", "g", "flow"];

  function init(host, opts) {
    opts = opts || {};
    const T = window.THREE;
    if (!T || !host) return null;
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      return null;
    }
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(renderer.domElement);
    const labelLayer = document.createElement("div");
    labelLayer.className = "lab3d__labels";
    host.appendChild(labelLayer);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(40, 1, 0.05, 100);
    camera.position.set(3.0, 1.3, 5.0);
    if (opts.cam) camera.position.set(opts.cam[0], opts.cam[1], opts.cam[2]);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 10;
    controls.autoRotate = !reduce && opts.autoRotate !== false;
    controls.autoRotateSpeed = 0.45;

    scene.add(new T.AmbientLight(0xffffff, 0.3));
    const key = new T.PointLight(0xffa860, 2.2, 12);
    scene.add(key);
    const rim = new T.DirectionalLight(0x8fb4ff, 0.55);
    rim.position.set(-4, 3, -2);
    scene.add(rim);

    const metal = new T.MeshStandardMaterial({ color: 0x4a5266, metalness: 0.8, roughness: 0.35 });
    const chamber = new T.Group();
    scene.add(chamber);
    chamber.add(
      new T.Mesh(
        new T.CylinderGeometry(2.2, 2.2, 4.4, 64, 1, true),
        new T.MeshStandardMaterial({ color: 0x161a24, metalness: 0.6, roughness: 0.5, side: T.BackSide, transparent: true, opacity: 0.6 }),
      ),
    );
    [-2.2, 2.2].forEach((y) => {
      const r = new T.Mesh(new T.TorusGeometry(2.2, 0.05, 12, 96), metal);
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      chamber.add(r);
    });
    const grid = new T.GridHelper(4.4, 22, 0x2a3142, 0x1b2130);
    grid.position.y = -2.2;
    chamber.add(grid);
    const needleGeo = new T.CylinderGeometry(0.016, 0.03, 1.8, 12);
    const n1 = new T.Mesh(needleGeo, metal);
    n1.rotation.z = Math.PI / 2.6;
    n1.position.set(-0.95, -0.35, 0);
    chamber.add(n1);
    const n2 = new T.Mesh(needleGeo, metal);
    n2.rotation.z = -Math.PI / 2.6;
    n2.position.set(0.95, -0.35, 0);
    chamber.add(n2);
    const igniter = new T.Group();
    igniter.position.set(-0.05, 1.05, 0.55);
    igniter.rotation.x = 0.55;
    chamber.add(igniter);
    igniter.add(new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 1.2, 8), metal));
    const tipMat = new T.MeshBasicMaterial({ color: 0x331a10 });
    const tip = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), tipMat);
    tip.position.y = -0.62;
    igniter.add(tip);
    const drop = new T.Mesh(
      new T.SphereGeometry(0.16, 32, 24),
      new T.MeshStandardMaterial({ color: 0x9fb6d8, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.85 }),
    );
    scene.add(drop);

    const flameMats = [],
      flames = [];
    [
      [1.0, 0.0],
      [0.72, 1.0],
    ].forEach(([sc, layer]) => {
      const m = new T.ShaderMaterial({
        uniforms: {
          uG: { value: 0 },
          uT: { value: 0 },
          uR: { value: 1 },
          uFlow: { value: 0 },
          uCam: { value: new T.Vector3() },
          uSoot: { value: 0.3 },
          uGlow: { value: 1 },
          uLayer: { value: layer },
        },
        vertexShader: FVS,
        fragmentShader: FFS,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      });
      const f = new T.Mesh(new T.SphereGeometry(1, 72, 56), m);
      f.userData.k = sc;
      scene.add(f);
      flames.push(f);
      flameMats.push(m);
    });

    const NS = 46,
      sPos = new Float32Array(NS * 6),
      sSeed = [];
    for (let i = 0; i < NS; i++)
      sSeed.push([Math.random() * 4 - 2, Math.random() * 3.4 - 1.7, Math.random() * 3 - 1.5, 0.15 + Math.random() * 0.25]);
    const sGeo = new T.BufferGeometry();
    sGeo.setAttribute("position", new T.BufferAttribute(sPos, 3));
    const sMat = new T.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0 });
    scene.add(new T.LineSegments(sGeo, sMat));
    const gArrow = new T.ArrowHelper(new T.Vector3(0, -1, 0), new T.Vector3(-1.65, 1.5, 0.3), 1, 0xfbbf24, 0.22, 0.14);
    scene.add(gArrow);

    const ANCH = {
      drop: () => drop.position.clone(),
      flame: () => new T.Vector3(cur.R * 0.72 * (1 + cur.flow * 0.6), cur.R * 0.72 + cur.g * cur.R * 1.4, 0),
      igniter: () => tip.getWorldPosition(new T.Vector3()),
      needle: () => new T.Vector3(1.55, -0.85, 0),
      gravity: () => new T.Vector3(-1.65, 1.6, 0.3),
      flow: () => new T.Vector3(-1.4, -1.2, 0.8),
    };
    const labels = {};
    function setLabels(map) {
      labelLayer.innerHTML = "";
      Object.keys(labels).forEach((k) => delete labels[k]);
      Object.entries(map || {}).forEach(([k, t]) => {
        const el = document.createElement("span");
        el.className = "l3";
        el.textContent = t;
        labelLayer.appendChild(el);
        labels[k] = el;
      });
    }
    setLabels(opts.labels);
    let showLabels = opts.showLabels !== false;

    const tgt = { o2: 0.21, p: 1, co2: 0, he: 0, g: 0, flow: 0 };
    const cur = { ...tgt, R: 0.5 };
    const st = { fuel: "Methanol", pOut: 0.5, steady: false, d0: 3, K: 0.6, rext: 0.72 };
    const DEP = 0.8,
      IGN_S = 1.2,
      TAIL = 1.8,
      U = 0.075;
    const run = { t: 0, e: 0, total: 10, tBurn: 7, dEnd: 0.3, out: false, outAt: 1, n: 0, status: "", phase: "deploy", d: 3 };
    let onRun = null;
    function newRun() {
      run.e = 0;
      run.n++;
      run.out = !st.steady && Math.random() < st.pOut;
      run.dEnd = run.out ? st.d0 * st.rext : st.d0 * 0.1;
      run.tBurn = Math.max(1.5, (st.d0 * st.d0 - run.dEnd * run.dEnd) / Math.max(0.05, st.K));
      run.total = IGN_S + run.tBurn + TAIL;
      run.outAt = (IGN_S + run.tBurn) / run.total;
      run.t = 0;
      run.d = st.d0;
      run.status = run.out ? "went out on its own" : "burned until the fuel was gone";
      if (onRun) onRun(run);
    }
    function resize() {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    addEventListener("resize", resize);
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    let running = true,
      visible = true,
      last = performance.now();
    newRun();
    if (opts.lit) run.e = IGN_S + 0.4;
    const proj = new T.Vector3();
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      const a = Math.min(1, dt * 2.2);
      KEYS.forEach((k) => {
        cur[k] += (tgt[k] - cur[k]) * a;
      });
      if (st.steady) run.e = Math.min(run.e + dt, IGN_S + 0.35 * run.tBurn);
      else run.e += dt;
      if (!st.steady && run.e >= run.total) newRun();
      run.t = run.e / run.total;
      const bEnd = IGN_S + run.tBurn;
      run.phase = run.e < DEP ? "deploy" : run.e < IGN_S ? "ignite" : run.e < bEnd ? "burn" : run.out ? "out" : "end";
      const tb = Math.max(0, Math.min(run.e, bEnd) - IGN_S);
      let d = Math.sqrt(Math.max(run.dEnd * run.dEnd, st.d0 * st.d0 - st.K * tb));
      if (!run.out && run.e > bEnd) d = Math.max(0, run.dEnd * (1 - (run.e - bEnd) * 3));
      run.d = d;
      const prog = tb / run.tBurn;
      let k = run.e < DEP ? 0 : run.e < IGN_S ? (run.e - DEP) / (IGN_S - DEP) : run.e < bEnd ? 1 : Math.max(0, 1 - (run.e - bEnd) * 6);
      if (run.out && run.e < bEnd && prog > 0.8) k *= 1 - (0.55 * (prog - 0.8)) / 0.2;
      const hot = run.e > DEP * 0.5 && run.e < IGN_S;
      tipMat.color.setRGB(hot ? 1 : 0.2, hot ? 0.45 : 0.1, 0.06);
      const pull = Math.min(1, run.e / DEP);
      n1.position.x = -0.55 - 0.4 * pull;
      n2.position.x = 0.55 + 0.4 * pull;
      igniter.position.y =
        1.05 - 0.45 * Math.max(0, 1 - Math.abs(run.e - IGN_S * 0.8) / 0.6) + 0.35 * Math.min(1, Math.max(0, run.e - IGN_S) * 1.5);
      const dil = 1 - 0.9 * cur.co2 - 0.7 * cur.he;
      const fsr =
        (2.6 + 0.7 / Math.max(0.1, cur.o2)) *
        Math.pow(1 / Math.max(0.25, cur.p), 0.12) *
        (1 + 0.35 * prog) *
        (run.out ? 1 + 0.25 * Math.max(0, prog - 0.7) : 1);
      const R = Math.max(0.06, fsr * 0.5 * Math.max(d, st.d0 * 0.25) * U * Math.max(0.55, dil));
      cur.R = R;
      const soot = Math.min(
        1,
        (st.fuel === "Heptane" ? 0.85 : 0.18) * (0.5 + 2.4 * (cur.o2 - 0.12)) * (0.6 + 0.4 * cur.g) * Math.max(0.2, dil),
      );
      const tt = now / 1000,
        glow = k * (0.35 + 0.65 * Math.min(1, cur.o2 / 0.3)) * Math.max(0.3, dil);
      flames.forEach((f, idx) => {
        const u = flameMats[idx].uniforms;
        u.uG.value = cur.g;
        u.uFlow.value = cur.flow;
        u.uT.value = tt;
        u.uR.value = R * f.userData.k;
        u.uSoot.value = soot;
        u.uGlow.value = glow * (idx ? 0.9 : 1);
        u.uCam.value.copy(camera.position);
      });
      drop.scale.setScalar(Math.max(0.01, (d * U * 0.5) / 0.16));
      drop.visible = d > 0.05;
      key.intensity = 2.6 * k * (0.3 + soot);
      sMat.opacity = Math.min(0.55, cur.flow * 0.9);
      for (let i = 0; i < NS; i++) {
        const s = sSeed[i];
        s[0] += dt * (0.4 + 2.2 * cur.flow) * (0.6 + s[3]);
        if (s[0] > 2) s[0] = -2;
        sPos.set([s[0], s[1], s[2], s[0] + s[3], s[1], s[2]], i * 6);
      }
      sGeo.attributes.position.needsUpdate = true;
      gArrow.visible = cur.g > 0.03;
      gArrow.setLength(0.25 + 1.0 * cur.g, 0.2, 0.13);
      controls.update();
      renderer.render(scene, camera);
      const W = host.clientWidth,
        H = host.clientHeight;
      Object.entries(labels).forEach(([id, el]) => {
        const p = ANCH[id] ? ANCH[id]() : null;
        const hide =
          !showLabels ||
          !p ||
          (id === "gravity" && cur.g < 0.03) ||
          (id === "flow" && cur.flow < 0.03) ||
          (id === "flame" && k < 0.2) ||
          (id === "drop" && !drop.visible);
        if (hide) {
          el.classList.add("is-hidden");
          return;
        }
        proj.copy(p).project(camera);
        const x = (proj.x * 0.5 + 0.5) * W,
          y = (-proj.y * 0.5 + 0.5) * H;
        el.classList.toggle("is-hidden", proj.z > 1);
        el.style.transform = `translate(${Math.max(4, Math.min(W - el.offsetWidth - 4, x + 10)).toFixed(1)}px, ${Math.max(4, Math.min(H - 24, y - 10)).toFixed(1)}px)`;
      });
    }
    requestAnimationFrame(frame);
    if ("IntersectionObserver" in window)
      new IntersectionObserver((es) => {
        visible = es[0].isIntersecting;
      }).observe(host);
    return {
      set(s) {
        KEYS.forEach((k) => {
          if (s[k] != null) tgt[k] = s[k];
        });
        if (s.fuel) st.fuel = s.fuel;
        if (s.pOut != null) st.pOut = s.pOut;
        let phys = false;
        ["d0", "K", "rext"].forEach((k) => {
          if (s[k] != null && Math.abs(s[k] - st[k]) > 1e-6) {
            st[k] = s[k];
            phys = true;
          }
        });
        if (phys && !st.steady) newRun();
        if (s.steady != null) {
          const was = st.steady;
          st.steady = s.steady;
          if (was && !s.steady) newRun();
        }
      },
      replay() {
        newRun();
      },
      onRun(fn) {
        onRun = fn;
        fn(run);
      },
      state() {
        return {
          t: run.t,
          phase: run.phase,
          out: run.out,
          outAt: run.out ? run.outAt : null,
          n: run.n,
          e: run.e,
          d: run.d,
          d0: st.d0,
          K: st.K,
          dEnd: run.dEnd,
          ign: IGN_S,
          tBurn: run.tBurn,
          total: run.total,
        };
      },
      labels(map) {
        setLabels(map);
      },
      showLabels(v) {
        showLabels = v;
      },
      pause() {
        running = false;
      },
      resume() {
        resize();
        if (!running) {
          running = true;
          last = performance.now();
          resize();
          requestAnimationFrame(frame);
        }
      },
      resize,
    };
  }
  window.PhoenixLab3D = { init };
})();
