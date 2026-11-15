(function () {
  "use strict";
  const pick = () => {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q === "es" || q === "en") { localStorage.setItem("lang", q); return q; }
      const s = localStorage.getItem("lang");
      if (s === "es" || s === "en") return s;
    } catch (e) {}
    return (navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en";
  };
  const LANG = pick();
  const DICT = (window.I18N_ES && window.I18N_ES.t) || {};
  const NAMES = (window.I18N_ES && window.I18N_ES.names) || {};
  const NUM = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const NAME_RE = Object.keys(NAMES).length ? new RegExp(Object.keys(NAMES).sort((a, b) => b.length - a.length).map(escRe).join("|"), "g") : null;

  function tr(s) {
    if (LANG !== "es" || typeof s !== "string" || !/[A-Za-z]{2}/.test(s)) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    const core = s.trim().replace(/\s+/g, " ");
    const names = [], nums = [];
    let k = NAME_RE ? core.replace(NAME_RE, (m) => { names.push(m); return "⟨H⟩"; }) : core;
    k = k.replace(NUM, (m) => { nums.push(m); return "#"; });
    const v = DICT[k];
    if (v == null) return s;
    const out = v.replace(/⟨H⟩/g, () => NAMES[names.shift()] || "").replace(/#/g, () => (nums.length ? nums.shift() : "#"));
    return lead + out + trail;
  }
  function deep(o) {
    if (LANG !== "es") return o;
    if (typeof o === "string") return tr(o);
    if (Array.isArray(o)) return o.map(deep);
    if (o && typeof o === "object" && o.constructor === Object) { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = k === "colorscale" ? v : deep(v); return r; }
    return o;
  }
  const SKIP = "script, style, svg, textarea, [data-no-i18n]";
  const ATTRS = ["placeholder", "aria-label", "title"];
  function textNode(n) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP)) return;
    const v = n.nodeValue, t = tr(v);
    if (t !== v) n.nodeValue = t;
  }
  function el(e) {
    if (e.closest && e.closest(SKIP)) return;
    ATTRS.forEach((a) => { const v = e.getAttribute && e.getAttribute(a); if (v) { const t = tr(v); if (t !== v) e.setAttribute(a, t); } });
  }
  function walk(root) {
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    el(root);
    root.querySelectorAll("[placeholder],[aria-label],[title]").forEach(el);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) textNode(n);
  }
  function start() {
    document.documentElement.lang = LANG;
    const b = document.getElementById("lang");
    if (b) {
      b.textContent = LANG === "es" ? "EN" : "ES";
      b.setAttribute("aria-label", LANG === "es" ? "View in English" : "Ver en español");
      b.addEventListener("click", () => {
        try { localStorage.setItem("lang", LANG === "es" ? "en" : "es"); } catch (e) {}
        const u = new URL(location.href); u.searchParams.delete("lang");
        if (LANG !== "es") u.searchParams.set("lang", "es"); else u.searchParams.set("lang", "en");
        location.replace(u.toString());
      });
    }
    if (LANG !== "es") return;
    document.title = "Skylab Phoenix · Inteligencia para la seguridad contra incendios";
    walk(document.body);
    const brief = document.getElementById("briefing");
    if (brief && !document.getElementById("si-lang-note")) {
      const p = document.createElement("p");
      p.className = "note"; p.id = "si-lang-note"; p.setAttribute("data-no-i18n", "");
      p.textContent = "Traducción del resumen verificado en inglés: el firewall comprueba el original contra la evidencia, y cada número de esta versión se copia automáticamente de ese original, así que no puede cambiar al traducir. Los textos citados de NASA PSI aparecen como traducción.";
      brief.after(p);
    }
    new MutationObserver((ms) => ms.forEach((m) => {
      if (m.type === "characterData") textNode(m.target);
      else if (m.type === "attributes") el(m.target);
      else m.addedNodes.forEach(walk);
    })).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  window.I18N = { lang: LANG, t: tr, deep, start };
})();
