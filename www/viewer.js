/* 机台本 — 极简 3D 查看器
   没有依赖：模型是盒子/圆柱，自己算投影、按深度排序、平面着色，画到 Canvas 2D。
   支持：单指旋转、双指/滚轮缩放、点选部件。离线可用，file:// 也能跑。 */

(function (global) {
  "use strict";

  /* ---------- 向量 ---------- */

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) {
    var l = Math.sqrt(dot(a, a)) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  /* ---------- 几何 ---------- */

  function box(faces, key, cx, cy, cz, w, h, d) {
    var x0 = cx - w / 2, x1 = cx + w / 2;
    var y0 = cy - h / 2, y1 = cy + h / 2;
    var z0 = cz - d / 2, z1 = cz + d / 2;
    var v = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]
    ];
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [1, 2, 6, 5], [0, 4, 7, 3]]
      .forEach(function (q) { faces.push({ k: key, v: q.map(function (i) { return v[i]; }) }); });
  }

  function cyl(faces, key, cx, cy, cz, r, len, axis, seg) {
    seg = seg || 14;
    var i, a0, a1;
    var p = function (t, o) {
      if (axis === "x") return [cx + o, cy + r * Math.cos(t), cz + r * Math.sin(t)];
      if (axis === "z") return [cx + r * Math.cos(t), cy + r * Math.sin(t), cz + o];
      return [cx + r * Math.cos(t), cy + o, cz + r * Math.sin(t)];
    };
    for (i = 0; i < seg; i++) {
      a0 = Math.PI * 2 * i / seg;
      a1 = Math.PI * 2 * (i + 1) / seg;
      faces.push({ k: key, v: [p(a0, -len / 2), p(a1, -len / 2), p(a1, len / 2), p(a0, len / 2)] });
    }
    for (var s = -1; s <= 1; s += 2) {
      var pts = [];
      for (i = 0; i < seg; i++) pts.push(p(Math.PI * 2 * i / seg, s * len / 2));
      faces.push({ k: key, v: pts });
    }
  }

  /* ---------- 模型编译 ---------- */

  function compile(model) {
    var faces = [], anchors = {};
    model.parts.forEach(function (p) {
      (p.b || []).forEach(function (b) { box(faces, p.k, b[0], b[1], b[2], b[3], b[4], b[5]); });
      (p.c || []).forEach(function (c) { cyl(faces, p.k, c[0], c[1], c[2], c[3], c[4], c[5], c[6]); });
      anchors[p.k] = p.a;
    });
    return { faces: faces, anchors: anchors, colors: model.colors || {}, cam: model.cam };
  }

  /* ---------- 颜色 ---------- */

  function hex(h) {
    h = h.replace("#", "");
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function shade(rgb, f) {
    return "rgb(" + Math.min(255, Math.round(rgb[0] * f)) + "," +
      Math.min(255, Math.round(rgb[1] * f)) + "," +
      Math.min(255, Math.round(rgb[2] * f)) + ")";
  }

  /* 视角空间的光：上方 + 相机这侧（z 变小是靠近相机） */
  var LIGHT = norm([-0.45, 0.72, -0.62]);

  /* ---------- 实例 ---------- */

  function mount(canvas, rawModel, opts) {
    opts = opts || {};
    var model = compile(rawModel);
    var rgbCache = {};
    Object.keys(model.colors).forEach(function (k) { rgbCache[k] = hex(model.colors[k]); });

    var cam = {
      yaw: model.cam.yaw,
      pitch: model.cam.pitch,
      dist: model.cam.dist,
      base: model.cam.dist,
      f: model.cam.f,
      target: model.cam.target || [0, 0, 0]
    };
    var labels = opts.labels !== false;
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1;
    var last = [];
    var drag = null;
    var pinch = null;
    var dirty = true;
    var alive = true;

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(2, global.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    }

    function project(x, y, z) {
      var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      var px = x - cam.target[0], py = y - cam.target[1], pz = z - cam.target[2];
      var x1 = px * cy - pz * sy;
      var z1 = px * sy + pz * cy;
      var y1 = py * cp - z1 * sp;
      var z2 = py * sp + z1 * cp + cam.dist;
      var k = cam.f / Math.max(1, z2);
      return [W / 2 + x1 * k, H / 2 - y1 * k, z2, x1, y1, z2];
    }

    function normalOf(v) {
      var a = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
      var b = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      return norm(cross(a, b));
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);

      var list = [];
      for (var i = 0; i < model.faces.length; i++) {
        var f = model.faces[i];
        var pts = [], zsum = 0, ok = true;
        for (var j = 0; j < f.v.length; j++) {
          var p = project(f.v[j][0], f.v[j][1], f.v[j][2]);
          if (p[2] < 40) { ok = false; break; }
          pts.push(p);
          zsum += p[2];
        }
        if (!ok) continue;

        /* 法线转到视角空间 */
        var n = normalOf(f.v);
        var nx = n[0] * cy - n[2] * sy;
        var nz = n[0] * sy + n[2] * cy;
        var ny = n[1] * cp - nz * sp;
        nz = n[1] * sp + nz * cp;
        var nv = [nx, ny, nz];

        /* 背面剔除：法线背离相机 */
        var cx0 = 0, cy0 = 0;
        for (j = 0; j < f.v.length; j++) { cx0 += f.v[j][0] - cam.target[0]; cy0 += f.v[j][1] - cam.target[1]; }
        var cz0 = 0;
        for (j = 0; j < f.v.length; j++) cz0 += f.v[j][2] - cam.target[2];
        if (dot(nv, [cx0 / f.v.length, cy0 / f.v.length, cz0 / f.v.length]) > 0) continue;

        list.push({ pts: pts, z: zsum / pts.length, n: nv, k: f.k });
      }

      list.sort(function (a, b) { return b.z - a.z; });

      for (i = 0; i < list.length; i++) {
        var it = list[i];
        var lam = Math.max(0, dot(it.n, LIGHT));
        var base = rgbCache[it.k] || [220, 220, 230];
        ctx.beginPath();
        ctx.moveTo(it.pts[0][0], it.pts[0][1]);
        for (j = 1; j < it.pts.length; j++) ctx.lineTo(it.pts[j][0], it.pts[j][1]);
        ctx.closePath();
        ctx.fillStyle = shade(base, 0.66 + 0.52 * lam);
        ctx.fill();
        ctx.strokeStyle = "rgba(20,22,25,0.5)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      /* 编号：贴边、互相让位，别叠在一起 */
      if (labels && opts.order) {
        ctx.font = "700 11px ui-monospace, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        var placed = [];
        opts.order.forEach(function (k, idx) {
          var a = model.anchors[k];
          if (!a) return;
          var p = project(a[0], a[1], a[2]);
          if (p[2] < 40) return;
          var lx = Math.max(15, Math.min(W - 15, p[0]));
          var ly = Math.max(15, Math.min(H - 15, p[1]));
          var guard = 0;
          while (placed.some(function (q) {
            return Math.abs(q[0] - lx) < 25 && Math.abs(q[1] - ly) < 25;
          }) && guard < 8) {
            ly = Math.min(H - 15, ly + 25);
            guard++;
          }
          placed.push([lx, ly]);
          ctx.beginPath();
          ctx.arc(lx, ly, 11, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.strokeStyle = "#141619";
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.fillStyle = "#141619";
          ctx.fillText(String(idx + 1), lx, ly + 0.5);
        });
      }

      last = list;
      dirty = false;
    }

    function loop() {
      if (!alive) return;
      if (dirty) draw();
      requestAnimationFrame(loop);
    }

    /* ---------- 交互 ---------- */

    function local(e) {
      var r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    function pick(x, y) {
      for (var i = last.length - 1; i >= 0; i--) {
        var pts = last[i].pts, inside = false;
        for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
          if (((pts[a][1] > y) !== (pts[b][1] > y)) &&
            (x < (pts[b][0] - pts[a][0]) * (y - pts[a][1]) / (pts[b][1] - pts[a][1]) + pts[a][0])) {
            inside = !inside;
          }
        }
        if (inside) return last[i].k;
      }
      return null;
    }

    function onDown(e) {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0, id: e.pointerId };
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.moved > 4) {
        cam.yaw += dx * 0.008;
        cam.pitch = Math.max(-0.15, Math.min(1.35, cam.pitch + dy * 0.006));
        dirty = true;
      }
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var quick = Date.now() - drag.t < 320 && drag.moved < 6;
      drag = null;
      if (quick && opts.onPick) {
        var p = local(e);
        var k = pick(p[0], p[1]);
        if (k) opts.onPick(k);
      }
    }

    function onWheel(e) {
      e.preventDefault();
      cam.dist = Math.max(cam.base * 0.42, Math.min(cam.base * 2.0, cam.dist * (1 + e.deltaY * 0.0016)));
      dirty = true;
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", function () { drag = null; });
    canvas.addEventListener("wheel", onWheel, { passive: false });

    var ro = global.ResizeObserver ? new ResizeObserver(function () { resize(); }) : null;
    if (ro) ro.observe(canvas);
    global.addEventListener("resize", resize);

    resize();
    requestAnimationFrame(loop);

    return {
      zoom: function (f) {
        cam.dist = Math.max(cam.base * 0.42, Math.min(cam.base * 2.0, cam.dist * f));
        dirty = true;
      },
      reset: function () {
        cam.yaw = model.cam.yaw;
        cam.pitch = model.cam.pitch;
        cam.dist = cam.base;
        dirty = true;
      },
      setLabels: function (v) { labels = v; dirty = true; },
      destroy: function () {
        alive = false;
        if (ro) ro.disconnect();
        global.removeEventListener("resize", resize);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("wheel", onWheel);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  global.Viewer = { mount: mount, box: box, cyl: cyl };
})(window);
