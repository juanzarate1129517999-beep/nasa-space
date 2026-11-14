(function () {
  "use strict";
  const FVS = `uniform float uG; uniform float uT; uniform float uR; varying vec3 vN; varying vec3 vP; varying float vH;
    void main(){ vec3 p = position; float up = max(p.y, 0.0);
      p.y *= 1.0 + uG * (2.4 * up + 0.15); p.xz *= 1.0 - uG * 0.62 * up * up; p.y += uG * 0.3;
      float n = sin(uT * 9.0 + p.y * 6.0 + p.x * 3.0) * 0.035 + sin(uT * 13.0 + p.z * 7.0 + p.y * 4.0) * 0.025;
      p += normal * n * (0.25 + 1.4 * uG * up); p *= uR; vH = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);
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
  function init(host) {
    const T = window.THREE;
    if (!T || !host) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(40, 1, 0.05, 100);
    camera.position.set(3.2, 1.4, 5.2);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 2.2; controls.maxDistance = 10;
    controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.6;

    scene.add(new T.AmbientLight(0xffffff, 0.25));
    const key = new T.PointLight(0xffa860, 2.2, 12); scene.add(key);
    const rim = new T.DirectionalLight(0x8fb4ff, 0.5); rim.position.set(-4, 3, -2); scene.add(rim);

    const metal = new T.MeshStandardMaterial({ color: 0x3a4152, metalness: 0.8, roughness: 0.35 });
    const dark = new T.MeshStandardMaterial({ color: 0x14171f, metalness: 0.4, roughness: 0.7 });
    const chamber = new T.Group(); scene.add(chamber);
    const shell = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 4.4, 64, 1, true), new T.MeshStandardMaterial({ color: 0x1a1f2b, metalness: 0.6, roughness: 0.5, side: T.BackSide, transparent: true, opacity: 0.55 }));
    chamber.add(shell);
    [-2.2, 2.2].forEach((y) => { const r = new T.Mesh(new T.TorusGeometry(2.2, 0.06, 12, 96), metal); r.rotation.x = Math.PI / 2; r.position.y = y; chamber.add(r); });
    const grid = new T.GridHelper(4.4, 22, 0x2a3142, 0x1b2130); grid.position.y = -2.2; chamber.add(grid);
    const win = new T.Mesh(new T.RingGeometry(0.75, 0.9, 48), metal); win.position.set(0, 0.2, -2.18); chamber.add(win);
    const needleGeo = new T.CylinderGeometry(0.018, 0.03, 1.8, 12);
    const n1 = new T.Mesh(needleGeo, metal); n1.rotation.z = Math.PI / 2.6; n1.position.set(-0.95, -0.35, 0); chamber.add(n1);
    const n2 = new T.Mesh(needleGeo, metal); n2.rotation.z = -Math.PI / 2.6; n2.position.set(0.95, -0.35, 0); chamber.add(n2);
    const igniter = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 1.4, 8), dark); igniter.position.set(0.2, 0.9, 0.6); igniter.rotation.x = 0.6; chamber.add(igniter);
    const drop = new T.Mesh(new T.SphereGeometry(0.16, 32, 24), new T.MeshStandardMaterial({ color: 0x9fb6d8, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.85 }));
    scene.add(drop);

    const flameMats = [], flames = [];
    [[1.0, 0.0], [0.72, 1.0]].forEach(([sc, layer]) => {
      const m = new T.ShaderMaterial({ uniforms: { uG: { value: 0 }, uT: { value: 0 }, uR: { value: 1 }, uCam: { value: new T.Vector3() }, uSoot: { value: 0.3 }, uGlow: { value: 1 }, uLayer: { value: layer } },
        vertexShader: FVS, fragmentShader: FFS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      const f = new T.Mesh(new T.SphereGeometry(1, 72, 56), m);
      f.userData.k = sc; scene.add(f); flames.push(f); flameMats.push(m);
    });
    const st = { o2: 0.21, p: 1, fuel: "Methanol", co2: 0, he: 0, g: 0, pOut: 0.5, show: true };
    const run = { t: 0, dur: 9, out: false, outAt: 1, n: 0, status: "" };
    let onRun = null;
    function newRun() {
      run.t = 0; run.n++;
      run.out = Math.random() < st.pOut;
      run.outAt = 0.25 + Math.random() * 0.5;
      run.status = run.out ? "went out on its own" : "burned until the fuel was gone";
      if (onRun) onRun(run);
    }
    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    addEventListener("resize", resize); resize();
    let running = true, visible = true, last = performance.now();
    newRun();
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      run.t += dt / run.dur;
      if (run.t >= 1.04 || (run.out && run.t > run.outAt + 0.2)) newRun();
      const burn = Math.min(1, run.t);
      const dFrac = Math.sqrt(Math.max(0, 1 - burn));
      let k = run.t < 1 ? 1 : Math.max(0, 1 - (run.t - 1) * 8);
      if (run.out && run.t > run.outAt) k = Math.max(0, 1 - (run.t - run.outAt) * 6);
      const dil = 1 - 0.9 * st.co2 - 0.7 * st.he;
      const R = Math.max(0.15, (0.32 + 2.3 * (st.o2 - 0.12)) * Math.pow(1 / st.p, 0.25) * (0.55 + 0.45 * dFrac) * Math.max(0.35, dil));
      const soot = Math.min(1, (st.fuel === "Heptane" ? 0.85 : 0.18) * (0.5 + 2.4 * (st.o2 - 0.12)) * (0.6 + 0.4 * st.g) * Math.max(0.2, dil));
      const tt = now / 1000, glow = k * (0.35 + 0.65 * Math.min(1, st.o2 / 0.3)) * Math.max(0.3, dil);
      flames.forEach((f, idx) => {
        const u = flameMats[idx].uniforms;
        u.uG.value += (st.g - u.uG.value) * Math.min(1, dt * 3);
        u.uT.value = tt; u.uR.value = R * f.userData.k; u.uSoot.value = soot; u.uGlow.value = glow * (idx ? 0.9 : 1); u.uCam.value.copy(camera.position);
      });
      drop.scale.setScalar(Math.max(0.05, dFrac));
      drop.visible = dFrac > 0.05;
      key.intensity = 2.6 * k * (0.3 + soot);
      controls.update();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(host);
    return {
      set(s) { Object.assign(st, s); },
      replay() { newRun(); },
      onRun(fn) { onRun = fn; fn(run); },
      pause() { running = false; },
      resume() { if (!running) { running = true; last = performance.now(); resize(); requestAnimationFrame(frame); } },
      resize,
    };
  }
  window.PhoenixLab3D = { init };
})();
