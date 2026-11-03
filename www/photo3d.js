/* 机台本 — 照片建型
   一张正面照片 → 自动抠出设备轮廓 → 沿深度挤出 → 正面贴照片纹理。
   不依赖任何服务：抠图是背景色差 + 逐行最长连通段，轮廓做中值平滑和抽稀，
   多边形用 ear clipping 三角化。 */

(function (global) {
  "use strict";

  /* ---------- 基础 ---------- */

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = src;
    });
  }

  function polyArea(v) {
    var s = 0;
    for (var i = 0; i < v.length; i++) {
      var a = v[i], b = v[(i + 1) % v.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }

  /* ---------- 抠形：逐行最长连通段 ---------- */

  function extract(img, tol, maxW) {
    maxW = maxW || 560;
    var W = Math.min(maxW, img.naturalWidth || img.width);
    var scale = W / (img.naturalWidth || img.width);
    var H = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);
    var px = ctx.getImageData(0, 0, W, H).data;

    /* 背景色：四角 10×10 的中位色 */
    var samples = [[], [], []];
    function grab(x0, y0) {
      for (var y = y0; y < y0 + 10; y++) {
        for (var x = x0; x < x0 + 10; x++) {
          var i = (y * W + x) * 4;
          samples[0].push(px[i]); samples[1].push(px[i + 1]); samples[2].push(px[i + 2]);
        }
      }
    }
    grab(0, 0); grab(W - 10, 0); grab(0, H - 10); grab(W - 10, H - 10);
    var bg = samples.map(function (a) {
      a.sort(function (x, y) { return x - y; });
      return a[Math.floor(a.length / 2)];
    });

    var lo = [], hi = [];
    for (var y = 0; y < H; y++) {
      var bestA = -1, bestB = -1, runA = -1;
      for (var x = 0; x < W; x++) {
        var i2 = (y * W + x) * 4;
        var d = Math.abs(px[i2] - bg[0]) + Math.abs(px[i2 + 1] - bg[1]) + Math.abs(px[i2 + 2] - bg[2]);
        if (d > tol) {
          if (runA < 0) runA = x;
        } else if (runA >= 0) {
          if (x - runA > bestB - bestA) { bestA = runA; bestB = x; }
          runA = -1;
        }
      }
      if (runA >= 0 && W - runA > bestB - bestA) { bestA = runA; bestB = W; }
      if (bestA < 0 || bestB - bestA < 6) { lo.push(-1); hi.push(-1); }
      else { lo.push(bestA); hi.push(bestB); }
    }

    /* 去掉首尾空行，做 5 点中值平滑 */
    var top = 0, bot = H - 1;
    while (top < H && lo[top] < 0) top++;
    while (bot > top && lo[bot] < 0) bot--;
    if (bot - top < 8) return null;

    function smooth(arr, i) {
      var v = [];
      for (var k = -2; k <= 2; k++) {
        var j = i + k;
        if (j >= top && j <= bot && arr[j] >= 0) v.push(arr[j]);
      }
      if (!v.length) return arr[i];
      v.sort(function (a, b) { return a - b; });
      return v[Math.floor(v.length / 2)];
    }

    var pts = [];
    var step = Math.max(2, Math.round((bot - top) / 90));
    var i3;
    for (i3 = top; i3 <= bot; i3 += step) {
      if (lo[i3] < 0) continue;
      pts.push([smooth(lo, i3) / W, i3 / H]);
    }
    for (i3 = bot; i3 >= top; i3 -= step) {
      if (hi[i3] < 0) continue;
      pts.push([smooth(hi, i3) / W, i3 / H]);
    }

    /* 前景平均色：拿去当挤出侧面的颜色，别让侧面白得像纸板 */
    var ar = 0, ag = 0, ab = 0, an = 0;
    for (var yy = top; yy <= bot; yy += 3) {
      if (lo[yy] < 0) continue;
      for (var xx = lo[yy]; xx < hi[yy]; xx += 3) {
        var k = (yy * W + xx) * 4;
        ar += px[k]; ag += px[k + 1]; ab += px[k + 2]; an++;
      }
    }
    var avg = an ? [ar / an, ag / an, ab / an] : [120, 128, 140];

    /* 抽稀：相邻点距离过近就丢掉 */
    var out = [];
    for (i3 = 0; i3 < pts.length; i3++) {
      var p = pts[i3];
      if (!out.length) { out.push(p); continue; }
      var q = out[out.length - 1];
      if (Math.abs(p[0] - q[0]) * W + Math.abs(p[1] - q[1]) * H > 2.5) out.push(p);
    }
    if (out.length < 6) return null;
    return { pts: out, w: W, h: H, bg: bg, avg: avg };
  }

  /* 兜底：用户框的矩形 */
  function rectPoly(q) {
    return [[q[0], q[1]], [q[0] + q[2], q[1]], [q[0] + q[2], q[1] + q[3]], [q[0], q[1] + q[3]]];
  }

  /* ---------- 三角化 ---------- */

  function tri(v) {
    var n = v.length, idx = [], i;
    for (i = 0; i < n; i++) idx.push(i);
    if (polyArea(v) < 0) idx.reverse();

    function cross(o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }
    function inTri(p, a, b, c) {
      var d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
      var neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      return !(neg && pos);
    }

    var out = [], guard = 0;
    while (idx.length > 3 && guard++ < n * n) {
      var ok = false;
      for (i = 0; i < idx.length; i++) {
        var a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
        if (cross(v[a], v[b], v[c]) <= 0) continue;
        var inside = false;
        for (var j = 0; j < idx.length; j++) {
          var k = idx[j];
          if (k === a || k === b || k === c) continue;
          if (inTri(v[k], v[a], v[b], v[c])) { inside = true; break; }
        }
        if (inside) continue;
        out.push([a, b, c]);
        idx.splice(i, 1);
        ok = true;
        break;
      }
      if (!ok) break;
    }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
    return out;
  }

  /* ---------- 挤出成网格 ---------- */

  function build(photo) {
    var pts = photo.poly && photo.poly.length >= 3 ? photo.poly : rectPoly([0.05, 0.05, 0.9, 0.9]);
    var imgW = photo.w || 1, imgH = photo.h || 1;

    /* 归一化到模型空间：最长边 220；底边落在 y=0，模型站在地面上 */
    var sc = 220 / Math.max(1, Math.max(imgW, imgH));
    var w = imgW * sc, h = imgH * sc;
    var v2 = pts.map(function (p) {
      return [(p[0] - 0.5) * w, (0.5 - p[1]) * h + h / 2];
    });

    /* 按轮廓实际范围取景，别用整张照片的边界 */
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    v2.forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var spanW = maxX - minX, spanH = maxY - minY;

    var d = Math.max(6, (photo.depth || 0.22) * w);

    var front = { pos: [], nrm: [], uv: [], idx: [] };
    var shell = { pos: [], nrm: [], uv: [], idx: [] };
    var i, n = v2.length;

    /* 正面（z = +d/2）贴照片 —— 只有这一面有纹理坐标 */
    for (i = 0; i < n; i++) {
      front.pos.push(v2[i][0], v2[i][1], d / 2);
      front.nrm.push(0, 0, 1);
      front.uv.push(pts[i][0], 1 - pts[i][1]);
    }
    var faces = tri(v2);
    faces.forEach(function (f) { front.idx.push(f[0], f[1], f[2]); });

    /* 背面（z = -d/2），纯色 */
    var base = 0;
    for (i = 0; i < n; i++) {
      shell.pos.push(v2[i][0], v2[i][1], -d / 2);
      shell.nrm.push(0, 0, -1);
      shell.uv.push(0, 0);
    }
    faces.forEach(function (f) { shell.idx.push(base + f[2], base + f[1], base + f[0]); });

    /* 侧面 */
    for (i = 0; i < n; i++) {
      var a = v2[i], b = v2[(i + 1) % n];
      var ex = b[0] - a[0], ey = b[1] - a[1];
      var nx = ey, ny = -ex;
      var len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      base = shell.pos.length / 3;
      shell.pos.push(a[0], a[1], d / 2, b[0], b[1], d / 2, b[0], b[1], -d / 2, a[0], a[1], -d / 2);
      for (var q = 0; q < 4; q++) { shell.nrm.push(nx, ny, 0); shell.uv.push(0, 0); }
      shell.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    function pack(o) {
      return {
        pos: new Float32Array(o.pos),
        nrm: new Float32Array(o.nrm),
        uv: new Float32Array(o.uv),
        idx: new Uint16Array(o.idx),
        bbox: [minX, minY, -d / 2, maxX, maxY, d / 2]
      };
    }

    return {
      front: pack(front),
      sides: pack(shell),
      size: [spanW, spanH, d],
      center: [cx, cy, 0]
    };
  }

  /* 由照片数据生成给 GLView 的模型 */
  function model(photo) {
    var m = build(photo);
    var span = Math.max(m.size[0], m.size[1]);
    var c = photo.avg || [120, 128, 140];
    var hexc = "#" + [0, 1, 2].map(function (i) {
      var v = Math.max(0, Math.min(255, Math.round(c[i] * 1.1)));
      return (v < 16 ? "0" : "") + v.toString(16);
    }).join("");
    return {
      cam: {
        yaw: -0.42, pitch: 0.20,
        dist: span * 1.55,
        fov: 0.8,
        target: m.center
      },
      colors: { photo: "#ffffff", photoSide: hexc },
      emissive: {},
      tex: photo.src,
      parts: [
        { k: "photo", geo: m.front, a: m.center },
        { k: "photoSide", geo: m.sides, a: [m.center[0], m.center[1] - m.size[1] / 2, 0] }
      ]
    };
  }

  global.Photo3D = {
    loadImage: loadImage,
    extract: extract,
    build: build,
    model: model,
    rectPoly: rectPoly
  };
})(window);
