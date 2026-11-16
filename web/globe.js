(function () {
  "use strict";
  const DEG = Math.PI / 180;
  const RE = 6371;

  function gmst(date) {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const t = (jd - 2451545.0) / 36525;
    let g = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t - (t * t * t) / 38710000;
    g = ((g % 360) + 360) % 360;
    return g * DEG;
  }
  function sunEci(date) {
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.46 + 0.9856474 * n) * DEG;
    const g = (357.528 + 0.9856003 * n) * DEG;
    const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
    const eps = (23.439 - 0.0000004 * n) * DEG;
    return [Math.cos(lam), Math.cos(eps) * Math.sin(lam), Math.sin(eps) * Math.sin(lam)];
  }
  const toScene = (T, v) => new T.Vector3(v[0], v[2], -v[1]);

  function parseTle(txt, name) {
    const L = txt.split(/\r?\n/).map((s) => s.trim());
    for (let i = 0; i < L.length - 2; i++) if (L[i].toUpperCase().startsWith(name)) return [L[i + 1], L[i + 2]];
    return null;
  }

  const EARTH_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vP; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const EARTH_FS = `uniform sampler2D day; uniform sampler2D night; uniform vec3 sun; uniform vec3 cam; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main(){ vec3 n = normalize(vN); vec3 l = normalize(sun); float d = dot(n, l); float k = smoothstep(-0.18, 0.22, d);
      vec3 tex = texture2D(day, vUv).rgb; vec3 dc = tex * (0.35 + 1.15 * max(d, 0.0));
      float ocean = smoothstep(0.02, 0.12, tex.b - max(tex.r, tex.g));
      vec3 v = normalize(cam - vP); float sp = pow(max(dot(reflect(-l, n), v), 0.0), 24.0) * ocean * step(0.0, d);
      dc += vec3(1.0, 0.86, 0.62) * sp * 0.55;
      vec3 nc = texture2D(night, vUv).rgb * vec3(1.25, 1.05, 0.8);
      vec3 c = mix(nc, dc, k); float tw = smoothstep(0.0, 0.18, d) * (1.0 - smoothstep(0.18, 0.5, d)); c += vec3(0.35, 0.12, 0.02) * tw * 0.35;
      gl_FragColor = vec4(c, 1.0); }`;
  const ATM_VS = `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const ATM_FS = `uniform vec3 sun; uniform vec3 cam; uniform vec3 tint; varying vec3 vN; varying vec3 vP;
    void main(){ vec3 v = normalize(cam - vP); float f = pow(1.0 - abs(dot(v, vN)), 2.6); float lit = 0.35 + 0.65 * smoothstep(-0.3, 0.4, dot(vN, normalize(sun)));
      gl_FragColor = vec4(tint * f * lit, f * lit); }`;

  function init(host, opts) {
    const T = window.THREE;
    if (!T || !host) return null;
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) {
      host.classList.add("globe--fallback");
      return null;
    }
    const base = opts.base || "assets/3d/";
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    host.appendChild(renderer.domElement);
    const labels = document.createElement("div");
    labels.className = "globe__labels";
    host.appendChild(labels);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.01, 200);
    const loader = new T.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
    const tex = (f) => {
      const t = loader.load(base + f);
      t.encoding = T.sRGBEncoding;
      t.anisotropy = maxAniso;
      return t;
    };

    // NASA star map as a dim Milky Way glow, plus its bright stars drawn as crisp points (scripts/build_stars.py).
    const stars = new T.Group();
    stars.add(
      new T.Mesh(
        new T.SphereGeometry(90, 64, 32),
        new T.MeshBasicMaterial({ map: tex("starmap_4k.jpg"), side: T.BackSide, depthWrite: false, color: 0x8a8f99 }),
      ),
    );
    scene.add(stars);
    fetch(base + "stars.json")
      .then((r) => r.json())
      .then((S) => {
        const n = S.b.length,
          pos = new Float32Array(3 * n),
          col = new Float32Array(3 * n),
          size = new Float32Array(n),
          tw = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < 3; k++) {
            pos[3 * i + k] = S.xyz[3 * i + k] * 88;
            col[3 * i + k] = 0.55 + 0.45 * S.c[3 * i + k];
          }
          size[i] = 0.9 + 3.4 * Math.pow(S.b[i], 0.7);
          tw[i] = Math.random() * 6.283;
        }
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.BufferAttribute(pos, 3));
        g.setAttribute("color", new T.BufferAttribute(col, 3));
        g.setAttribute("size", new T.BufferAttribute(size, 1));
        g.setAttribute("tw", new T.BufferAttribute(tw, 1));
        const m = new T.ShaderMaterial({
          uniforms: { t: { value: 0 }, pr: { value: renderer.getPixelRatio() } },
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
          vertexShader:
            "attribute float size; attribute float tw; attribute vec3 color; uniform float t; uniform float pr; varying vec3 vC; varying float vA;" +
            "void main(){ vC = color; vA = 0.78 + 0.22 * sin(t * 1.3 + tw); gl_PointSize = size * pr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader:
            "varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); a = a * a; gl_FragColor = vec4(vC * a * vA, a * vA); }",
        });
        const pts = new T.Points(g, m);
        pts.frustumCulled = false;
        stars.add(pts);
        stars.userData.mat = m;
      })
      .catch(() => {});

    const earthGroup = new T.Group();
    scene.add(earthGroup);
    const earthMat = new T.ShaderMaterial({
      uniforms: {
        day: { value: tex("earth_day_2k.jpg") },
        night: { value: tex("earth_night_2k.jpg") },
        sun: { value: new T.Vector3(1, 0, 0) },
        cam: { value: new T.Vector3() },
      },
      vertexShader: EARTH_VS,
      fragmentShader: EARTH_FS,
    });
    const earth = new T.Mesh(new T.SphereGeometry(1, 96, 64), earthMat);
    earth.userData.id = "earth";
    earthGroup.add(earth);
    const atm = (r, tint) =>
      new T.Mesh(
        new T.SphereGeometry(r, 64, 48),
        new T.ShaderMaterial({
          uniforms: { sun: { value: new T.Vector3(1, 0, 0) }, cam: { value: new T.Vector3() }, tint: { value: new T.Color(tint) } },
          vertexShader: ATM_VS,
          fragmentShader: ATM_FS,
          transparent: true,
          blending: T.AdditiveBlending,
          depthWrite: false,
          side: T.FrontSide,
        }),
      );
    const earthAtm = atm(1.035, 0x5aa9ff);
    scene.add(earthAtm);

    const sunLight = new T.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(-4, 3, 6);
    scene.add(sunLight);
    scene.add(new T.AmbientLight(0xffffff, 0.08));

    const bodies = {};
    function planet(id, file, r, pos, tint) {
      const mat = new T.MeshStandardMaterial({ map: tex(file), roughness: 1, metalness: 0 });
      if (id === "moon") {
        const bm = loader.load("assets/moon/ldem_3_8bit.jpg");
        bm.anisotropy = maxAniso;
        mat.bumpMap = bm;
        mat.bumpScale = 0.12;
        mat.map = tex("../moon/lroc_color_2k.jpg");
      }
      const m = new T.Mesh(new T.SphereGeometry(r, 96, 64), mat);
      m.position.copy(pos);
      m.userData.id = id;
      scene.add(m);
      const a = atm(r * 1.06, tint);
      a.position.copy(pos);
      scene.add(a);
      bodies[id] = { mesh: m, atm: a, r };
      return m;
    }
    planet("moon", "moon_lroc_1k.jpg", 0.3, new T.Vector3(1.0, 1.45, -0.6), 0x9aa4b2);
    planet("mars", "mars_viking_1k.jpg", 0.36, new T.Vector3(-1.3, -1.6, 0.7), 0xff8a50);
    bodies.earth = { mesh: earth, atm: earthAtm, r: 1 };

    const iss = new T.Group();
    const issDot = new T.Mesh(new T.SphereGeometry(0.018, 16, 12), new T.MeshBasicMaterial({ color: 0xfbbf24 }));
    issDot.userData.id = "iss";
    const glowTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(251,191,36,1)");
      gr.addColorStop(0.35, "rgba(242,96,15,.55)");
      gr.addColorStop(1, "rgba(242,96,15,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      const t = new T.CanvasTexture(c);
      return t;
    })();
    const issGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, depthWrite: false, blending: T.AdditiveBlending }));
    issGlow.scale.set(0.16, 0.16, 1);
    const issHit = new T.Mesh(new T.SphereGeometry(0.07, 8, 8), new T.MeshBasicMaterial({ visible: false }));
    issHit.userData.id = "iss";
    iss.add(issDot, issGlow, issHit);
    earthGroup.add(iss);
    let orbitLine = null,
      satrec = null;
    const others = [],
      fleet = [];
    const satTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(186,230,253,1)");
      gr.addColorStop(0.4, "rgba(56,189,248,.45)");
      gr.addColorStop(1, "rgba(56,189,248,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return new T.CanvasTexture(c);
    })();
    const tip = document.createElement("div");
    tip.className = "gsat is-hidden";
    host.appendChild(tip);

    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 14;
    controls.autoRotate = false;
    controls.rotateSpeed = 0.6;
    camera.position.set(0.6, 1.6, 7.6);
    controls.target.set(0, 0, 0);

    let fly = null;
    function flyTo(target, dist) {
      const from = { p: camera.position.clone(), t: controls.target.clone() };
      const dir = camera.position.clone().sub(controls.target).normalize();
      const to = { t: target.clone(), p: target.clone().add(dir.multiplyScalar(dist)) };
      fly = { from, to, t0: performance.now(), dur: reduce ? 1 : 1400 };
    }

    function setSat(text) {
      const S = window.satellite;
      if (!S) return;
      const tle = parseTle(text, "ISS");
      if (!tle) return;
      satrec = S.twoline2satrec(tle[0], tle[1]);
      const now = new Date(),
        pts = [];
      const period = (2 * Math.PI) / satrec.no;
      for (let i = 0; i <= 240; i++) {
        const t = new Date(now.getTime() + ((i / 240) * period - period / 2) * 60000);
        const pv = S.propagate(satrec, t);
        if (pv && pv.position) pts.push(toScene(T, [pv.position.x / RE, pv.position.y / RE, pv.position.z / RE]));
      }
      if (orbitLine) earthGroup.remove(orbitLine);
      orbitLine = new T.Line(
        new T.BufferGeometry().setFromPoints(pts),
        new T.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 }),
      );
      earthGroup.add(orbitLine);
      others.forEach((o) => earthGroup.remove(o));
      others.length = 0;
      fleet.length = 0;
      const L = text.split(/\r?\n/).map((x) => x.trim());
      for (let k = 0; k + 2 < L.length; k++) {
        if (!L[k + 1].startsWith("1 ") || !L[k + 2].startsWith("2 ") || L[k].startsWith("1 ") || L[k].startsWith("2 ")) continue;
        const name = L[k];
        if (/^ISS/i.test(name)) continue;
        let sr;
        try {
          sr = S.twoline2satrec(L[k + 1], L[k + 2]);
        } catch (e) {
          continue;
        }
        const per = (2 * Math.PI) / sr.no,
          p2 = [];
        for (let m = 0; m <= 140; m++) {
          const tt = new Date(now.getTime() + ((m / 140) * per - per / 2) * 60000);
          const pv = S.propagate(sr, tt);
          if (pv && pv.position) p2.push(toScene(T, [pv.position.x / RE, pv.position.y / RE, pv.position.z / RE]));
        }
        if (p2.length < 10) continue;
        const l = new T.Line(
          new T.BufferGeometry().setFromPoints(p2),
          new T.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.1 }),
        );
        const g = new T.Group();
        const dot = new T.Mesh(new T.SphereGeometry(0.011, 10, 8), new T.MeshBasicMaterial({ color: 0x7dd3fc }));
        const glow = new T.Sprite(new T.SpriteMaterial({ map: satTex, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8 }));
        glow.scale.set(0.07, 0.07, 1);
        const hit = new T.Mesh(new T.SphereGeometry(0.05, 6, 6), new T.MeshBasicMaterial({ visible: false }));
        hit.userData.sat = name.replace(/\s*\(.*\)$/, "");
        g.add(dot, glow, hit);
        earthGroup.add(l, g);
        others.push(l, g);
        fleet.push({ sr, g, hit });
      }
    }
    fetch(base + "tle_today.txt")
      .then((r) => r.text())
      .then(setSat)
      .catch(() => {});

    const label = {};
    (opts.bodies || []).forEach((b) => {
      const el = document.createElement("div");
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.className = "glabel";
      el.dataset.id = b.id;
      el.innerHTML = `<span class="glabel__dot"></span><span><b>${b.label}</b><small>${b.sub || ""}</small><span class="glabel__more"></span></span>`;
      el.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        if (selected === b.id) reset();
        else select(b.id);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          el.click();
        }
      });
      labels.appendChild(el);
      label[b.id] = el;
    });

    const anchor = (id) => {
      if (id === "iss") return iss.getWorldPosition(new T.Vector3());
      return bodies[id] ? bodies[id].mesh.position.clone() : new T.Vector3();
    };
    let selected = null;
    function select(id, quiet) {
      selected = id;
      Object.entries(label).forEach(([k, el]) => {
        el.classList.toggle("is-on", k === id);
        const more = el.querySelector(".glabel__more");
        if (more) more.innerHTML = k === id && opts.detail ? opts.detail(k) : "";
      });
      const r = id === "iss" ? 0.25 : bodies[id] ? bodies[id].r : 1;
      flyTo(anchor(id), id === "earth" ? 4.2 : Math.max(1.4, r * 6.5));
      if (!quiet && opts.onSelect) opts.onSelect(id);
    }
    function reset() {
      selected = null;
      Object.values(label).forEach((el) => {
        el.classList.remove("is-on");
        const m = el.querySelector(".glabel__more");
        if (m) m.innerHTML = "";
      });
      fly = {
        from: { p: camera.position.clone(), t: controls.target.clone() },
        to: { p: new T.Vector3(0.6, 1.6, 7.6), t: new T.Vector3() },
        t0: performance.now(),
        dur: reduce ? 1 : 1400,
      };
    }

    const ray = new T.Raycaster(),
      mouse = new T.Vector2();
    let downAt = null;
    renderer.domElement.addEventListener("pointerdown", (e) => {
      downAt = [e.clientX, e.clientY];
    });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects([issHit, bodies.moon.mesh, bodies.mars.mesh, earth], false)[0];
      if (hit && hit.object.userData.id) select(hit.object.userData.id);
      else if (selected) reset();
    });
    renderer.domElement.addEventListener("pointermove", (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      renderer.domElement.style.cursor = ray.intersectObjects([issHit, bodies.moon.mesh, bodies.mars.mesh, earth], false).length
        ? "pointer"
        : "grab";
      const sh = fleet.length
        ? ray.intersectObjects(
            fleet.map((f) => f.hit),
            false,
          )[0]
        : null;
      if (sh) {
        tip.innerHTML = `<b>${sh.object.userData.sat}</b> <span>NASA satellite</span>`;
        tip.style.transform = `translate(${(e.clientX - r.left + 14).toFixed(0)}px, ${(e.clientY - r.top - 10).toFixed(0)}px)`;
        tip.classList.remove("is-hidden");
      } else tip.classList.add("is-hidden");
    });

    function resize() {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w / h < 0.9 ? 52 : 36;
      if (w > 1000) camera.setViewOffset(w, h, -Math.round(w * 0.14), 0, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);

    function occluded(p) {
      const o = camera.position,
        d = p.clone().sub(o),
        L = d.length();
      d.divideScalar(L);
      const b = o.dot(d),
        c = o.lengthSq() - 1,
        disc = b * b - c;
      if (disc < 0) return false;
      const t = -b - Math.sqrt(disc);
      return t > 0 && t < L - 0.01;
    }
    let yaw = null;
    let running = true,
      visible = true,
      last = 0,
      speed = reduce ? 1 : 600,
      simOff = 0,
      lastT = performance.now();
    const clock = document.createElement("div");
    clock.className = "gclock";
    clock.innerHTML = `<span class="gclock__t"></span><span class="gclock__f"></span>`;
    host.appendChild(clock);
    const clockT = clock.querySelector(".gclock__t"),
      clockF = clock.querySelector(".gclock__f");
    const tmp = new T.Vector3(),
      camRight = new T.Vector3();
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (!visible || now - last < 16) {
        lastT = now;
        return;
      }
      simOff += (now - lastT) * (speed - 1);
      lastT = now;
      last = now;
      const date = new Date(Date.now() + simOff);
      if (Math.floor(now / 500) !== Math.floor((now - 17) / 500))
        clockT.textContent = `${date.toISOString().slice(0, 16).replace("T", " ")} UTC${speed === 1 ? " · live" : ` · time ×${speed}`}`;
      earth.rotation.y = gmst(date);
      earthGroup.updateMatrixWorld();
      if (yaw == null) {
        const s0 = toScene(T, sunEci(date));
        yaw = Math.atan2(-0.55, 1) - Math.atan2(s0.x, s0.z);
        earthGroup.rotation.y = yaw;
      }
      const s = toScene(T, sunEci(date))
        .normalize()
        .applyAxisAngle(new T.Vector3(0, 1, 0), yaw);
      earthMat.uniforms.sun.value.copy(s);
      earthMat.uniforms.cam.value.copy(camera.position);
      [earthAtm, bodies.moon.atm, bodies.mars.atm].forEach((a) => {
        a.material.uniforms.sun.value.copy(s);
        a.material.uniforms.cam.value.copy(camera.position);
      });
      bodies.moon.mesh.rotation.y += reduce ? 0 : 0.0006;
      bodies.mars.mesh.rotation.y += reduce ? 0 : 0.0012;
      if (satrec && window.satellite) {
        const pv = window.satellite.propagate(satrec, date);
        if (pv && pv.position) iss.position.copy(toScene(T, [pv.position.x / RE, pv.position.y / RE, pv.position.z / RE]));
        issGlow.material.opacity = 0.75 + 0.25 * Math.sin(now / 300);
      }
      if (fleet.length && window.satellite) {
        for (const f of fleet) {
          const pv = window.satellite.propagate(f.sr, date);
          if (pv && pv.position) f.g.position.copy(toScene(T, [pv.position.x / RE, pv.position.y / RE, pv.position.z / RE]));
        }
        if (!clockF.textContent) clockF.textContent = `ISS + ${fleet.length} NASA satellites`;
      }
      if (fly) {
        const k = Math.min(1, (now - fly.t0) / fly.dur),
          e = 1 - Math.pow(1 - k, 3);
        camera.position.lerpVectors(fly.from.p, fly.to.p, e);
        controls.target.lerpVectors(fly.from.t, fly.to.t, e);
        if (k >= 1) fly = null;
      } else if (selected) {
        const a = anchor(selected);
        tmp.copy(a).sub(controls.target);
        controls.target.add(tmp);
        camera.position.add(tmp);
      }
      controls.update();
      if (stars.userData.mat) stars.userData.mat.uniforms.t.value = now / 1000;
      renderer.render(scene, camera);
      const W = host.clientWidth,
        H = host.clientHeight;
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      Object.entries(label).forEach(([id, el]) => {
        const p = anchor(id);
        const off = id === "iss" ? 0.06 : bodies[id] ? bodies[id].r * 1.12 : 0;
        p.add(camRight.clone().multiplyScalar(off));
        const behind = id === "iss" && occluded(p);
        p.project(camera);
        const x = (p.x * 0.5 + 0.5) * W,
          y = (-p.y * 0.5 + 0.5) * H;
        const out = p.z > 1 || x < -40 || x > W + 40 || y < -40 || y > H + 40;
        const lw = el.offsetWidth || 0,
          lh = el.offsetHeight || 0;
        const cx = Math.max(4, Math.min(x, W - lw - 12)),
          cy = Math.max(20, Math.min(y, H - lh - 4));
        el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
        el.classList.toggle("is-hidden", out || behind);
      });
    }
    requestAnimationFrame(frame);
    if ("IntersectionObserver" in window)
      new IntersectionObserver((es) => {
        visible = es[0].isIntersecting;
      }).observe(host);

    return {
      select,
      reset,
      pause() {
        running = false;
      },
      resume() {
        resize();
        if (!running) {
          running = true;
          lastT = performance.now();
          resize();
          requestAnimationFrame(frame);
        }
      },
      resize,
    };
  }
  window.PhoenixGlobe = { init };
})();
