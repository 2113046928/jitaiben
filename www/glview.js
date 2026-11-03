/* 机台本 — WebGL 三维视图
   自己写的轻量渲染器：方向光 + 高光 + 边缘光 + 雾，暗场布光加地面网格。
   没有外部依赖，离线可用。拿不到 WebGL 时由 ui.js 退回 viewer.js 的 2D 渲染。 */

(function (global) {
  "use strict";

  /* ---------- 矩阵 ---------- */

  /* 列主序矩阵乘法：C = A·B */
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  }

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function lookAt(eye, center, up) {
    var z = norm(sub(eye, center));
    var x = norm(cross(up, z));
    var y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ]);
  }

  var IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  function translate(x, y, z) {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  }

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) {
    var l = Math.sqrt(dot(a, a)) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  /* ---------- 着色器 ---------- */

  var VS = [
    "attribute vec3 aPos; attribute vec3 aNorm; attribute vec2 aUV;",
    "uniform mat4 uMVP; uniform mat4 uMV; uniform mat4 uModel;",
    "varying vec3 vN; varying vec3 vP; varying vec2 vUV;",
    "void main(){",
    "  vec4 wp = uModel * vec4(aPos, 1.0);",
    "  vN = mat3(uMV) * mat3(uModel) * aNorm;",
    "  vec4 p = uMV * wp;",
    "  vP = p.xyz;",
    "  vUV = aUV;",
    "  gl_Position = uMVP * wp;",
    "}"
  ].join("\n");

  var FS = [
    "precision mediump float;",
    "varying vec3 vN; varying vec3 vP; varying vec2 vUV;",
    "uniform vec3 uColor; uniform vec3 uEmis; uniform float uSpec;",
    "uniform sampler2D uTex; uniform float uHasTex;",
    "void main(){",
    "  vec3 base = uColor;",
    "  if (uHasTex > 0.5) base = texture2D(uTex, vUV).rgb;",
    "  vec3 N = normalize(vN);",
    "  vec3 V = normalize(-vP);",
    "  vec3 L1 = normalize(vec3(-0.45, 0.88, 0.55));",
    "  vec3 L2 = normalize(vec3(0.65, 0.30, -0.55));",
    "  float d1 = max(dot(N, L1), 0.0);",
    "  float d2 = max(dot(N, L2), 0.0);",
    "  vec3 col = base * (0.30 + 0.82 * d1);",
    "  col += base * vec3(0.24, 0.36, 0.62) * d2 * 0.85;",
    "  vec3 H = normalize(L1 + V);",
    "  col += vec3(pow(max(dot(N,H),0.0), 52.0)) * uSpec;",
    "  float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);",
    "  col += vec3(0.22, 0.42, 0.78) * fres * 0.38;",
    "  col += uEmis;",
    "  float dist = length(vP);",
    "  col = mix(col, vec3(0.030, 0.048, 0.078), clamp((dist - 320.0) / 900.0, 0.0, 0.9));",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  /* 地面：网格 + 中心光晕 */
  var FVS = [
    "attribute vec3 aPos;",
    "uniform mat4 uMVP; uniform mat4 uMV;",
    "varying vec3 vW;",
    "void main(){ vW = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }"
  ].join("\n");

  var FFS = [
    "precision mediump float;",
    "varying vec3 vW;",
    "void main(){",
    "  vec2 p = vW.xz;",
    "  vec2 f = abs(fract(p / 30.0 - 0.5) - 0.5);",
    "  float line = 1.0 - smoothstep(0.0, 0.035, min(f.x, f.y));",
    "  vec2 f2 = abs(fract(p / 150.0 - 0.5) - 0.5);",
    "  float line2 = 1.0 - smoothstep(0.0, 0.012, min(f2.x, f2.y));",
    "  vec3 base = vec3(0.040, 0.062, 0.100);",
    "  vec3 g = mix(base, vec3(0.10, 0.22, 0.34), line * 0.55 + line2 * 0.45);",
    "  float glow = exp(-length(p) / 320.0) * 0.14;",
    "  g += vec3(0.10, 0.26, 0.42) * glow;",
    "  float d = length(p) / 900.0;",
    "  g = mix(g, vec3(0.030, 0.048, 0.078), clamp(d, 0.0, 0.92));",
    "  gl_FragColor = vec4(g, 1.0);",
    "}"
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || "shader");
    }
    return s;
  }

  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    return p;
  }

  /* ---------- 几何：把盒/柱展开成三角形 ---------- */

  function pushTri(out, a, b, c, n) {
    out.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (var i = 0; i < 3; i++) out.nrm.push(n[0], n[1], n[2]);
  }

  function hex2rgb(h) {
    h = String(h).replace("#", "");
    return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255,
      parseInt(h.substr(4, 2), 16) / 255];
  }

  function buildMesh(parts, colors, emissive) {
    var buckets = {};
    function bucket(k) {
      if (!buckets[k]) {
        buckets[k] = {
          pos: [], nrm: [], uv: [], idx: [], tex: false,
          color: hex2rgb(colors[k] || "#dfe3ec"),
          em: emissive[k] || [0, 0, 0],
          spec: 0.5
        };
      }
      return buckets[k];
    }

    parts.forEach(function (p) {
      var b = bucket(p.k);
      if (p.geo) {
        var g = p.geo;
        b.pos = Array.prototype.slice.call(g.pos);
        b.nrm = Array.prototype.slice.call(g.nrm);
        b.uv = Array.prototype.slice.call(g.uv || []);
        b.idx = Array.prototype.slice.call(g.idx || []);
        b.tex = !!(g.uv && g.uv.length);
        return;
      }
      (p.b || []).forEach(function (q) {
        var cx = q[0], cy = q[1], cz = q[2], w = q[3] / 2, h = q[4] / 2, d = q[5] / 2;
        var v = [
          [cx - w, cy - h, cz - d], [cx + w, cy - h, cz - d], [cx + w, cy - h, cz + d], [cx - w, cy - h, cz + d],
          [cx - w, cy + h, cz - d], [cx + w, cy + h, cz - d], [cx + w, cy + h, cz + d], [cx - w, cy + h, cz + d]
        ];
        var faces = [
          [[3, 2, 1, 0], [0, -1, 0]], [[4, 5, 6, 7], [0, 1, 0]],
          [[0, 1, 5, 4], [0, 0, -1]], [[2, 3, 7, 6], [0, 0, 1]],
          [[1, 2, 6, 5], [1, 0, 0]], [[3, 0, 4, 7], [-1, 0, 0]]
        ];
        faces.forEach(function (f) {
          var q4 = f[0].map(function (i) { return v[i]; });
          pushTri(b, q4[0], q4[1], q4[2], f[1]);
          pushTri(b, q4[0], q4[2], q4[3], f[1]);
        });
      });

      (p.c || []).forEach(function (c) {
        var cx = c[0], cy = c[1], cz = c[2], r = c[3], L = c[4], axis = c[5], seg = c[6] || 16;
        var i, a0, a1;
        var pt = function (t, o) {
          if (axis === "x") return [cx + o, cy + r * Math.cos(t), cz + r * Math.sin(t)];
          if (axis === "z") return [cx + r * Math.cos(t), cy + r * Math.sin(t), cz + o];
          return [cx + r * Math.cos(t), cy + o, cz + r * Math.sin(t)];
        };
        for (i = 0; i < seg; i++) {
          a0 = Math.PI * 2 * i / seg;
          a1 = Math.PI * 2 * (i + 1) / seg;
          var am = (a0 + a1) / 2;
          var nrm = axis === "x" ? [0, Math.cos(am), Math.sin(am)]
            : axis === "z" ? [Math.cos(am), Math.sin(am), 0]
              : [Math.cos(am), 0, Math.sin(am)];
          var p0 = pt(a0, -L / 2), p1 = pt(a1, -L / 2), p2 = pt(a1, L / 2), p3 = pt(a0, L / 2);
          pushTri(b, p0, p1, p2, nrm);
          pushTri(b, p0, p2, p3, nrm);
        }
        [-1, 1].forEach(function (s) {
          var nn = axis === "x" ? [s, 0, 0] : axis === "z" ? [0, 0, s] : [0, s, 0];
          for (i = 0; i < seg; i++) {
            a0 = Math.PI * 2 * i / seg;
            a1 = Math.PI * 2 * (i + 1) / seg;
            var c0 = pt(0, s * L / 2);
            pushTri(b, c0, pt(a0, s * L / 2), pt(a1, s * L / 2), nn);
          }
        });
      });
    });

    var out = [];
    Object.keys(buckets).forEach(function (k) {
      var b = buckets[k];
      out.push({
        key: k,
        pos: new Float32Array(b.pos),
        nrm: new Float32Array(b.nrm),
        uv: b.uv.length ? new Float32Array(b.uv) : null,
        idx: b.idx.length ? new Uint16Array(b.idx) : null,
        tex: b.tex,
        count: b.pos.length / 3,
        color: b.color,
        emis: b.em,
        spec: b.spec
      });
    });
    return out;
  }

  /* ---------- 视图 ---------- */

  function mount(canvas, model, opts) {
    opts = opts || {};
    var gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) return null;

    var prog, fprog;
    try {
      prog = program(gl, VS, FS);
      fprog = program(gl, FVS, FFS);
    } catch (e) {
      return null;
    }

    var meshes = buildMesh(model.parts, model.colors || {}, model.emissive || {});
    var anchors = {};
    model.parts.forEach(function (p) { anchors[p.k] = p.a; });

    /* 照片纹理 */
    var tex = null, texReady = false;
    if (model.tex) {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([40, 48, 62, 255]));
      var im = new Image();
      im.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        texReady = true;
        dirty = true;
      };
      im.src = model.tex;
    }

    meshes.forEach(function (m) {
      m.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
      m.nbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nbo);
      gl.bufferData(gl.ARRAY_BUFFER, m.nrm, gl.STATIC_DRAW);
      if (m.idx) {
        m.ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
      }
      if (m.uv) {
        m.ubo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, m.ubo);
        gl.bufferData(gl.ARRAY_BUFFER, m.uv, gl.STATIC_DRAW);
      }
    });

    var floor = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, floor);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1500, 0, -1500, 1500, 0, -1500, 1500, 0, 1500,
      -1500, 0, -1500, 1500, 0, 1500, -1500, 0, 1500
    ]), gl.STATIC_DRAW);

    var cam = {
      yaw: model.cam.yaw, pitch: model.cam.pitch,
      dist: model.cam.dist, base: model.cam.dist,
      fov: model.cam.fov || 0.8,
      target: model.cam.target || [0, 20, 0]
    };

    var aPos = gl.getAttribLocation(prog, "aPos");
    var aNorm = gl.getAttribLocation(prog, "aNorm");
    var aUV = gl.getAttribLocation(prog, "aUV");
    var uMVP = gl.getUniformLocation(prog, "uMVP");
    var uMV = gl.getUniformLocation(prog, "uMV");
    var uColor = gl.getUniformLocation(prog, "uColor");
    var uEmis = gl.getUniformLocation(prog, "uEmis");
    var uSpec = gl.getUniformLocation(prog, "uSpec");
    var uModel = gl.getUniformLocation(prog, "uModel");
    var uTex = gl.getUniformLocation(prog, "uTex");
    var uHasTex = gl.getUniformLocation(prog, "uHasTex");
    var fPos = gl.getAttribLocation(fprog, "aPos");
    var fMVP = gl.getUniformLocation(fprog, "uMVP");
    var fMV = gl.getUniformLocation(fprog, "uMV");

    var W = 1, H = 1, dpr = 1;
    var dirty = true, alive = true, drag = null;
    var playing = false, t0 = 0;
    var labelCv = null, lctx = null;
    var labelsOn = opts.labels !== false;

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(2, global.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      if (labelCv) {
        labelCv.width = W * dpr;
        labelCv.height = H * dpr;
        labelCv.style.width = W + "px";
        labelCv.style.height = H + "px";
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      dirty = true;
    }

    function eyePos() {
      var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      return [
        cam.target[0] + cam.dist * cp * Math.sin(cam.yaw),
        cam.target[1] + cam.dist * sp,
        cam.target[2] + cam.dist * cp * Math.cos(cam.yaw)
      ];
    }

    function matrices() {
      var eye = eyePos();
      var view = lookAt(eye, cam.target, [0, 1, 0]);
      var proj = perspective(cam.fov, W / H, 1, 4000);
      return { view: view, mvp: mul(proj, view) };
    }

    function project(x, y, z, mvp) {
      var cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
      var cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
      var cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
      if (cw <= 0.001) return null;
      return [(cx / cw * 0.5 + 0.5) * W, (0.5 - cy / cw * 0.5) * H];
    }

    function draw() {
      var m = matrices();
      gl.clearColor(0.030, 0.048, 0.078, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      /* 地面 */
      gl.useProgram(fprog);
      gl.bindBuffer(gl.ARRAY_BUFFER, floor);
      gl.enableVertexAttribArray(fPos);
      gl.vertexAttribPointer(fPos, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(fMVP, false, m.mvp);
      gl.uniformMatrix4fv(fMV, false, m.view);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(fPos);

      /* 零件 */
      gl.useProgram(prog);
      gl.uniformMatrix4fv(uMVP, false, m.mvp);
      gl.uniformMatrix4fv(uMV, false, m.view);

      var moved = {};
      if (playing && model.anim) {
        var now = performance.now() - t0;
        model.anim.forEach(function (a) {
          var ph = (Math.sin(now / a.period * Math.PI * 2 - Math.PI / 2) + 1) / 2;
          var off = ph * a.amp;
          moved[a.k] = a.axis === "x" ? translate(off, 0, 0)
            : a.axis === "y" ? translate(0, off, 0) : translate(0, 0, off);
        });
      }

      meshes.forEach(function (mm) {
        gl.uniformMatrix4fv(uModel, false, moved[mm.key] || IDENT);
        gl.bindBuffer(gl.ARRAY_BUFFER, mm.vbo);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mm.nbo);
        gl.enableVertexAttribArray(aNorm);
        gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

        var useTex = !!(mm.tex && tex && texReady);
        if (aUV > -1) {
          if (mm.uv) {
            gl.bindBuffer(gl.ARRAY_BUFFER, mm.ubo);
            gl.enableVertexAttribArray(aUV);
            gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(aUV);
            gl.vertexAttrib2f(aUV, 0, 0);
          }
        }
        if (useTex) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(uTex, 0);
        }
        gl.uniform1f(uHasTex, useTex ? 1 : 0);
        gl.uniform3fv(uColor, mm.color);
        gl.uniform3fv(uEmis, mm.emis);
        gl.uniform1f(uSpec, mm.spec);

        if (mm.ibo) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mm.ibo);
          gl.drawElements(gl.TRIANGLES, mm.idx.length, gl.UNSIGNED_SHORT, 0);
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, mm.count);
        }
      });

      /* 编号 */
      if (lctx && labelsOn && opts.order) {
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lctx.clearRect(0, 0, W, H);
        lctx.font = "700 11px ui-monospace, Menlo, Consolas, monospace";
        lctx.textAlign = "center";
        lctx.textBaseline = "middle";
        var placed = [];
        opts.order.forEach(function (k, idx) {
          var a = anchors[k];
          if (!a) return;
          var p = project(a[0], a[1], a[2], m.mvp);
          if (!p) return;
          var lx = Math.max(15, Math.min(W - 15, p[0]));
          var ly = Math.max(15, Math.min(H - 15, p[1]));
          var guard = 0;
          while (placed.some(function (q) {
            return Math.abs(q[0] - lx) < 25 && Math.abs(q[1] - ly) < 25;
          }) && guard < 8) { ly = Math.min(H - 15, ly + 25); guard++; }
          placed.push([lx, ly]);
          lctx.beginPath();
          lctx.arc(lx, ly, 11, 0, Math.PI * 2);
          lctx.fillStyle = "rgba(255,255,255,0.94)";
          lctx.fill();
          lctx.strokeStyle = "#0e1522";
          lctx.lineWidth = 1.4;
          lctx.stroke();
          lctx.fillStyle = "#0e1522";
          lctx.fillText(String(idx + 1), lx, ly + 0.5);
        });
      } else if (lctx) {
        lctx.clearRect(0, 0, W, H);
      }

      dirty = false;
    }

    function loop() {
      if (!alive) return;
      if (playing) dirty = true;
      if (dirty) draw();
      requestAnimationFrame(loop);
    }

    /* ---------- 交互 ---------- */

    function pick(px, py) {
      var m = matrices();
      var eye = eyePos();
      var inv = invert(m.mvp);
      if (!inv) return null;
      var nx = (px / W) * 2 - 1, ny = 1 - (py / H) * 2;
      var p0 = unproject(inv, nx, ny, -1), p1 = unproject(inv, nx, ny, 1);
      var dir = norm(sub(p1, p0));
      var hits = [];
      model.parts.forEach(function (part) {
        var bb = part.__bb;
        if (!bb) return;
        var t = rayBox(eye, dir, bb);
        if (t !== null) hits.push([t, part.k]);
      });
      hits.sort(function (a, b) { return a[0] - b[0]; });
      /* 机柜、屏幕这类陪衬件先跳过，落到真正可点的零件上 */
      var known = opts.order || [];
      for (var i = 0; i < hits.length; i++) {
        if (known.indexOf(hits[i][1]) > -1) return hits[i][1];
      }
      return hits.length ? hits[0][1] : null;
    }

    function onDown(e) {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0, id: e.pointerId };
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved > 4) {
        cam.yaw += dx * 0.008;
        cam.pitch = Math.max(-0.12, Math.min(1.35, cam.pitch + dy * 0.006));
        dirty = true;
      }
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var quick = Date.now() - drag.t < 320 && drag.moved < 6;
      drag = null;
      if (quick && opts.onPick) {
        var r = canvas.getBoundingClientRect();
        var k = pick(e.clientX - r.left, e.clientY - r.top);
        if (k) opts.onPick(k);
      }
    }
    function onWheel(e) {
      e.preventDefault();
      cam.dist = Math.max(cam.base * 0.35, Math.min(cam.base * 2.2, cam.dist * (1 + e.deltaY * 0.0016)));
      dirty = true;
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", function () { drag = null; });
    canvas.addEventListener("wheel", onWheel, { passive: false });

    /* 编号用的叠加层 */
    labelCv = document.createElement("canvas");
    labelCv.className = "vlabels";
    canvas.parentNode.appendChild(labelCv);
    lctx = labelCv.getContext("2d");

    var ro = global.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);
    global.addEventListener("resize", resize);

    /* 每块的包围盒，用于拾取 */
    model.parts.forEach(function (part) {
      if (part.geo && part.geo.bbox) { part.__bb = part.geo.bbox; return; }
      var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      (part.b || []).forEach(function (q) {
        for (var i = 0; i < 3; i++) {
          mn[i] = Math.min(mn[i], q[i] - q[i + 3] / 2);
          mx[i] = Math.max(mx[i], q[i] + q[i + 3] / 2);
        }
      });
      (part.c || []).forEach(function (q) {
        var r = q[3], L = q[4] / 2;
        var half = q[5] === "x" ? [L, r, r] : q[5] === "z" ? [r, r, L] : [r, L, r];
        for (var i = 0; i < 3; i++) {
          mn[i] = Math.min(mn[i], q[i] - half[i]);
          mx[i] = Math.max(mx[i], q[i] + half[i]);
        }
      });
      part.__bb = [mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]];
    });

    resize();
    requestAnimationFrame(loop);

    return {
      gl: true,
      play: function (on) {
        playing = !!on;
        t0 = performance.now();
        dirty = true;
      },
      zoom: function (f) {
        cam.dist = Math.max(cam.base * 0.35, Math.min(cam.base * 2.2, cam.dist * f));
        dirty = true;
      },
      reset: function () {
        cam.yaw = model.cam.yaw; cam.pitch = model.cam.pitch; cam.dist = cam.base; dirty = true;
      },
      setLabels: function (v) { labelsOn = v; dirty = true; },
      destroy: function () {
        alive = false;
        if (ro) ro.disconnect();
        global.removeEventListener("resize", resize);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("wheel", onWheel);
        /* 主动释放上下文：来回切设备时浏览器只允许十几个 WebGL 上下文 */
        try {
          var ext = gl.getExtension("WEBGL_lose_context");
          if (ext) ext.loseContext();
        } catch (e) { /* 忽略 */ }
        if (labelCv && labelCv.parentNode) labelCv.parentNode.removeChild(labelCv);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  /* ---------- 射线 ---------- */

  function invert(m) {
    var a = m, o = new Float32Array(16), b = [];
    var i;
    for (i = 0; i < 16; i++) b.push(a[i]);
    var a00 = b[0], a01 = b[1], a02 = b[2], a03 = b[3];
    var a10 = b[4], a11 = b[5], a12 = b[6], a13 = b[7];
    var a20 = b[8], a21 = b[9], a22 = b[10], a23 = b[11];
    var a30 = b[12], a31 = b[13], a32 = b[14], a33 = b[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    var b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    var b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    var b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    var b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    var b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  }

  function unproject(inv, x, y, z) {
    var o = [];
    for (var i = 0; i < 4; i++) {
      o[i] = inv[i] * x + inv[4 + i] * y + inv[8 + i] * z + inv[12 + i];
    }
    return [o[0] / o[3], o[1] / o[3], o[2] / o[3]];
  }

  function rayBox(o, d, bb) {
    var t0 = -1e9, t1 = 1e9;
    for (var i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < bb[i] || o[i] > bb[3 + i]) return null;
      } else {
        var a = (bb[i] - o[i]) / d[i], b = (bb[3 + i] - o[i]) / d[i];
        if (a > b) { var t = a; a = b; b = t; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) return null;
      }
    }
    return t0 > 0 ? t0 : (t1 > 0 ? t1 : null);
  }

  global.GLView = { mount: mount, available: function () {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) { return false; }
  } };
})(window);
