/* 机台本 — 界面层（iOS） */
(function () {
  "use strict";

  var C = window.Core;
  var D = document;

  var S = C.Store.load();

  var state = {
    tab: "home",
    query: "",
    machine: "全部",
    stack: [],
    sheet: null,
    drill: null,
    devTab: "map",
    playing: false,
    editing: null,
    seen: {}
  };

  /* ------------------------------------------------------------
     工具
     ------------------------------------------------------------ */

  function $(s, r) { return (r || D).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function save() {
    if (!C.Store.save(S)) {
      toast("本地存储满了：删几台照片设备或先导出备份，这次的改动可能没存上", 5000);
    }
  }
  function isDesktop() { return window.matchMedia("(min-width:900px)").matches; }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 2200);
  }

  function storageOK() {
    try {
      window.localStorage.setItem("jitaben/probe", "1");
      window.localStorage.removeItem("jitaben/probe");
      return true;
    } catch (e) { return false; }
  }

  var ICON = {
    back: '<svg viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7.4 5.4 11 12 3.4"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  function riskText(r) { return { high: "停线", mid: "降速", low: "提示" }[r] || "降速"; }

  function scrollWatch(el) {
    if (!el || el.__w) return;
    el.__w = 1;
    var nav = $(".nav", el);
    el.addEventListener("scroll", function () {
      if (!nav) return;
      nav.classList.toggle("scrolled", el.scrollTop > 28);
    }, { passive: true });
  }

  /* ------------------------------------------------------------
     标签页
     ------------------------------------------------------------ */

  function setTab(name) {
    state.tab = name;
    $$(".screen[data-tab]").forEach(function (s) {
      s.setAttribute("data-on", s.getAttribute("data-tab") === name ? "1" : "0");
    });
    $$(".tab").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false");
    });
    renderTab();
    updateBadge();
  }

  function renderTab() {
    if (state.tab === "home") renderHome();
    else if (state.tab === "devices") renderDevices();
    else if (state.tab === "memo") renderMemo();
    else if (state.tab === "notes") renderNotes();
    else renderMe();
  }

  function updateBadge() {
    var due = C.Lib.dueCount(S);
    $$('[data-badge="memo"]').forEach(function (b) { b.textContent = due ? String(due) : ""; });
  }

  /* ------------------------------------------------------------
     速查
     ------------------------------------------------------------ */

  function renderHome() {
    var queue = C.Lib.queue(S).length;
    $("#home-sub").textContent = S.alarms.length + " 条报警" +
      (queue ? " · 今天 " + queue + " 张待复习" : "");

    var ms = C.Lib.machines(S);
    var html = '<button class="chip" data-act="machine" data-m="全部" aria-pressed="' +
      (state.machine === "全部") + '">全部机台 ' + S.alarms.length + "</button>";
    ms.forEach(function (m) {
      html += '<button class="chip" data-act="machine" data-m="' + esc(m.name) + '" aria-pressed="' +
        (state.machine === m.name) + '">' + esc(m.name) + "</button>";
    });
    $("#chips").innerHTML = html;

    renderHomeList();
  }

  function renderHomeList() {
    var res = C.Lib.search(S, state.query, state.machine);
    var host = $("#home-list");
    var animate = !state.seen.home;
    state.seen.home = true;

    if (!res.length) {
      var q = state.query.trim();
      host.innerHTML = '<div class="empty"><strong>没有匹配的条目</strong>' +
        (q ? "只输报警号后四位也可以。查不到就当场建一条，下次输这几个字就能找到。"
           : "还没有任何记录。") +
        '<button class="btn btn-tint" data-act="new-alarm">' +
        (q ? "把「" + esc(q) + "」建成一条报警" : "新建第一条报警") + "</button></div>";
      return;
    }

    host.innerHTML = res.map(function (r, i) {
      var a = r.a;
      var st = C.Srs.status(a);
      var meta = st.text + " · " + a.steps.length + " 步 · " +
        (a.runs.length ? "上次 " + C.Fmt.ago(a.runs[a.runs.length - 1].ts) : "未处理");
      return '<button class="row list-row" data-act="open-alarm" data-id="' + a.id + '"' +
        (animate ? ' style="animation:fadeUp .3s ' + Math.min(i, 7) * 40 + 'ms both"' : "") + ">" +
        '<span class="row-main">' +
        '<span class="lr-top"><span class="lr-code">' + esc(a.code) + "</span>" +
        '<span class="lr-machine">' + esc(a.machine || "未填机台") + "</span></span>" +
        '<span class="lr-name">' + esc(a.name) + "</span>" +
        '<span class="lr-meta"><i class="sq' + (st.key === "due" ? "" : " off") + '"></i>' +
        esc(meta) + "</span></span>" + ICON.chev + "</button>";
    }).join("") +
      '<button class="addrow" data-act="new-alarm"><i class="plus">＋</i>新建一条报警</button>';
  }

  /* ------------------------------------------------------------
     设备列表
     ------------------------------------------------------------ */

  function renderDevices() {
    var totalParts = 0, learned = 0;
    S.devices.forEach(function (v) {
      totalParts += C.Devs.parts(v).length;
      learned += C.Devs.learnedCount(v);
    });
    $("#dev-sub").textContent = S.devices.length + " 台 · " +
      (totalParts ? learned + " / " + totalParts + " 个部件已学" : "还没有添加设备");

    if (!S.devices.length) {
      $("#dev-list").innerHTML = '<div class="empty"><strong>还没有设备</strong>' +
        "把你天天开的机台加进来，选一个结构模板，就有可点的结构图。" +
        '<button class="btn btn-tint" data-act="new-device">添加第一台设备</button></div>';
      return;
    }

    var html = '<div class="group"><div class="card">';
    S.devices.forEach(function (v) {
      var t = C.Devs.tpl(v);
      var total = C.Devs.parts(v).length;
      var done = C.Devs.learnedCount(v);
      var thumb = v.photo
        ? '<span class="dev-thumb" style="padding:0"><img src="' + v.photo.src + '" alt=""></span>'
        : '<span class="dev-thumb thumb">' + (t ? t.svg : "") + "</span>";
      html += '<button class="row" data-act="open-device" data-id="' + v.id + '">' +
        thumb +
        '<span class="row-main">' +
        '<span class="row-title">' + esc(v.name) + "</span>" +
        '<span class="row-sub">' + esc([v.model, v.station].filter(Boolean).join(" · ") ||
          (v.photo ? "照片建型" : "未填型号")) + "</span>" +
        (total && done ? '<span class="progress"><i style="width:' +
          Math.round(done / total * 100) + '%"></i></span>' : "") +
        "</span>" + ICON.chev + "</button>";
    });
    html += "</div></div>";
    html += '<div class="group"><button class="btn btn-gray" data-act="new-device">添加设备</button></div>';
    html += '<div class="group-f">三维模型是示意几何体，用来认零件和记位置，不代表实际尺寸。</div>';    $("#dev-list").innerHTML = html;
  }

  /* ------------------------------------------------------------
     push 层
     ------------------------------------------------------------ */

  function push(entry) {
    state.stack.push(entry);
    renderPush();
    var el = $("#push");
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
  }

  function destroyViewer() {
    if (state.viewer) { state.viewer.destroy(); state.viewer = null; }
  }

  function pop() {
    state.stack.pop();
    state.playing = false;
    destroyViewer();
    var el = $("#push");
    if (!state.stack.length) {
      el.classList.remove("open");
      el.setAttribute("aria-hidden", "true");
      setTimeout(function () { if (!state.stack.length) el.innerHTML = ""; }, 360);
      renderTab();
      return;
    }
    renderPush();
  }

  function closePushAll() {
    state.stack = [];
    state.playing = false;
    destroyViewer();
    var el = $("#push");
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    setTimeout(function () { if (!state.stack.length) el.innerHTML = ""; }, 360);
  }

  function renderPush() {
    var top = state.stack[state.stack.length - 1];
    var el = $("#push");
    if (!top) { el.innerHTML = ""; return; }

    var back = state.stack.length > 1 ? parentLabel() :
      (top.v === "device" ? "设备" : top.v === "note" ? "笔记" : "速查");
    var html = "";

    if (top.v === "alarm") {
      var a = C.Lib.find(S, "alarm", top.id);
      if (!a) { pop(); return; }
      html = alarmHTML(a, back);
      el.classList.add("has-footer");
    } else if (top.v === "device") {
      var v = C.Lib.find(S, "device", top.id);
      if (!v) { pop(); return; }
      html = deviceHTML(v, back);
      el.classList.remove("has-footer");
    } else {
      var n = C.Lib.find(S, "note", top.id);
      if (!n) { pop(); return; }
      html = noteHTML(n, back);
      el.classList.remove("has-footer");
    }

    el.innerHTML = '<div class="screen" data-on="1">' + html + "</div>";
    var sc = $(".screen", el);
    scrollWatch(sc);
    if (sc) sc.scrollTop = 0;
    var svg = $(".dsvg", el);
    if (svg && state.playing) svg.classList.add("play");
    mountViewer();
  }

  function parentLabel() {
    var p = state.stack[state.stack.length - 2];
    if (!p) return "";
    var it = C.Lib.find(S, p.v, p.id);
    if (!it) return "";
    return p.v === "alarm" ? it.code : it.name;
  }

  function navBar(title, backLabel, actName, actLabel) {
    return '<nav class="nav">' +
      '<button class="nav-back" data-act="pop">' + ICON.back + "<span>" + esc(backLabel) + "</span></button>" +
      '<span class="nav-title">' + esc(title) + "</span>" +
      (actName ? '<div class="nav-right"><button class="nav-btn" data-act="' + actName + '">' + actLabel + "</button></div>" : "") +
      "</nav>";
  }

  function sec(title, n) {
    return '<div class="sec-h"><h3>' + esc(title) + '</h3><i class="fill"></i>' +
      (n ? '<span class="n">' + esc(n) + "</span>" : "") + "</div>";
  }

  /* ---------- 报警详情 ---------- */

  function alarmHTML(a, backLabel) {
    var st = C.Srs.status(a);
    var done = a.steps.filter(function (s) { return s.done; }).length;
    var total = a.steps.length;

    var sub = [];
    if (a.machine) sub.push(esc(a.machine));
    sub.push(esc(st.text));
    if (!C.Srs.isNew(a) && !C.Srs.isDue(a)) sub.push("下次 " + esc(C.Fmt.due(a)));
    sub.push("更新 " + C.Fmt.ago(a.updated));

    var h = navBar(a.code, backLabel, "edit-alarm", "编辑");
    h += '<div class="detail-hero">' +
      '<div class="detail-code"><span class="code">' + esc(a.code) + "</span>" +
      '<span class="pill' + (a.risk === "high" ? " alert" : "") + '">' + riskText(a.risk) + "</span></div>" +
      '<h1 class="detail-name">' + esc(a.name) + "</h1>" +
      '<div class="detail-sub">' + sub.join('<span class="dot-sep">·</span>') + "</div></div>";

    if (a.symptom) {
      h += sec("现象") + '<div class="blk"><p class="body-text">' + esc(a.symptom) + "</p></div>";
    }

    if (a.causes.length) {
      h += sec("可能原因") + '<div class="blk"><ul class="causes">' +
        a.causes.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div>";
    }

    if (total) {
      h += sec("处理步骤", done + " / " + total) + '<div class="blk"><div class="card steps">' +
        a.steps.map(function (s, i) {
          return '<button class="step" data-act="step" data-i="' + i + '" aria-pressed="' + s.done + '">' +
            '<span class="box"><svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4.5 11.5 9 16l8.5-9.5"/></svg></span>' +
            '<span class="step-text">' + esc(s.t) + "</span></button>";
        }).join("") + "</div></div>";
    }

    if (a.parts.length) {
      h += sec("备件与工具") + '<div class="blk"><div class="tagrow">' +
        a.parts.map(function (p) { return '<span class="tag">' + esc(p) + "</span>"; }).join("") +
        "</div></div>";
    }

    var rel = a.machine ? S.notes.filter(function (n) { return n.machine === a.machine; }).slice(0, 3) : [];
    if (rel.length) {
      h += sec("这台机台的笔记", rel.length + " 条") + '<div class="blk"><div class="card">' +
        rel.map(function (n) {
          var first = String(n.body || "").split("\n").filter(Boolean)[0] || "";
          return '<button class="row notelink" data-act="open-note" data-id="' + n.id + '">' +
            '<span class="row-main"><span class="nl-title">' + esc(n.title) + "</span>" +
            '<span class="nl-first">' + esc(first) + "</span></span>" + ICON.chev + "</button>";
        }).join("") + "</div></div>";
    }

    if (a.tags.length) {
      h += sec("标签") + '<div class="blk"><div class="tagrow">' +
        a.tags.map(function (t) { return '<span class="tag">#' + esc(t) + "</span>"; }).join("") +
        "</div></div>";
    }

    if (a.runs.length) {
      var runs = a.runs.slice().sort(function (x, y) { return y.ts - x.ts; }).slice(0, 6);
      h += sec("处理记录", "共 " + a.runs.length + " 次") + '<div class="blk"><div class="card">' +
        runs.map(function (r) {
          return '<div class="row"><span class="row-main"><span class="row-sub mono">' +
            C.Fmt.stamp(r.ts) + "　" + r.steps + " 步走完</span></span>" +
            '<span class="row-sub" style="margin:0;flex:none">' + C.Fmt.ago(r.ts) + "</span></div>";
        }).join("") + "</div></div>";
    }

    h += '<div style="height:16px"></div>';

    h += '<div class="footer-bar" id="footer-bar">' +
      '<div class="footer-hint" id="foot-hint">' + (done === 0
        ? "至少勾一步，才能记录这次处理。"
        : (done >= total ? "全部步骤已勾完。记录后这张卡会回到复习队列。" : "已勾 " + done + " / " + total + " 步。")) +
      "</div>" +
      '<button class="btn" data-act="record"' + (done === 0 ? " disabled" : "") + ">记录这次处理</button>" +
      "</div>";

    return h;
  }

  /* ---------- 笔记详情 ---------- */

  function noteHTML(n, backLabel) {
    var paras = String(n.body || "").split("\n").filter(function (l) { return l.trim(); });
    var h = navBar(n.title, backLabel, "edit-note", "编辑");
    h += '<div class="detail-hero"><h1 class="detail-name">' + esc(n.title) + "</h1>" +
      '<div class="detail-sub">' + C.Fmt.ago(n.updated) +
      (n.tags.length ? '<span class="dot-sep">·</span>' + esc(n.tags.join(" · ")) : "") +
      (n.machine ? '<span class="dot-sep">·</span>' + esc(n.machine) : "") +
      "</div></div>";
    h += '<div class="blk"><div class="card" style="padding:14px">' +
      paras.map(function (p) {
        return '<p class="body-text" style="margin-bottom:10px">' + esc(p) + "</p>";
      }).join("") + "</div></div>";
    h += '<div class="blk" style="margin-top:20px"><button class="btn ' +
      (n.card ? "btn-gray" : "") + '" data-act="toggle-card">' +
      (n.card ? "移出记忆队列" : "设为记忆卡") + "</button></div>";
    return h;
  }

  /* ---------- 设备详情 ---------- */

  function deviceHTML(v, backLabel) {
    var total = C.Devs.parts(v).length;
    var done = C.Devs.learnedCount(v);

    var h = navBar(v.name, backLabel, "edit-device", "编辑");
    var subBits = [v.model, v.station].filter(Boolean).map(esc);
    subBits.push("<span id=\"dev-learned\">" +
      (v.photo ? "照片建型" : "已学 " + done + " / " + total) + "</span>");
    h += '<div class="detail-hero"><h1 class="detail-name">' + esc(v.name) + "</h1>" +
      '<div class="detail-sub">' +
      subBits.join('<span class="dot-sep">·</span>') + "</div></div>";

    h += '<div class="seg" id="devseg">' +
      segBtn("map", "结构图") + segBtn("parts", "部件") + segBtn("rel", "关联") + "</div>";
    h += '<div id="dev-body">' + deviceBodyHTML(v) + "</div>";
    return h;
  }

  function segBtn(k, label) {
    return '<button data-act="dev-tab" data-k="' + k + '" aria-selected="' +
      (state.devTab === k) + '">' + label + "</button>";
  }

  function deviceBodyHTML(v) {
    var t = C.Devs.tpl(v);

    if (v.photo) {
      if (state.devTab === "parts") {
        return '<div class="empty"><strong>照片模型还没有标部件</strong>' +
          "它只有外形和照片。想按零件学，用上面那六套结构模板之一。</div>";
      }
      if (state.devTab === "rel") return relatedHTML(v);
      return viewerHTML(v, null);
    }

    if (!t) return '<div class="empty">这套模板不存在</div>';

    if (state.devTab === "map") {
      if (v.photo) return viewerHTML(v, null);
      if (t.m3d) return viewerHTML(v, t);
      var h = '<div class="group"><div class="diagram">' +
        '<span class="view-badge">剖视图</span>' +
        '<div class="diagram-inner">' + t.svg;
      t.parts.forEach(function (p, i) {
        h += '<button class="hot" data-act="hot" data-k="' + p.k + '" style="left:' +
          p.at[0] + "%;top:" + p.at[1] + '%">' + (i + 1) + "</button>";
      });
      h += "</div></div></div>";
      h += '<div class="diagram-actions">' +
        (t.motion || t.svg.indexOf('p-piston') > -1
          ? '<button class="btn btn-gray btn-sm" data-act="play">' +
            (state.playing ? "停止演示" : "运行演示") + "</button>"
          : "") +
        '<button class="btn btn-gray btn-sm" data-act="dev-tab" data-k="parts">看全部部件</button>' +
        "</div>";
      h += '<p class="diagram-hint">' + esc(t.blurb) + "</p>";
      h += legendHTML(t);
      return h;
    }

    if (state.devTab === "parts") {
      var rows = t.parts.map(function (p, i) {
        var on = C.Devs.isLearned(v, p.k);
        return '<button class="row" data-act="hot" data-k="' + p.k + '">' +
          '<span class="row-main">' +
          '<span class="row-title">' + (i + 1) + ". " + esc(p.n) + "</span>" +
          '<span class="row-sub wrap">' + esc(p.role) + "</span></span>" +
          '<span class="part-check' + (on ? " on" : "") + '">' + ICON.check + "</span></button>";
      }).join("");
      return '<div class="group"><div class="card">' + rows + "</div></div>" +
        '<div class="group-f">点一行看它的常见故障和点检方法；看完标成已学。</div>';
    }

    return relatedHTML(v);
  }

  function relatedHTML(v) {
    var rel = C.Devs.related(S, v);
    var h2 = "";
    if (rel.alarms.length) {
      h2 += '<div class="group"><div class="group-h">这台设备的报警</div><div class="card">' +
        rel.alarms.map(function (a) {
          return '<button class="row" data-act="open-alarm" data-id="' + a.id + '">' +
            '<span class="row-main"><span class="lr-code">' + esc(a.code) + "</span>" +
            '<span class="row-title">' + esc(a.name) + "</span></span>" + ICON.chev + "</button>";
        }).join("") + "</div></div>";
    }
    if (rel.notes.length) {
      h2 += '<div class="group"><div class="group-h">这台设备的笔记</div><div class="card">' +
        rel.notes.map(function (n) {
          return '<button class="row" data-act="open-note" data-id="' + n.id + '">' +
            '<span class="row-main"><span class="row-title">' + esc(n.title) + "</span></span>" +
            ICON.chev + "</button>";
        }).join("") + "</div></div>";
    }
    if (!h2) {
      h2 = '<div class="empty"><strong>还没有关联内容</strong>建报警或笔记时，把「机台」写成 ' +
        esc(v.name) + "，就会出现在这里。</div>";
    }
    return h2;
  }

  /* ------------------------------------------------------------
     sheet
     ------------------------------------------------------------ */

  function openSheet(html) {
    var el = $("#sheet");
    el.innerHTML = html;
    void el.offsetWidth;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
  }

  function closeSheet() {
    var el = $("#sheet");
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    state.sheet = null;
    setTimeout(function () {
      if (!el.classList.contains("open")) el.innerHTML = "";
    }, 400);
  }

  function openPart(key) {
    var top = state.stack[state.stack.length - 1];
    if (!top || top.v !== "device") return;
    var v = C.Lib.find(S, "device", top.id);
    var p = C.Devs.part(v, key);
    if (!p) return;
    state.sheet = { v: "part", devId: v.id, k: key };
    var on = C.Devs.isLearned(v, key);
    var h = '<div class="scrim" data-act="close-sheet"></div><div class="panel">' +
      '<div class="grabber"></div>' +
      '<div class="sheet-head plain"><h2>' + esc(p.n) + "</h2>" +
      '<button class="nav-btn" data-act="close-sheet">完成</button></div>' +
      '<div class="sheet-body">' +
      '<p class="lead">' + esc(p.role) + "</p>" +
      '<div class="blk-h">常见故障</div><ul class="bul">' +
      p.faults.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
      '<div class="blk-h">点检 / 维护</div><ul class="bul">' +
      p.checks.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
      '<button class="btn ' + (on ? "btn-gray" : "") + '" data-act="toggle-learned" data-k="' + key + '">' +
      (on ? "已学会 · 取消标记" : "标记已学") + "</button>" +
      "</div></div>";
    openSheet(h);

    $$(".hot").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-k") === key ? "true" : "false");
    });
  }

  function legendHTML(t) {
    return '<div class="group"><div class="group-h">编号对照</div><div class="card legend">' +
      t.parts.map(function (p, i) {
        return '<button class="leg" data-act="hot" data-k="' + p.k + '"><b>' + (i + 1) +
          "</b><span>" + esc(p.n) + "</span></button>";
      }).join("") + "</div></div>";
  }

  /* 三维查看器 */
  function viewerHTML(v, t) {
    var canPlay = !!(t && t.m3d && t.m3d.anim && t.m3d.anim.length);
    var h = '<div class="group"><div class="viewer">' +
      '<canvas id="vcanvas" aria-label="' + esc(v.name) + ' 三维结构"></canvas>' +
      '<div class="vctl">' +
      (canPlay ? '<button data-act="v-play" aria-pressed="' + (state.playing ? "true" : "false") + '">' +
        (state.playing ? "停止" : "运行") + "</button>" : "") +
      '<button data-act="v-in" aria-label="放大">＋</button>' +
      '<button data-act="v-out" aria-label="缩小">−</button>' +
      '<button data-act="v-reset">复位</button>' +
      (t ? '<button data-act="v-label" aria-pressed="' + (state.labels ? "true" : "false") + '">编号</button>' : "") +
      "</div></div></div>" +
      '<p class="vhint">' + (v.photo
        ? "拖动旋转 · 双指或滚轮放大 · 正面是实拍照片，侧面是挤出的厚度"
        : "拖动旋转 · 双指或滚轮放大 · 点零件看它干什么") + "</p>" +
      (t ? legendHTML(t) : "");
    return h;
  }

  function mountViewer() {
    if (state.viewer) { state.viewer.destroy(); state.viewer = null; }
    var cv = $("#vcanvas");
    if (!cv) return;
    var top = state.stack[state.stack.length - 1];
    if (!top || top.v !== "device") return;
    var v = C.Lib.find(S, "device", top.id);
    var t = v && C.Devs.tpl(v);
    var model = null, order = [];
    if (v && v.photo) {
      model = window.Photo3D.model(v.photo);
    } else if (t && t.m3d) {
      model = t.m3d;
      order = t.parts.map(function (p) { return p.k; });
    }
    if (!model) return;

    var opts = {
      labels: state.labels,
      order: order,
      onPick: function (k) { openPart(k); }
    };
    var inst = null;
    if (window.GLView && window.GLView.available()) inst = window.GLView.mount(cv, model, opts);
    if (!inst) inst = window.Viewer.mount(cv, model, opts);
    state.viewer = inst;
    if (inst && inst.play && state.playing) inst.play(true);
  }

  function repaintDeviceBody() {
    var top = state.stack[state.stack.length - 1];
    if (!top || top.v !== "device") return;
    var v = C.Lib.find(S, "device", top.id);
    var host = $("#dev-body");
    if (!host || !v) return;
    host.innerHTML = deviceBodyHTML(v);
    var svg = $(".dsvg", host);
    if (svg && state.playing) svg.classList.add("play");
    $$("#devseg button").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-k") === state.devTab ? "true" : "false");
    });
    var playBtn = $('[data-act="play"]');
    if (playBtn) playBtn.textContent = state.playing ? "停止演示" : "运行演示";
    mountViewer();
  }

  /* ------------------------------------------------------------
     复习
     ------------------------------------------------------------ */

  function startDrill(list) {
    if (!list || !list.length) { toast("这一轮没有卡"); return; }
    state.drill = { items: list.slice(), i: 0, revealed: false, graded: 0, again: 0 };
    var el = $("#drill");
    el.innerHTML =
      '<div class="drill-bar">' +
      '<button class="nav-btn" data-act="drill-exit" aria-label="结束">' + ICON.close + "</button>" +
      '<div class="drill-prog"><div class="track"><div class="fill" id="dFill"></div></div>' +
      '<span class="drill-count" id="dCount"></span></div></div>' +
      '<div class="drill-stage" id="dStage"></div>' +
      '<div class="drill-foot" id="dFoot"></div>';
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    paintDrill();
  }

  function answerList(arr, plain) {
    return '<ol class="steps' + (plain ? " plain" : "") + '">' + arr.map(function (t, i) {
      var cls = i === 0 ? ' class="instant"' : "";
      var style = i === 0 ? "" : ' style="animation-delay:' + Math.min(i, 12) * 18 + 'ms"';
      return "<li" + cls + style + '><span class="n">' + (plain ? "·" : (i + 1)) +
        "</span><span>" + esc(t) + "</span></li>";
    }).join("") + "</ol>";
  }

  function paintDrill() {
    var s = state.drill;
    if (!s) return;
    var stage = $("#dStage"), foot = $("#dFoot"), fill = $("#dFill"), count = $("#dCount");
    var total = s.items.length;

    fill.style.width = Math.min(100, s.i / total * 100) + "%";
    count.textContent = Math.min(s.i + 1, total) + " / " + total;

    if (s.i >= total) {
      fill.style.width = "100%";
      count.textContent = total + " / " + total;
      stage.innerHTML = '<div class="drill-done"><div class="big">' + s.graded + "</div>" +
        "<p>这一轮走完了" + (s.again ? "，其中 " + s.again + " 张刚才没想起来，已经排回队列。" : "。") +
        "下次到期时间已经算好，不用你记。</p>" +
        '<button class="btn" data-act="drill-exit">回到记忆</button></div>';
      foot.innerHTML = "";
      return;
    }

    var cur = s.items[s.i];
    var it = C.Lib.find(S, cur.kind, cur.id);
    if (!it) { s.i++; paintDrill(); return; }

    var head = cur.kind === "alarm"
      ? '<div class="qhead"><span class="qc">' + esc(it.code) + "</span>" +
        '<span class="qm">' + esc(it.machine || "") + "</span></div>" +
        '<h2 class="qname">' + esc(it.name) + "</h2>" +
        '<div class="qsymptom">' + esc(it.symptom || "（没写现象）") + "</div>"
      : '<div class="qhead"><span class="qc">笔记</span>' +
        '<span class="qm">' + esc(C.Fmt.ago(it.updated)) + "</span></div>" +
        '<h2 class="qname">' + esc(it.title) + "</h2>";

    var ask = cur.kind === "alarm"
      ? "先在心里过一遍：可能是什么原因，第一步做什么？"
      : "先复述一遍这条笔记写了什么。";

    var back = cur.kind === "alarm"
      ? it.steps.map(function (x) { return x.t; })
      : String(it.body || "").split("\n").filter(Boolean);

    var ans = '<div class="answer"' + (s.revealed ? "" : " hidden") + ' id="ans">' +
      '<div class="sec-h"><h3>' + (cur.kind === "alarm" ? "处理步骤" : "原文") + '</h3><i class="fill"></i></div>' +
      answerList(back, false) +
      (cur.kind === "alarm" && it.causes.length
        ? '<div class="sec-h"><h3>原因</h3><i class="fill"></i></div>' + answerList(it.causes, true)
        : "") + "</div>";

    stage.innerHTML = '<div class="qcard' + (s.revealed ? "" : " qrise") + '">' + head +
      '<div class="qask">' + ask + "</div>" + ans + "</div>";

    if (!s.revealed) {
      foot.innerHTML = '<button class="btn" data-act="reveal">看答案</button>';
    } else {
      foot.innerHTML = '<div class="grades">' + [0, 1, 2, 3].map(function (g) {
        return '<button class="grade" data-act="grade" data-g="' + g + '"><b>' + C.Srs.label(g) +
          "</b><span>" + C.Srs.preview(it.srs, g) + "</span></button>";
      }).join("") + "</div>";
    }
  }

  function bumpReview() {
    var m = S.meta;
    var today = C.todayKey();
    var yest = C.todayKey(new Date(Date.now() - C.DAY));
    if (m.day !== today) {
      m.streak = m.lastDay === yest || m.lastDay === today
        ? (m.streak || 0) + (m.lastDay === today ? 0 : 1) : 1;
      m.day = today;
      m.reviewsToday = 0;
    }
    m.lastDay = today;
    m.reviewsToday = (m.reviewsToday || 0) + 1;
    m.totalReviews = (m.totalReviews || 0) + 1;
  }

  function gradeCard(g) {
    var s = state.drill;
    if (!s || s.i >= s.items.length) return;
    var cur = s.items[s.i];
    var it = C.Lib.find(S, cur.kind, cur.id);
    if (it) {
      it.srs = C.Srs.schedule(it.srs, g);
      if (g === 0) {
        s.again++;
        if (!cur.retry && s.items.length < 40) {
          s.items.splice(Math.min(s.items.length, s.i + 3), 0, { kind: cur.kind, id: cur.id, retry: true });
        }
      }
      s.graded++;
      bumpReview();
      save();
    }
    s.i++;
    s.revealed = false;
    updateBadge();
    paintDrill();
  }

  function endDrill() {
    var el = $("#drill");
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    state.drill = null;
    renderMemo();
    updateBadge();
  }

  /* ------------------------------------------------------------
     记录一次处理
     ------------------------------------------------------------ */

  function recordRun() {
    var top = state.stack[state.stack.length - 1];
    if (!top || top.v !== "alarm") return;
    var a = C.Lib.find(S, "alarm", top.id);
    if (!a) return;
    var done = a.steps.filter(function (s) { return s.done; }).length;
    if (!done) return;

    a.runs.push({ ts: Date.now(), steps: done });
    a.steps.forEach(function (s) { s.done = false; });
    a.updated = Date.now();
    if (!C.Srs.isNew(a)) a.srs.due = Math.min(a.srs.due, Date.now() + 10 * 60000);

    save();
    var keep = $("#push .screen");
    var top0 = keep ? keep.scrollTop : 0;
    renderPush();
    var keep2 = $("#push .screen");
    if (keep2) keep2.scrollTop = top0;
    renderHomeList();
    updateBadge();

    var btn = $('#push [data-act="record"]');
    if (btn) {
      btn.classList.add("is-flash");
      btn.disabled = true;
      btn.textContent = "已记录 " + C.Fmt.stamp(Date.now()).split(" ")[1];
      setTimeout(function () {
        if (!btn.parentNode) return;
        btn.classList.remove("is-flash");
        btn.textContent = "记录这次处理";
      }, 2800);
    }

    var foot = $("#footer-bar");
    if (foot) {
      var strip = D.createElement("div");
      strip.className = "receipt";
      strip.innerHTML = '<i class="sq"></i><span>已记录 ' + C.Fmt.stamp(Date.now()) +
        " · 已排入复习队列</span>";
      foot.appendChild(strip);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { strip.classList.add("show"); });
      });
      setTimeout(function () { strip.classList.remove("show"); }, 2600);
      setTimeout(function () { if (strip.parentNode) strip.parentNode.removeChild(strip); }, 3100);
    }
  }

  /* ------------------------------------------------------------
     记忆
     ------------------------------------------------------------ */

  function renderMemo() {
    var all = C.Lib.items(S);
    var queue = C.Lib.queue(S);
    var mastered = all.filter(C.Srs.isMastered).length;
    var m = S.meta;
    var planTotal = (m.reviewsToday || 0) + queue.length;
    var pct = planTotal ? Math.round((m.reviewsToday || 0) / planTotal * 100) : 0;

    $("#memo-sub").textContent = C.Lib.dueCount(S) + " 张到期 · 已掌握 " + mastered + " / " + all.length;

    var h = '<div class="hero">' +
      '<div class="hero-num"><b>' + queue.length + "</b><span>张待复习</span></div>" +
      '<div class="hero-sub"><span>已掌握 <b>' + mastered + "</b> / " + all.length + "</span>" +
      "<span>连续 <b>" + (m.streak || 0) + "</b> 天</span>" +
      "<span>今日已复习 <b>" + (m.reviewsToday || 0) + "</b></span></div>" +
      '<div class="todaybar"><span class="lbl">今日进度</span>' +
      '<span class="track"><i style="width:' + pct + '%"></i></span>' +
      '<span class="val">' + (m.reviewsToday || 0) + " / " + planTotal + "</span></div>";
    if (queue.length) {
      h += '<button class="btn" data-act="start-drill">开始复习 · 约 ' +
        Math.max(1, Math.round(queue.length * 25 / 60)) + " 分钟</button>";
    } else if (all.length) {
      h += '<button class="btn btn-gray" data-act="random-drill">抽 5 张随便背背</button>';
    }
    h += "</div>";

    if (!all.length) {
      $("#memo-body").innerHTML = h +
        '<div class="empty"><strong>还没有可复习的卡</strong>每建一条报警就多一张卡。也可以把笔记设成记忆卡。</div>';
      return;
    }

    if (queue.length) {
      h += '<div class="group"><div class="group-h">本轮队列（到期 ' + C.Lib.dueCount(S) + "，新卡 " +
        Math.min(all.filter(C.Srs.isNew).length, S.settings.dailyNew) + '）</div><div class="card">' +
        queue.slice(0, 14).map(function (it) {
          return '<div class="row q-row"><span class="qr-top"><span class="qr-code">' + esc(it.code) +
            '</span><span class="qr-name">' + esc(it.name) +
            '</span><span class="qr-iv">' + esc(queueLabel(it)) + "</span></span></div>";
        }).join("") + "</div></div>";
    } else {
      h += '<div class="empty">记忆队列清空了。下次到期会自己回来，不用手动安排。</div>';
    }
    $("#memo-body").innerHTML = h;
  }

  function queueLabel(it) {
    if (C.Srs.isNew(it.ref)) return "新卡";
    if (C.Srs.isDue(it.ref)) return "到期";
    return C.Fmt.due(it.ref);
  }

  /* ------------------------------------------------------------
     笔记
     ------------------------------------------------------------ */

  function renderNotes() {
    var notes = S.notes.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    $("#notes-sub").textContent = notes.length + " 条 · 调机、交接、参数";

    var h = '<div class="group"><div class="card">' +
      '<button class="addrow" data-act="new-note"><i class="plus">＋</i>写一条</button>';

    if (!notes.length) {
      h += "</div></div>" + '<div class="empty"><strong>还没有笔记</strong>' +
        "调机时记一句「为什么这么调」，比记结果有用。</div>";
      $("#notes-body").innerHTML = h;
      return;
    }

    h += notes.map(function (n) {
      var first = String(n.body || "").split("\n").filter(Boolean)[0] || "";
      var bits = [C.Fmt.ago(n.updated)];
      if (n.tags.length) bits.push(n.tags.join("、"));
      return '<button class="row note-row" data-act="open-note" data-id="' + n.id + '">' +
        '<span class="row-main"><span class="note-title">' + esc(n.title) + "</span>" +
        '<span class="note-body">' + esc(first) + "</span>" +
        '<span class="note-foot"><span>' + esc(bits.join(" · ")) + "</span>" +
        (n.card ? '<span class="card-flag"><i class="sq"></i>已进复习</span>' : "") +
        "</span></span>" + ICON.chev + "</button>";
    }).join("");
    h += "</div></div>";
    $("#notes-body").innerHTML = h;
  }

  /* ------------------------------------------------------------
     我的
     ------------------------------------------------------------ */

  function renderMe() {
    var all = C.Lib.items(S);
    var mastered = all.filter(C.Srs.isMastered).length;
    var m = S.meta;
    $("#me-sub").textContent = S.alarms.length + " 条报警 · " + S.notes.length +
      " 条笔记 · " + S.devices.length + " 台设备";

    var h = '<div class="statline"><span>已掌握 <b>' + mastered + "</b> / " + all.length + " 张卡</span>" +
      '<i class="statdiv"></i><span>连续 <b>' + (m.streak || 0) + "</b> 天</span></div>";

    h += '<div class="group"><div class="group-h">记忆</div><div class="card">' +
      '<div class="row"><span class="row-main"><span class="row-title" style="font-size:16px">每天最多加新卡</span></span>' +
      '<span class="stepper"><button data-act="daily-minus" aria-label="减少">−</button>' +
      '<span class="val">' + S.settings.dailyNew + "</span>" +
      '<button data-act="daily-plus" aria-label="增加">+</button></span></div>' +
      "</div></div>";

    h += '<div class="group"><div class="group-h">数据</div><div class="card">' +
      '<button class="row" data-act="export-json"><span class="row-main"><span class="row-title" style="font-size:16px">导出备份</span>' +
      '<span class="row-sub">JSON · 换手机、重装浏览器时用</span></span>' + ICON.chev + "</button>" +
      '<button class="row" data-act="export-text"><span class="row-main"><span class="row-title" style="font-size:16px">导出台账</span>' +
      '<span class="row-sub">纯文本 · 可以直接发群里</span></span>' + ICON.chev + "</button>" +
      '<button class="row" data-act="import"><span class="row-main"><span class="row-title" style="font-size:16px">导入备份</span>' +
      '<span class="row-sub">会覆盖当前数据</span></span>' + ICON.chev + "</button>" +
      '<button class="row" data-act="reset-seed"><span class="row-main"><span class="row-title" style="font-size:16px;color:var(--alert)">恢复预置内容</span>' +
      '<span class="row-sub">清空后重新装入预置的报警与设备</span></span>' + ICON.chev + "</button>" +
      "</div></div>";

    h += '<div class="doc-note">' +
      "<p>数据只存在这台设备的浏览器里，不上传、不联网。换手机或清理浏览器数据前，先导出备份。</p>" +
      "<p>预置的 12 条报警和 6 台设备是通用自动化产线场景，报警号、机台名、型号按自己产线改写后再用。</p>" +
      "<p>三维模型是示意几何体，用来认零件、记位置和装配关系，不代表实际尺寸。气缸那一台是剖视图——只有剖开才看得到里面的活塞和密封圈。</p></div>";

    $("#me-body").innerHTML = h;
  }

  /* ------------------------------------------------------------
     拍照建型
     ------------------------------------------------------------ */

  var PB = { src: null, img: null, poly: null, tol: 60, depth: 0.22, mode: "auto", view: null };

  function openPhotoBuilder() {
    var el = $("#photob");
    PB.src = (state.editing && state.editing.photo && state.editing.photo.src) || null;
    PB.img = null;
    PB.poly = (state.editing && state.editing.photo && state.editing.photo.poly) || null;
    PB.depth = (state.editing && state.editing.photo && state.editing.photo.depth) || 0.22;
    PB.tol = 60;
    PB.mode = "auto";
    el.innerHTML = pbHeader() + '<div class="pb-body" id="pbBody"></div>';
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    if (PB.src) loadPbSource(PB.src); else pbEmpty();
  }

  function pbHeader() {
    return '<div class="pb-head">' +
      '<button class="nav-btn" data-act="pb-close">取消</button>' +
      "<span>拍照建型</span>" +
      '<button class="nav-btn" data-act="pb-done">完成</button></div>';
  }

  function pbEmpty() {
    var body = $("#pbBody");
    body.innerHTML =
      '<div class="empty" style="padding-top:40px"><strong>拍一张设备正面照</strong>' +
      "背景尽量干净、设备占满画面。<br>拍完会自动抠出轮廓，挤出成一个能转的三维体。" +
      '<button class="btn" data-act="pb-pick">拍照 / 选图</button>' +
      '<button class="btn btn-gray" data-act="pb-demo" style="margin-top:10px">先用示例图看看效果</button></div>' +
      '<input type="file" id="pbFile" class="pb-file" accept="image/*">';
    $("#pbFile").addEventListener("change", onPickFile);
  }

  /* 示例图：画一台机器，给还没拍照的人先看效果 */
  function pbDemoImage() {
    var W = 800, H = 600;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");
    g.fillStyle = "#e2e5e9"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#3f4650"; g.fillRect(160, 250, 480, 290);
    g.fillStyle = "#59636f"; g.fillRect(190, 275, 190, 110);
    g.fillStyle = "#2c323a"; g.fillRect(415, 275, 195, 110);
    g.beginPath();
    g.moveTo(310, 250); g.lineTo(500, 250); g.lineTo(462, 150); g.lineTo(348, 150);
    g.closePath(); g.fillStyle = "#6c7786"; g.fill();
    g.fillStyle = "#8894a3"; g.fillRect(470, 72, 46, 82);
    g.fillStyle = "#2c323a"; g.fillRect(196, 540, 58, 40);
    g.fillRect(546, 540, 58, 40);
    g.fillStyle = "#f2c112"; g.fillRect(200, 410, 400, 26);
    return c.toDataURL("image/jpeg", 0.82);
  }

  function pbEditor() {
    var body = $("#pbBody");
    body.innerHTML =
      '<canvas id="pb2d" class="pb-cv"></canvas>' +
      '<div class="pb-ctl"><div class="rowlbl"><span>抠图容差</span><b id="pbTolV">' + PB.tol + "</b></div>" +
      '<input type="range" id="pbTol" min="10" max="190" value="' + PB.tol + '">' +
      '<div class="seg pb-seg" id="pbSeg">' +
      '<button data-act="pb-mode" data-m="auto" aria-selected="' + (PB.mode === "auto") + '">自动抠形</button>' +
      '<button data-act="pb-mode" data-m="rect" aria-selected="' + (PB.mode === "rect") + '">矩形框</button>' +
      "</div></div>" +
      '<div class="pb-ctl"><div class="rowlbl"><span>厚度</span><b id="pbDepV">' +
      Math.round(PB.depth * 100) + '%</b></div>' +
      '<input type="range" id="pbDep" min="6" max="60" value="' + Math.round(PB.depth * 100) + '"></div>' +
      '<canvas id="pb3d" class="pb-cv" style="height:190px;margin-top:12px"></canvas>' +
      '<p class="pb-hint">上面是抠出来的轮廓，下面是立体效果。拖动方块能转着看；抠得不顺就调容差，或者切成矩形框。</p>' +
      '<button class="btn btn-gray" data-act="pb-pick" style="margin-top:12px">重拍一张</button>' +
      '<input type="file" id="pbFile" class="pb-file" accept="image/*">';

    $("#pbFile").addEventListener("change", onPickFile);
    $("#pbTol").addEventListener("input", function () {
      PB.tol = +this.value;
      $("#pbTolV").textContent = PB.tol;
      if (PB.mode === "auto") reextract();
    });
    $("#pbDep").addEventListener("input", function () {
      PB.depth = +this.value / 100;
      $("#pbDepV").textContent = this.value + "%";
      rebuild3D();
    });
    draw2D();
    rebuild3D();
  }

  function onPickFile(e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = Math.min(900, img.naturalWidth);
        var h = Math.round(img.naturalHeight * w / img.naturalWidth);
        var cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        var data = cv.toDataURL("image/jpeg", 0.72);
        loadPbSource(data);
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(f);
  }

  function loadPbSource(src) {
    window.Photo3D.loadImage(src).then(function (img) {
      PB.src = src;
      PB.img = img;
      PB.poly = null;
      if (!document.getElementById("pb2d")) pbEditor();
      reextract(true);
    }).catch(function () { toast("这张图打不开"); });
  }

  function reextract(force) {
    if (!PB.img) return;
    if (PB.mode === "rect") {
      if (force || !PB.poly || PB.rect) PB.poly = PB.rectPts || window.Photo3D.rectPoly([0.06, 0.06, 0.88, 0.88]);
      PB.rect = true;
    } else {
      var r = window.Photo3D.extract(PB.img, PB.tol, 560);
      if (r) {
        PB.rectPts = window.Photo3D.rectPoly(bboxOf(r.pts));
        PB.poly = r.pts;
        PB.rect = false;
      } else if (!PB.poly) {
        PB.poly = window.Photo3D.rectPoly([0.06, 0.06, 0.88, 0.88]);
        PB.rect = true;
      }
    }
    draw2D();
    rebuild3D();
  }

  function bboxOf(pts) {
    var x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    pts.forEach(function (p) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    });
    return [x0, y0, Math.max(0.02, x1 - x0), Math.max(0.02, y1 - y0)];
  }

  function draw2D() {
    var cv = $("#pb2d");
    if (!cv || !PB.img) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = cv.clientWidth || 320;
    var h = Math.round(w * PB.img.naturalHeight / PB.img.naturalWidth);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = h + "px";
    var c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(PB.img, 0, 0, w, h);
    if (!PB.poly) return;

    c.beginPath();
    c.rect(0, 0, w, h);
    PB.poly.forEach(function (p, i) {
      if (i) c.lineTo(p[0] * w, p[1] * h); else c.moveTo(p[0] * w, p[1] * h);
    });
    c.closePath();
    c.fillStyle = "rgba(8,14,24,0.58)";
    c.fill("evenodd");

    c.beginPath();
    PB.poly.forEach(function (p, i) {
      if (i) c.lineTo(p[0] * w, p[1] * h); else c.moveTo(p[0] * w, p[1] * h);
    });
    c.closePath();
    c.strokeStyle = "#2f9e6a";
    c.lineWidth = 2;
    c.stroke();
  }

  function rebuild3D() {
    var cv = $("#pb3d");
    if (!cv || !PB.img || !PB.poly) return;
    if (PB.view) { PB.view.destroy(); PB.view = null; }
    var photo = {
      src: PB.src, w: PB.img.naturalWidth, h: PB.img.naturalHeight,
      poly: PB.poly, depth: PB.depth
    };
    var m = window.Photo3D.model(photo);
    m.cam.dist = 400;
    PB.view = window.GLView && window.GLView.available()
      ? window.GLView.mount(cv, m, { labels: false })
      : null;
  }

  function closePhotoBuilder(done) {
    if (PB.view) { PB.view.destroy(); PB.view = null; }
    var el = $("#photob");
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    if (done && PB.src && PB.poly) {
      state.editing.photo = {
        src: PB.src,
        w: PB.img.naturalWidth,
        h: PB.img.naturalHeight,
        poly: PB.poly.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; }),
        depth: PB.depth
      };
      state.editing.tpl = "photo";
      var row = $("#tpl-list");
      if (row) row.innerHTML = tplRows("photo");
      var lab = $("#photoState");
      if (lab) lab.textContent = "已拍 · 可以重拍或保存";
      toast("照片已转成三维，记得点保存");
    }
  }

  function repaintPbMode() {
    $$("#pbSeg button").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-m") === PB.mode ? "true" : "false");
    });
  }

  function val(sel) { var el = $(sel); return el ? el.value : ""; }
  function lines(s) {
    return String(s || "").split("\n").map(function (l) { return l.trim(); })
      .filter(function (l) { return l; });
  }
  function csv(s) {
    return String(s || "").split(/[,，、\n]/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l; });
  }

  function fs(label, inner) {
    return '<div class="fieldset"><label class="flabel">' + label + "</label>" + inner + "</div>";
  }

  function openEditor(kind, id) {
    state.editing = { kind: kind, id: id || null, risk: "mid", tpl: "head" };
    var body = "";

    if (kind === "alarm") {
      var a = id ? C.Lib.find(S, "alarm", id) : null;
      state.editing.risk = a ? a.risk : "mid";
      body = '<div class="sheet-head"><button class="nav-btn" data-act="close-sheet">取消</button>' +
        "<h2>" + (a ? "编辑报警" : "新建报警") + "</h2>" +
        '<button class="nav-btn" data-act="save-alarm">保存</button></div>' +
        '<div class="sheet-body">' +
        fs("报警号", '<input class="input mono" id="f-code" value="' + esc(a ? a.code : state.query.trim()) + '" placeholder="ALM 2207" spellcheck="false">') +
        fs("名称", '<input class="input" id="f-name" value="' + esc(a ? a.name : "") + '" placeholder="一句话说清是什么报警">') +
        fs("机台 / 工位", '<input class="input" id="f-machine" value="' + esc(a ? a.machine : (state.machine !== "全部" ? state.machine : "")) + '" placeholder="贴片头 3" list="machineList">') +
        machineList() +
        fs("影响", '<div class="seg" id="f-risk">' +
          ["high", "mid", "low"].map(function (r) {
            return '<button type="button" data-act="set-risk" data-r="' + r + '" aria-selected="' +
              (state.editing.risk === r) + '">' + riskText(r) + "</button>";
          }).join("") + "</div>") +
        fs("现象", '<textarea class="input" id="f-symptom" placeholder="HMI 上看到什么、机器怎么表现">' + esc(a ? a.symptom : "") + "</textarea>") +
        fs("可能原因（一行一条，按排查顺序）", '<textarea class="input" id="f-causes" placeholder="吸嘴堵塞&#10;气源压力低">' + esc(a ? a.causes.join("\n") : "") + "</textarea>") +
        fs("处理步骤（一行一步）", '<textarea class="input" id="f-steps" placeholder="看总气源压力表&#10;换新吸嘴再打一片">' + esc(a ? a.steps.map(function (s) { return s.t; }).join("\n") : "") + "</textarea>") +
        fs("备件与工具", '<input class="input" id="f-parts" value="' + esc(a ? a.parts.join("，") : "") + '" placeholder="吸嘴 CN065，滤芯">') +
        fs("标签", '<input class="input" id="f-tags" value="' + esc(a ? a.tags.join("，") : "") + '" placeholder="气动，取料">') +
        (a ? '<button class="btn btn-tint" data-act="delete-alarm" style="margin-top:4px;color:var(--alert)">删除这条报警</button>' : "") +
        "</div>";
    } else if (kind === "note") {
      var n = id ? C.Lib.find(S, "note", id) : null;
      body = '<div class="sheet-head"><button class="nav-btn" data-act="close-sheet">取消</button>' +
        "<h2>" + (n ? "编辑笔记" : "新建笔记") + "</h2>" +
        '<button class="nav-btn" data-act="save-note">保存</button></div>' +
        '<div class="sheet-body">' +
        fs("标题", '<input class="input" id="n-title" value="' + esc(n ? n.title : "") + '" placeholder="这件事下次怎么想起来">') +
        fs("正文", '<textarea class="input" id="n-body" style="min-height:160px" placeholder="写结果，也写为什么">' + esc(n ? n.body : "") + "</textarea>") +
        fs("标签", '<input class="input" id="n-tags" value="' + esc(n ? n.tags.join("，") : "") + '" placeholder="交接，气动">') +
        fs("关联机台", '<input class="input" id="n-machine" value="' + esc(n ? n.machine : "") + '" placeholder="贴片头 3" list="machineList">') +
        machineList() +
        '<button class="checkline" data-act="toggle-ncard" aria-pressed="' + (n ? n.card : false) + '">' +
        '<span class="box"><svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4.5 11.5 9 16l8.5-9.5"/></svg></span>' +
        "<span>设为记忆卡，跟报警一起排队复习</span></button>" +
        (n ? '<button class="btn btn-tint" data-act="delete-note" style="margin-top:16px;color:var(--alert)">删除这条笔记</button>' : "") +
        "</div>";
    } else {
      var v = id ? C.Lib.find(S, "device", id) : null;
      state.editing.tpl = v ? v.template : "head";
      state.editing.photo = v && v.photo ? v.photo : null;
      body = '<div class="sheet-head"><button class="nav-btn" data-act="close-sheet">取消</button>' +
        "<h2>" + (v ? "编辑设备" : "添加设备") + "</h2>" +
        '<button class="nav-btn" data-act="save-device">保存</button></div>' +
        '<div class="sheet-body">' +
        fs("设备名称", '<input class="input" id="d-name" value="' + esc(v ? v.name : "") + '" placeholder="贴片头 3">') +
        fs("型号", '<input class="input" id="d-model" value="' + esc(v ? v.model : "") + '" placeholder="SIPLACE TX">') +
        fs("工位 / 线别", '<input class="input" id="d-station" value="' + esc(v ? v.station : "") + '" placeholder="SMT 段 · 3 号机">') +
        '<div class="flabel" style="margin-top:4px">结构模板</div>' +
        '<div class="card" id="tpl-list">' + tplRows(state.editing.tpl) + "</div>" +
        '<div class="group-f">选一个最接近的模板，结构图和零件知识都跟着模板走；没有对应模板就选「拍照建型」。</div>' +
        '<div id="photoBox"' + (state.editing.tpl === "photo" ? "" : " hidden") + ">" +
        '<button class="btn" data-act="open-photo" style="margin-top:12px">' +
        (state.editing.photo ? "重拍 / 重新抠形" : "拍照 / 选图") + "</button>" +
        '<div class="group-f" id="photoState" style="text-align:center">' +
        (state.editing.photo ? "已拍 · 保存后生效" : "还没有照片") + "</div></div>" +
        (v ? '<button class="btn btn-tint" data-act="delete-device" style="margin-top:16px;color:var(--alert)">删除这台设备</button>' : "") +
        "</div>";
    }
    openSheet('<div class="scrim" data-act="close-sheet"></div><div class="panel">' + body + "</div>");
    var first = $("#f-code") || $("#n-title") || $("#d-name");
    if (first) setTimeout(function () { first.focus(); }, 320);
  }

  function tplRows(cur) {
    var cam = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#5F5F64" stroke-width="1.6" stroke-linejoin="round">' +
      '<path d="M3 8.5h4l1.6-2.5h6.8L17 8.5h4V18H3z"/><circle cx="12" cy="13" r="3.2"/></svg>';
    var html = '<button class="row" data-act="pick-tpl" data-k="photo">' +
      '<span class="dev-thumb" style="display:flex;align-items:center;justify-content:center">' + cam + "</span>" +
      '<span class="row-main"><span class="row-title" style="font-size:16px">拍照建型</span>' +
      '<span class="row-sub">用一张照片挤出三维体</span></span>' +
      '<span class="part-check' + (cur === "photo" ? " on" : "") + '">' + ICON.check + "</span></button>";
    return html + window.DEVICE_ORDER.map(function (k) {
      var t = window.DEVICES[k];
      return '<button class="row" data-act="pick-tpl" data-k="' + k + '">' +
        '<span class="dev-thumb thumb">' + t.svg + "</span>" +
        '<span class="row-main"><span class="row-title" style="font-size:16px">' + esc(t.name) + "</span>" +
        '<span class="row-sub">' + t.parts.length + " 个部件</span></span>" +
        '<span class="part-check' + (cur === k ? " on" : "") + '">' + ICON.check + "</span></button>";
    }).join("");
  }

  function machineList() {
    var names = {};
    S.alarms.forEach(function (a) { if (a.machine) names[a.machine] = 1; });
    S.devices.forEach(function (v) {
      if (v.name) names[v.name] = 1;
      if (v.station) names[v.station] = 1;
    });
    var list = Object.keys(names);
    if (!list.length) return "";
    return '<datalist id="machineList">' + list.map(function (m) {
      return '<option value="' + esc(m) + '">';
    }).join("") + "</datalist>";
  }

  function saveAlarm() {
    var code = val("#f-code").trim();
    var name = val("#f-name").trim();
    if (!code && !name) { toast("报警号和名称至少填一个"); return; }

    var id = state.editing.id;
    var a = id ? C.Lib.find(S, "alarm", id) : null;
    var prev = a ? a.steps : [];
    var steps = lines(val("#f-steps")).map(function (t, i) {
      var old = prev[i];
      return { t: t, done: !!(old && old.t === t && old.done) };
    });

    if (!a) {
      a = { id: C.uid(), runs: [], created: Date.now(), srs: C.blankSrs(), steps: [], causes: [], parts: [], tags: [] };
      S.alarms.unshift(a);
    }

    a.code = code || "未编号";
    a.name = name || code;
    a.machine = val("#f-machine").trim();
    a.risk = state.editing.risk;
    a.symptom = val("#f-symptom").trim();
    a.causes = lines(val("#f-causes"));
    a.steps = steps;
    a.parts = csv(val("#f-parts"));
    a.tags = csv(val("#f-tags"));
    a.updated = Date.now();

    save();
    closeSheet();
    renderHome();
    if (state.stack.length) renderPush();
    toast("已保存。下次输「" + a.code + "」就能查到。");
  }

  function saveNote() {
    var title = val("#n-title").trim();
    if (!title) { toast("标题不能空"); return; }
    var id = state.editing.id;
    var n = id ? C.Lib.find(S, "note", id) : null;
    var wasCard = n ? n.card : false;

    if (!n) { n = { id: C.uid(), created: Date.now(), srs: C.blankSrs() }; S.notes.unshift(n); }

    n.title = title;
    n.body = val("#n-body");
    n.tags = csv(val("#n-tags"));
    n.machine = val("#n-machine").trim();
    n.updated = Date.now();

    var line = $("#sheet .checkline");
    var want = line ? line.getAttribute("aria-pressed") === "true" : n.card;
    if (want && !wasCard) n.srs = C.blankSrs();
    n.card = want;

    save();
    closeSheet();
    renderNotes();
    if (state.stack.length) renderPush();
    updateBadge();
    toast("已保存");
  }

  function saveDevice() {
    var name = val("#d-name").trim();
    if (!name) { toast("设备名称不能空"); return; }
    if (state.editing.tpl === "photo" && !state.editing.photo) {
      toast("先拍一张照片，再保存");
      return;
    }
    var id = state.editing.id;
    var v = id ? C.Lib.find(S, "device", id) : null;
    if (!v) {
      v = { id: C.uid(), learned: {}, created: Date.now() };
      S.devices.push(v);
    }
    v.name = name;
    v.model = val("#d-model").trim();
    v.station = val("#d-station").trim();
    v.template = state.editing.tpl;
    v.photo = state.editing.tpl === "photo" ? state.editing.photo : null;
    v.updated = Date.now();

    save();
    closeSheet();
    renderDevices();
    if (state.stack.length) renderPush();
    toast("已保存");
  }

  /* ------------------------------------------------------------
     导入导出
     ------------------------------------------------------------ */

  function refreshAll() {
    closePushAll();
    renderTab();
    updateBadge();
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var next = C.Store.normalize(JSON.parse(String(reader.result)));
        if (!next.alarms.length && !next.notes.length && !next.devices.length) throw new Error("empty");
        S = next;
        save();
        refreshAll();
        toast("已导入 " + S.alarms.length + " 条报警、" + S.devices.length + " 台设备");
      } catch (e) {
        toast("这个文件读不出来，确认是机台本导出的 JSON");
      }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------
     事件
     ------------------------------------------------------------ */

  function bind() {
    D.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act], [data-tab]");
      if (!t) return;

      if (t.hasAttribute("data-tab")) { setTab(t.getAttribute("data-tab")); return; }

      var act = t.getAttribute("data-act");

      switch (act) {
        case "open-alarm": push({ v: "alarm", id: t.getAttribute("data-id") }); break;
        case "open-device":
          state.devTab = "map";
          state.playing = false;
          push({ v: "device", id: t.getAttribute("data-id") });
          break;
        case "open-note": push({ v: "note", id: t.getAttribute("data-id") }); break;
        case "pop": pop(); break;
        case "close-sheet": closeSheet(); break;

        case "machine":
          state.machine = t.getAttribute("data-m");
          renderHome();
          break;

        case "dev-tab":
          state.devTab = t.getAttribute("data-k");
          repaintDeviceBody();
          break;

        case "hot": openPart(t.getAttribute("data-k")); break;

        case "play": {
          state.playing = !state.playing;
          var svg = $("#dev-body .dsvg");
          if (svg) svg.classList.toggle("play", state.playing);
          var pb = $('[data-act="play"]');
          if (pb) pb.textContent = state.playing ? "停止演示" : "运行演示";
          break;
        }

        case "v-in": if (state.viewer) state.viewer.zoom(0.78); break;
        case "v-out": if (state.viewer) state.viewer.zoom(1.28); break;
        case "v-reset": if (state.viewer) state.viewer.reset(); break;
        case "v-play": {
          state.playing = !state.playing;
          t.setAttribute("aria-pressed", String(state.playing));
          t.textContent = state.playing ? "停止" : "运行";
          if (state.viewer && state.viewer.play) state.viewer.play(state.playing);
          break;
        }
        case "v-label":
          state.labels = !state.labels;
          t.setAttribute("aria-pressed", String(state.labels));
          if (state.viewer) state.viewer.setLabels(state.labels);
          break;

        case "toggle-learned": {
          var top = state.stack[state.stack.length - 1];
          if (!top || top.v !== "device") break;
          var dv = C.Lib.find(S, "device", top.id);
          var k = t.getAttribute("data-k");
          C.Devs.toggle(dv, k);
          save();
          var on = C.Devs.isLearned(dv, k);
          t.textContent = on ? "已学会 · 取消标记" : "标记已学";
          t.className = "btn " + (on ? "btn-gray" : "");
          var lbl = $("#dev-learned");
          if (lbl) lbl.textContent = "已学 " + C.Devs.learnedCount(dv) + " / " + C.Devs.parts(dv).length;
          repaintDeviceBody();
          renderDevices();
          break;
        }

        case "step": {
          var tp = state.stack[state.stack.length - 1];
          if (!tp || tp.v !== "alarm") break;
          var al = C.Lib.find(S, "alarm", tp.id);
          if (!al) break;
          var i = +t.getAttribute("data-i");
          al.steps[i].done = !al.steps[i].done;
          t.setAttribute("aria-pressed", String(al.steps[i].done));
          var done = al.steps.filter(function (s) { return s.done; }).length;
          var btn = $('#push [data-act="record"]');
          if (btn) {
            btn.disabled = done === 0;
            btn.classList.remove("is-flash");
            btn.textContent = "记录这次处理";
          }
          var hint = $("#foot-hint");
          if (hint) {
            hint.textContent = done === 0 ? "至少勾一步，才能记录这次处理。"
              : done >= al.steps.length ? "全部步骤已勾完。记录后这张卡会回到复习队列。"
                : "已勾 " + done + " / " + al.steps.length + " 步。";
          }
          save();
          break;
        }

        case "record": recordRun(); break;

        case "start-drill": {
          var q = C.Lib.queue(S);
          startDrill(q.map(function (it) { return { kind: it.kind, id: it.id }; }));
          break;
        }
        case "random-drill": {
          var arr = C.Lib.items(S).slice();
          for (var n2 = arr.length - 1; n2 > 0; n2--) {
            var j = Math.floor(Math.random() * (n2 + 1));
            var tmp = arr[n2]; arr[n2] = arr[j]; arr[j] = tmp;
          }
          startDrill(arr.slice(0, 5).map(function (it) { return { kind: it.kind, id: it.id }; }));
          break;
        }
        case "drill-exit": endDrill(); break;
        case "reveal": state.drill.revealed = true; paintDrill(); break;
        case "grade": gradeCard(+t.getAttribute("data-g")); break;

        case "toggle-card": {
          var tn = state.stack[state.stack.length - 1];
          if (!tn || tn.v !== "note") break;
          var nt = C.Lib.find(S, "note", tn.id);
          if (!nt) break;
          nt.card = !nt.card;
          if (nt.card && C.Srs.isNew(nt)) nt.srs = C.blankSrs();
          nt.updated = Date.now();
          save();
          renderPush();
          renderNotes();
          updateBadge();
          toast(nt.card ? "已排进记忆队列" : "已移出记忆队列");
          break;
        }

        case "new-alarm": openEditor("alarm", null); break;
        case "new-note": openEditor("note", null); break;
        case "new-device": openEditor("device", null); break;

        case "edit-alarm": openEditor("alarm", state.stack[state.stack.length - 1].id); break;
        case "edit-note": openEditor("note", state.stack[state.stack.length - 1].id); break;
        case "edit-device": openEditor("device", state.stack[state.stack.length - 1].id); break;

        case "save-alarm": saveAlarm(); break;
        case "save-note": saveNote(); break;
        case "save-device": saveDevice(); break;

        case "set-risk":
          state.editing.risk = t.getAttribute("data-r");
          $$("#f-risk button").forEach(function (b) {
            b.setAttribute("aria-selected", String(b.getAttribute("data-r") === state.editing.risk));
          });
          break;

        case "pick-tpl":
          state.editing.tpl = t.getAttribute("data-k");
          $("#tpl-list").innerHTML = tplRows(state.editing.tpl);
          var pbx = $("#photoBox");
          if (pbx) pbx.hidden = state.editing.tpl !== "photo";
          break;

        case "toggle-ncard": {
          var line = $("#sheet .checkline");
          line.setAttribute("aria-pressed", line.getAttribute("aria-pressed") === "true" ? "false" : "true");
          break;
        }

        case "open-photo": openPhotoBuilder(); break;
        case "pb-close": closePhotoBuilder(false); break;
        case "pb-done": closePhotoBuilder(true); break;
        case "pb-pick": { var pf = $("#pbFile"); if (pf) pf.click(); break; }
        case "pb-demo": loadPbSource(pbDemoImage()); break;
        case "pb-mode":
          PB.mode = t.getAttribute("data-m");
          repaintPbMode();
          reextract(true);
          break;

        case "delete-alarm": {
          var da = C.Lib.find(S, "alarm", state.editing.id);
          if (!da || !confirm("删除「" + da.name + "」？处理记录和复习进度会一起删掉。")) break;
          S.alarms = S.alarms.filter(function (x) { return x.id !== da.id; });
          save(); closeSheet(); closePushAll(); renderHome(); updateBadge();
          toast("已删除");
          break;
        }
        case "delete-note": {
          var dn = C.Lib.find(S, "note", state.editing.id);
          if (!dn || !confirm("删除「" + dn.title + "」？")) break;
          S.notes = S.notes.filter(function (x) { return x.id !== dn.id; });
          save(); closeSheet(); closePushAll(); renderNotes(); updateBadge();
          toast("已删除");
          break;
        }
        case "delete-device": {
          var dd = C.Lib.find(S, "device", state.editing.id);
          if (!dd || !confirm("删除「" + dd.name + "」？学习进度会一起删掉。")) break;
          S.devices = S.devices.filter(function (x) { return x.id !== dd.id; });
          save(); closeSheet(); closePushAll(); renderDevices();
          toast("已删除");
          break;
        }

        case "daily-minus":
          S.settings.dailyNew = Math.max(0, S.settings.dailyNew - 1);
          save(); renderMe(); renderMemo();
          break;
        case "daily-plus":
          S.settings.dailyNew = Math.min(30, S.settings.dailyNew + 1);
          save(); renderMe(); renderMemo();
          break;

        case "export-json": C.Backup.json(S); toast("备份已导出"); break;
        case "export-text": C.Backup.text(S); toast("台账已导出"); break;
        case "import": $("#importFile").click(); break;
        case "reset-seed":
          if (!confirm("清空当前所有报警、笔记和设备，恢复预置内容？")) break;
          S = C.Store.seed();
          refreshAll();
          toast("已恢复预置内容");
          break;
      }
    });

    var q = $("#q");
    q.addEventListener("input", function () {
      state.query = q.value;
      $("#searchbar").classList.toggle("has", q.value.length > 0);
      renderHomeList();
    });
    q.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var first = $("#home-list .row");
        if (first) { first.click(); q.blur(); }
      }
      if (e.key === "Escape" && q.value) {
        e.stopPropagation();
        q.value = ""; state.query = "";
        $("#searchbar").classList.remove("has");
        renderHomeList();
      }
    });
    $("#qclear").addEventListener("click", function () {
      q.value = ""; state.query = "";
      $("#searchbar").classList.remove("has");
      renderHomeList();
      q.focus();
    });

    $("#importFile").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importFile(f);
      e.target.value = "";
    });

    D.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if ($("#sheet").classList.contains("open")) { closeSheet(); return; }
        if ($("#drill").classList.contains("open")) { endDrill(); return; }
        if (state.stack.length) { pop(); return; }
      }
      if (e.key === "/" && !/input|textarea/i.test(e.target.tagName) && state.tab === "home") {
        e.preventDefault();
        q.focus();
      }
    });
  }

  /* ------------------------------------------------------------
     启动
     ------------------------------------------------------------ */

  function boot() {
    bind();
    $$(".screen[data-tab]").forEach(scrollWatch);
    setTab("home");
    if (!storageOK()) {
      toast("这台浏览器不让本地存储，改动不会保存。换 Chrome 或 Safari 打开试试。", 9000);
    }
  }

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
