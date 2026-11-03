/* 机台本 — 数据与调度
   本地存储、条目派生、间隔重复。无依赖，file:// 直接可用。 */
(function (global) {
  "use strict";

  var KEY = "jitai-ben/v1";
  var DAY = 86400000;

  /* ---------- 基础 ---------- */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  function blankSrs() {
    return { ivl: 0, ease: 2.4, reps: 0, lapses: 0, due: 0, last: 0, lastGrade: -1 };
  }

  function todayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }

  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* ---------- 存储 ---------- */

  var Store = {
    key: KEY,

    blank: function () {
      return {
        v: 2,
        alarms: [],
        notes: [],
        devices: [],
        settings: { dailyNew: 5 },
        meta: { streak: 0, lastDay: null, reviewsToday: 0, day: null, totalReviews: 0 }
      };
    },

    normalize: function (raw) {
      var d = Store.blank();
      if (!raw || typeof raw !== "object") return d;
      if (Array.isArray(raw.alarms)) d.alarms = raw.alarms;
      if (Array.isArray(raw.notes)) d.notes = raw.notes;
      if (Array.isArray(raw.devices)) d.devices = raw.devices;
      if (raw.settings) d.settings = Object.assign(d.settings, raw.settings);
      if (raw.meta) d.meta = Object.assign(d.meta, raw.meta);

      d.devices.forEach(function (v) {
        v.id = v.id || uid();
        v.template = global.DEVICES && global.DEVICES[v.template] ? v.template : "head";
        v.learned = v.learned && typeof v.learned === "object" ? v.learned : {};
        v.created = v.created || Date.now();
        v.updated = v.updated || v.created;
      });

      d.alarms.forEach(function (a) {
        a.id = a.id || uid();
        a.steps = (a.steps || []).map(function (s) {
          return typeof s === "string"
            ? { t: s, done: false }
            : { t: s.t || "", done: !!s.done };
        });
        a.causes = Array.isArray(a.causes) ? a.causes : [];
        a.parts = Array.isArray(a.parts) ? a.parts : [];
        a.tags = Array.isArray(a.tags) ? a.tags : [];
        a.runs = Array.isArray(a.runs) ? a.runs : [];
        a.risk = a.risk || "mid";
        a.created = a.created || Date.now();
        a.updated = a.updated || a.created;
        a.srs = Object.assign(blankSrs(), a.srs || {});
      });

      d.notes.forEach(function (n) {
        n.id = n.id || uid();
        n.tags = Array.isArray(n.tags) ? n.tags : [];
        n.card = !!n.card;
        n.created = n.created || Date.now();
        n.updated = n.updated || n.created;
        n.srs = Object.assign(blankSrs(), n.srs || {});
      });

      return d;
    },

    load: function () {
      var raw = null;
      try {
        raw = JSON.parse(global.localStorage.getItem(KEY) || "null");
      } catch (e) {
        raw = null;
      }
      if (!raw) return Store.seed();
      return Store.normalize(raw);
    },

    seed: function () {
      var seed = global.SEED || { alarms: [], notes: [] };
      var now = Date.now();
      var d = Store.blank();

      d.alarms = seed.alarms.map(function (a, i) {
        return {
          id: uid(),
          code: a.code,
          name: a.name,
          machine: a.machine || "",
          risk: a.risk || "mid",
          symptom: a.symptom || "",
          causes: a.causes || [],
          steps: (a.steps || []).map(function (s) { return { t: s, done: false }; }),
          parts: a.parts || [],
          tags: a.tags || [],
          runs: i === 0
            ? [{ ts: now - 2 * DAY - 3600000, steps: 5, note: "" }]
            : [],
          created: now - (26 - i) * DAY,
          updated: now - (i < 3 ? i * 2 + 1 : i + 6) * DAY,
          srs: Object.assign(blankSrs(), i === 0 ? {
            ivl: 3, reps: 2, ease: 2.4, due: now - 3600000, last: now - 3 * DAY, lastGrade: 2
          } : i === 3 ? {
            ivl: 8, reps: 3, ease: 2.5, due: now - 2 * 3600000, last: now - 8 * DAY, lastGrade: 2
          } : i === 6 ? {
            ivl: 24, reps: 5, ease: 2.6, due: now + 2 * DAY, last: now - 24 * DAY, lastGrade: 3
          } : {})
        };
      });

      d.notes = seed.notes.map(function (n, i) {
        return {
          id: uid(),
          title: n.title,
          body: n.body,
          tags: n.tags || [],
          machine: n.machine || "",
          card: !!n.card,
          created: now - (9 - i) * DAY,
          updated: now - (9 - i) * DAY,
          srs: Object.assign(blankSrs(), n.card && i === 0 ? {
            ivl: 2, reps: 2, ease: 2.4, due: now - 1800000, last: now - 2 * DAY, lastGrade: 1
          } : {})
        };
      });

      d.devices = (seed.devices || []).map(function (v, i) {
        return {
          id: uid(),
          name: v.name,
          model: v.model || "",
          station: v.station || "",
          template: v.template,
          note: v.note || "",
          learned: {},
          created: now - (12 - i) * DAY,
          updated: now - (12 - i) * DAY
        };
      });

      d.meta.streak = 4;
      d.meta.lastDay = todayKey(new Date(now - DAY));
      d.meta.day = todayKey();
      d.meta.reviewsToday = 3;
      d.meta.totalReviews = 38;

      Store.save(d);
      return d;
    },

    save: function (d) {
      try {
        global.localStorage.setItem(KEY, JSON.stringify(d));
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  /* ---------- 间隔重复 ---------- */

  /* 队列里的包装条目不直接带 srs，统一从它指向的原条目取 */
  function raw(it) { return it && it.ref ? it.ref : it; }

  var Srs = {
    /* grade: 0 忘了 / 1 模糊 / 2 记得 / 3 很熟 */
    schedule: function (prev, grade) {
      var now = Date.now();
      var s = Object.assign(blankSrs(), prev || {});
      var ivl = s.ivl, ease = s.ease, reps = s.reps, lapses = s.lapses, due;

      if (grade === 0) {
        lapses += 1;
        reps = 0;
        ivl = 0;
        ease = clamp(ease - 0.22, 1.3, 2.8);
        due = now + 10 * 60000;
      } else {
        reps += 1;
        if (reps === 1) ivl = grade === 3 ? 2 : 1;
        else if (reps === 2) ivl = grade === 1 ? 2 : grade === 2 ? 3 : 4;
        else ivl = Math.round(ivl * (grade === 1 ? 1.15 : grade === 2 ? ease : ease * 1.28));
        ease = clamp(ease + (grade - 2) * 0.09, 1.3, 2.8);
        ivl = clamp(ivl, 1, 240);
        due = startOfDay(now) + ivl * DAY + 8 * 3600000;
        if (due < now) due = now + 60 * 60000;
      }

      return {
        ivl: ivl, ease: ease, reps: reps, lapses: lapses,
        due: due, last: now, lastGrade: grade
      };
    },

    /* 四档按钮上的间隔预览 */
    preview: function (prev, grade) {
      var n = Srs.schedule(prev, grade);
      if (grade === 0) return "10 分钟";
      var d = n.ivl;
      if (d < 1) return "1 天";
      if (d < 30) return d + " 天";
      return Math.round(d / 30) + " 个月";
    },

    isNew: function (it) {
      var r = raw(it);
      return !r.srs || !r.srs.last;
    },

    isDue: function (it) {
      var r = raw(it);
      return !!(r.srs && r.srs.last && r.srs.due <= Date.now());
    },

    isMastered: function (it) {
      var r = raw(it);
      return !!(r.srs && r.srs.reps >= 4 && r.srs.ivl >= 21);
    },

    /* 状态词：文字承载语义，颜色只做强化 */
    status: function (it) {
      if (Srs.isNew(it)) return { key: "new", text: "未开始" };
      if (Srs.isMastered(it)) return { key: "done", text: "已掌握" };
      if (Srs.isDue(it)) return { key: "due", text: "待复习" };
      return { key: "learn", text: "复习中" };
    },

    label: function (grade) {
      return ["忘了", "模糊", "记得", "很熟"][grade] || "";
    }
  };

  /* ---------- 派生条目 ---------- */

  function alarmItem(a) {
    return {
      kind: "alarm", id: a.id, ref: a,
      code: a.code, name: a.name, machine: a.machine,
      front: a.symptom,
      back: (a.steps || []).map(function (s) { return s.t; })
    };
  }

  function noteItem(n) {
    return {
      kind: "note", id: n.id, ref: n,
      code: "笔记", name: n.title, machine: n.machine || "",
      front: "",
      back: String(n.body || "").split("\n").filter(Boolean)
    };
  }

  var Lib = {
    items: function (d) {
      var out = d.alarms.map(alarmItem);
      d.notes.forEach(function (n) { if (n.card) out.push(noteItem(n)); });
      return out;
    },

    find: function (d, kind, id) {
      var arr = kind === "note" ? d.notes : kind === "device" ? d.devices : d.alarms;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
      return null;
    },

    /* 记忆队列：到期在前，新卡按每日上限补在后面 */
    queue: function (d) {
      var now = Date.now();
      var all = Lib.items(d);
      var due = all.filter(Srs.isDue).sort(function (a, b) { return a.ref.srs.due - b.ref.srs.due; });
      var fresh = all.filter(Srs.isNew).sort(function (a, b) {
        return (a.ref.created || 0) - (b.ref.created || 0);
      }).slice(0, Math.max(0, d.settings.dailyNew));
      return due.concat(fresh);
    },

    dueCount: function (d) {
      return Lib.items(d).filter(Srs.isDue).length;
    },

    /* 搜索：码值优先，其次名称、现象、原因、备件、标签、机台 */
    search: function (d, q, machine) {
      var query = String(q || "").trim().toLowerCase();
      var bare = query.replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
      var rows = d.alarms.slice();

      if (machine && machine !== "全部") {
        rows = rows.filter(function (a) { return a.machine === machine; });
      }
      if (!query) {
        return rows.sort(function (a, b) {
          var sa = Srs.isDue(a) ? 0 : 1, sb = Srs.isDue(b) ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return (b.updated || 0) - (a.updated || 0);
        }).map(function (a) { return { a: a, score: 0 }; });
      }

      var out = [];
      rows.forEach(function (a) {
        var code = String(a.code || "").toLowerCase();
        var codeBare = code.replace(/[^a-z0-9]/g, "");
        var hay = [a.name, a.symptom, a.machine, (a.tags || []).join(" "),
          (a.causes || []).join(" "), (a.parts || []).join(" "),
          (a.steps || []).map(function (s) { return s.t; }).join(" ")]
          .join(" ").toLowerCase();
        var score = -1;

        if (bare && codeBare && codeBare.indexOf(bare) === 0) score = 100;
        else if (bare && codeBare && codeBare.indexOf(bare) > -1) score = 80;
        else if (code.indexOf(query) > -1) score = 70;
        else if (String(a.name).toLowerCase().indexOf(query) > -1) score = 60;
        else if (hay.indexOf(query) > -1) score = 40;
        else if (bare.length > 1 && hay.indexOf(bare) > -1) score = 30;

        if (score >= 0) out.push({ a: a, score: score });
      });

      return out.sort(function (x, y) {
        if (y.score !== x.score) return y.score - x.score;
        return (y.a.updated || 0) - (x.a.updated || 0);
      });
    },

    machines: function (d) {
      var seen = {};
      d.alarms.forEach(function (a) { if (a.machine) seen[a.machine] = (seen[a.machine] || 0) + 1; });
      return Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a]; })
        .map(function (m) { return { name: m, count: seen[m] }; });
    }
  };

  /* ---------- 格式化 ---------- */

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  var Fmt = {
    /* 相对时间：刚刚 / 今天 21:14 / 昨天 / 3 天前 / 10-28 */
    ago: function (ts) {
      if (!ts) return "";
      var now = Date.now(), d = new Date(ts);
      var diff = now - ts;
      if (diff < 60000) return "刚刚";
      if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
      var t = startOfDay(now), y = t - DAY;
      if (ts >= t) return "今天 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
      if (ts >= y) return "昨天 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
      if (diff < 7 * DAY) return Math.floor(diff / DAY) + " 天前";
      return (d.getMonth() + 1) + "-" + pad(d.getDate());
    },

    stamp: function (ts) {
      var d = new Date(ts);
      return (d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
        pad(d.getHours()) + ":" + pad(d.getMinutes());
    },

    due: function (it) {
      if (!it.srs || !it.srs.last) return "未排";
      var diff = it.srs.due - Date.now();
      if (diff <= 0) return "到期";
      if (diff < DAY) return Math.round(diff / 3600000) + " 小时后";
      return Math.round(diff / DAY) + " 天后";
    }
  };

  /* ---------- 导出 ---------- */

  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  var Backup = {
    json: function (d) {
      var stamp = Fmt.stamp(Date.now()).replace(/[^\d]/g, "");
      download("机台本备份-" + stamp + ".json", JSON.stringify(d, null, 2), "application/json");
    },
    text: function (d) {
      var lines = ["机台本 · 报警台账", "导出 " + Fmt.stamp(Date.now()), ""];
      d.alarms.forEach(function (a, i) {
        lines.push((i + 1) + ". [" + a.code + "] " + a.name + "　" + (a.machine || "未填机台"));
        lines.push("   现象：" + a.symptom);
        if (a.causes.length) {
          lines.push("   可能原因：");
          a.causes.forEach(function (c, j) { lines.push("     " + (j + 1) + ") " + c); });
        }
        if (a.steps.length) {
          lines.push("   处理步骤：");
          a.steps.forEach(function (s, j) { lines.push("     " + (j + 1) + ") " + s.t); });
        }
        if (a.parts.length) lines.push("   备件：" + a.parts.join("、"));
        if (a.runs.length) lines.push("   处理记录：" + a.runs.length + " 次，最近 " + Fmt.stamp(a.runs[a.runs.length - 1].ts));
        lines.push("");
      });
      d.notes.forEach(function (n) {
        lines.push("【笔记】" + n.title);
        lines.push(n.body.split("\n").map(function (l) { return "   " + l; }).join("\n"));
        lines.push("");
      });
      download("机台本台账-" + Fmt.stamp(Date.now()).replace(/[^\d]/g, "") + ".txt", lines.join("\n"));
    }
  };

  /* ---------- 设备 ---------- */

  var Devs = {
    tpl: function (v) {
      var lib = global.DEVICES || {};
      return lib[v && v.template] || null;
    },
    parts: function (v) {
      var t = Devs.tpl(v);
      return t ? t.parts : [];
    },
    part: function (v, key) {
      var list = Devs.parts(v);
      for (var i = 0; i < list.length; i++) if (list[i].k === key) return list[i];
      return null;
    },
    learnedCount: function (v) {
      var n = 0;
      Devs.parts(v).forEach(function (p) { if (v.learned && v.learned[p.k]) n++; });
      return n;
    },
    isLearned: function (v, key) { return !!(v.learned && v.learned[key]); },
    toggle: function (v, key) {
      if (!v.learned) v.learned = {};
      v.learned[key] = !v.learned[key];
      v.updated = Date.now();
    },
    /* 报警和笔记上写的是机台名，按名字或工位对上 */
    related: function (d, v) {
      var names = [v.name, v.station].filter(Boolean);
      return {
        alarms: d.alarms.filter(function (a) { return names.indexOf(a.machine) > -1; }),
        notes: d.notes.filter(function (n) { return names.indexOf(n.machine) > -1; })
      };
    }
  };

  global.Core = {
    uid: uid, DAY: DAY, Store: Store, Srs: Srs, Lib: Lib, Fmt: Fmt,
    Backup: Backup, blankSrs: blankSrs, todayKey: todayKey, clamp: clamp, Devs: Devs
  };
})(window);
