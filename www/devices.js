/* 机台本 — 设备结构库
   五套轴测图（三维坐标生成，自动适配画幅）+ 气缸剖面图。
   图是示意图，不是 CAD、不是实拍；用来认零件、记位置和运动关系。
   部件的 an:[x,y,z] 是三维锚点，构建时换算成热区百分比 at。 */

(function () {
  "use strict";

  var KX = 0.98, KY = 0.98, SY = 0.30, SZ = 0.92;
  var W = 320, H = 174, PAD = 8;

  /* ---------- 投影器 ---------- */

  function autofit(bb) {
    var dx = [], dy = [], x, y, z, i;
    for (i = 0; i < 8; i++) {
      x = (i & 1) ? bb[3] : bb[0];
      y = (i & 2) ? bb[4] : bb[1];
      z = (i & 4) ? bb[5] : bb[2];
      dx.push(x - y);
      dy.push((x + y) * SY - z * SZ);
    }
    var x0 = Math.min.apply(null, dx), x1 = Math.max.apply(null, dx);
    var y0 = Math.min.apply(null, dy), y1 = Math.max.apply(null, dy);
    var sc = Math.min((W - 2 * PAD) / ((x1 - x0) * KX), (H - 2 * PAD) / (y1 - y0));
    return {
      sc: sc,
      ox: W / 2 - (x0 + x1) / 2 * KX * sc,
      oy: H / 2 - (y0 + y1) / 2 * sc
    };
  }

  function iso(t) {
    var sc = t.sc, ox = t.ox, oy = t.oy;
    var a = KX * sc, b = SY * sc, c = -KY * sc, d = SY * sc, e = SZ * sc;

    function P(x, y, z) { return [ox + (x - y) * a, oy + (x + y) * b - z * e]; }
    function n(v) { return Math.round(v * 10) / 10; }
    function pj(p) { return n(p[0]) + "," + n(p[1]); }
    function poly(pts, cls) { return '<polygon class="' + cls + '" points="' + pts.map(pj).join(" ") + '"/>'; }

    /* 立方体：顶面 / +x 面 / +y 面 */
    function box(x, y, z, w, dd, h, tone) {
      tone = tone || "g";
      var A = P(x, y, z + h), B = P(x + w, y, z + h), C = P(x + w, y + dd, z + h), D = P(x, y + dd, z + h);
      var F = P(x + w, y, z), G = P(x + w, y + dd, z), Hh = P(x, y + dd, z);
      return poly([A, B, C, D], tone + "t") +
        poly([B, C, G, F], tone + "x") +
        poly([C, D, Hh, G], tone + "y");
    }

    /* 竖直圆盘（水平面），用于料盘顶、环形光 */
    function discXY(x, y, z, r, tone) {
      tone = tone || "g";
      var c0 = P(x, y, z);
      return '<circle class="' + tone + 't" cx="0" cy="0" r="' + r + '" transform="matrix(' +
        n(a) + "," + n(b) + "," + n(c) + "," + n(d) + "," + n(c0[0]) + "," + n(c0[1]) + ')"/>';
    }

    /* 立着的圆盘（x-z 平面），用于料盘、带轮 */
    function discXZ(x, y, z, r, tone) {
      tone = tone || "g";
      var c0 = P(x, y, z);
      return '<circle class="' + tone + 'x" cx="0" cy="0" r="' + r + '" transform="matrix(' +
        n(a) + "," + n(b) + ",0," + n(-e) + "," + n(c0[0]) + "," + n(c0[1]) + ')"/>';
    }

    /* 竖直圆柱：筒身 + 顶圆 */
    function cylZ(x, y, z, r, h, tone) {
      tone = tone || "g";
      var pts = [], th, i;
      for (i = 0; i <= 16; i++) {
        th = Math.PI * 0.75 + (Math.PI * 1.5) * i / 16 * -1;
        pts.push(P(x + r * Math.cos(th), y + r * Math.sin(th), z));
      }
      var top = P(x, y, z + h);
      var body = poly([P(x + r * Math.cos(Math.PI * 0.75), y + r * Math.sin(Math.PI * 0.75), z + h)]
        .concat(pts, [P(x + r * Math.cos(-Math.PI * 0.25), y + r * Math.sin(-Math.PI * 0.25), z + h)]), tone + "s");
      return body + '<circle class="' + tone + 't" cx="0" cy="0" r="' + r + '" transform="matrix(' +
        n(a) + "," + n(b) + "," + n(c) + "," + n(d) + "," + n(top[0]) + "," + n(top[1]) + ')"/>';
    }

    function line(p1, p2, cls) {
      return '<line class="' + cls + '" x1="' + n(p1[0]) + '" y1="' + n(p1[1]) +
        '" x2="' + n(p2[0]) + '" y2="' + n(p2[1]) + '"/>';
    }

    function group(cls, inner) { return '<g class="' + cls + '">' + inner + "</g>"; }

    return { P: P, box: box, discXY: discXY, discXZ: discXZ, cylZ: cylZ, line: line,
      poly: poly, group: group, n: n, sc: sc, ox: ox, oy: oy };
  }

  /* ---------- 传送段 ---------- */

  var conveyor = {
    name: "传送段",
    bb: [-40, -8, -4, 210, 72, 56],
    parts: [
      { k: "belt", n: "输送皮带", an: [100, 30, 30],
        role: "靠摩擦带走板。皮带张力不足会打滑，跑偏会磨边。",
        faults: ["打滑（张力不足）", "跑偏磨边", "接头开裂"],
        checks: ["手按皮带中段，下沉超过 10 mm 就该张紧"] },
      { k: "pulley", n: "主动轮", an: [16, 30, 44],
        role: "电机通过它驱动皮带。它一打滑，整段速度就不对。",
        faults: ["包胶磨损", "键槽滚键", "轴端顶丝松"],
        checks: ["停机后手转主动轮，看电机轴是否同步"] },
      { k: "idler", n: "张紧轮", an: [186, 30, 44],
        role: "决定皮带张力。调得太松打滑，太紧轴承发热。",
        faults: ["轴承缺脂发响", "张紧机构螺丝滑动", "轮面粘料"],
        checks: ["听有没有周期性“吱—”声"] },
      { k: "motor", n: "驱动电机", an: [-20, 26, 30],
        role: "变频器带着走。堵料时电机会先过流，再报故障。",
        faults: ["变频器过流", "减速机漏油", "风扇堵灰过热"],
        checks: ["看变频器历史故障码，别只看当前显示"] },
      { k: "sensor", n: "光电传感器", an: [102, 64, 48],
        role: "判断有没有板。常亮就是判断“一直有板”，程序就会停带。",
        faults: ["镜头被纸屑挡住", "灵敏度太高", "反光板偏"],
        checks: ["擦镜头，用手挡一下看指示灯变不变"] },
      { k: "frame", n: "机架 / 过渡板", an: [150, 54, 6],
        role: "过渡板的高度差超过 1 mm，板就会在接缝处翘头卡住。",
        faults: ["过渡板高度差", "框架螺丝松", "地脚不平"],
        checks: ["塞尺量过渡板与皮带的高度差"] }
    ],
    motion: { cls: "p-board", d: [42, 0, 0] },
    m3d: {
      cam: { yaw: -0.66, pitch: 0.42, dist: 330, target: [0, 14, 0] },
      anim: [{ k: "board", axis: "x", amp: 60, period: 3400 }],
      colors: {
        frame: "#dde0e9", belt: "#c6cad7", pulley: "#b9becd",
        board: "#e9b900", motor: "#cfd3e0", sensor: "#dfe3ec",
        ctx: "#cfd4e0", hmi: "#0d1a2a", light: "#5c1616"
      },
      emissive: { hmi: [0.04, 0.15, 0.28], light: [0.5, 0.05, 0.05] },
      parts: [
        { k: "frame", a: [70, 8, 26], b: [[0, 5, 0, 200, 10, 56], [0, 16, -25, 200, 12, 6], [0, 16, 25, 200, 12, 6]] },
        { k: "belt", a: [-40, 27, 16], b: [[0, 24, 0, 184, 5, 40]] },
        { k: "pulley", a: [-92, 30, 20], c: [[-92, 24, 0, 15, 40, "z", 16]] },
        { k: "idler", a: [92, 30, 20], c: [[92, 24, 0, 15, 40, "z", 16]] },
        { k: "board", a: [-22, 34, 6], b: [[-22, 30.5, 0, 56, 6, 28]] },
        { k: "motor", a: [-114, 20, 16], b: [[-114, 12, 0, 26, 26, 36]] },
        { k: "sensor", a: [0, 52, -30], b: [[0, 32, -32, 8, 40, 8], [0, 52, -30, 14, 14, 12]] },
        { k: "ctx", b: [[-64, 14, 52, 44, 28, 26]] },
        { k: "hmi", b: [[-64, 16, 66, 26, 14, 2]] },
        { k: "light", c: [[-64, 34, 52, 4.5, 10, "y", 10]] }
      ]
    },
    draw: function (g) {
      var s = "";
      s += g.box(0, 0, 0, 200, 56, 10);
      s += g.box(0, 0, 10, 200, 6, 12, "g");
      s += g.box(0, 50, 10, 200, 6, 12, "g");
      s += g.box(8, 8, 22, 184, 40, 5, "h");
      s += g.discXZ(16, 30, 24, 15, "h");
      s += g.discXZ(184, 30, 24, 15, "h");
      s += g.box(-34, 8, 0, 26, 38, 26, "g");
      s += g.box(96, 58, 10, 12, 6, 24, "g");
      s += g.box(96, 58, 34, 12, 12, 14, "h");
      s += g.group("p-board", g.box(62, 14, 27, 56, 28, 7, "m"));
      return s;
    }
  };

  /* ---------- 伺服轴 ---------- */

  var servo = {
    name: "伺服轴 / 直线模组",
    bb: [-76, -6, -2, 216, 52, 54],
    parts: [
      { k: "motor", n: "伺服电机", an: [-24, 22, 46],
        role: "提供扭矩和位置闭环。电机本身很少坏，坏的多半是它的供电、编码器线或者负载。",
        faults: ["抱闸没打开（一上电就闷住）", "动力线缺相", "过载发热"],
        checks: ["断电手转轴，感受有没有卡滞", "看驱动器报警码"] },
      { k: "coupling", n: "联轴器", an: [0, 22, 32],
        role: "把电机轴和丝杠连起来。它同时是“保险丝”：撞机时先崩联轴器，保住丝杠。",
        faults: ["弹性体老化产生间隙", "顶丝松，轴打滑", "撞机后错位"],
        checks: ["低速点动，看丝杠和电机轴转角是否同步"] },
      { k: "screw", n: "滚珠丝杠", an: [46, 22, 21],
        role: "把旋转变成直线，精度靠它。丝杠脏、缺脂，阻力会随速度上升。",
        faults: ["润滑脂干涸", "滚珠磨损、有异响", "丝杠弯曲（撞过）"],
        checks: ["全程手推，感受有没有一段变涩"] },
      { k: "nut", n: "螺母座 / 滑台", an: [108, 4, 52],
        role: "丝杠的螺母带着滑台走。螺母座和导轨的平行度不对，走起来就会憋。",
        faults: ["螺母座螺丝松", "与导轨不平行（走一段就憋）", "撞机后变形"],
        checks: ["全行程跑一遍，听有没有周期性异响"] },
      { k: "guide", n: "直线导轨 / 滑块", an: [140, 6, 12],
        role: "承担全部侧向力和力矩。导轨不平行，丝杠再好也白搭。",
        faults: ["缺油发涩", "滑块滚珠脱落", "安装面有铁屑导致不平行"],
        checks: ["擦干净导轨面看有没有压痕", "补脂后手推对比"] },
      { k: "encoder", n: "编码器", an: [-70, 22, 28],
        role: "告诉驱动器轴到底在哪。它一抖，位置就飘，表现为软限位报警、回零偏移。",
        faults: ["电池电压低（绝对值编码器）", "线缆屏蔽层断，受干扰", "进油进尘"],
        checks: ["看电池电压，低于 3.0 V 就换，换完必须重新回零"] }
    ],
    motion: { cls: "p-slide", d: [40, 0, 0] },
    m3d: {
      cam: { yaw: -0.62, pitch: 0.44, dist: 360, target: [0, 26, 0] },
      anim: [{ k: "nut", axis: "x", amp: 44, period: 3000 }],
      colors: {
        motor: "#d6d9e3", coupling: "#bfc4d2", screw: "#c9cdda",
        nut: "#d9dce6", guide: "#ccd0dd", encoder: "#b4bacb"
      },
      parts: [
        { k: "guide", a: [70, 12, -18], b: [[0, 4, 0, 220, 8, 50], [0, 12, -18, 200, 8, 9], [0, 12, 18, 200, 8, 9]] },
        { k: "screw", a: [-20, 14, 0], c: [[0, 14, 0, 4, 190, "x", 12]] },
        { k: "motor", a: [-95, 34, 12], b: [[-95, 22, 0, 50, 34, 34]] },
        { k: "encoder", a: [-124, 22, 0], c: [[-124, 22, 0, 9, 10, "x", 12]] },
        { k: "coupling", a: [-62, 26, 0], c: [[-62, 20, 0, 7, 18, "x", 12]] },
        { k: "nut", a: [-6, 42, 16], b: [[0, 20, 0, 60, 16, 46], [-6, 34, 0, 80, 16, 50]] },
        { k: "guide", a: [105, 14, 0], b: [[105, 14, 0, 16, 22, 30]] }
      ]
    },
    draw: function (g) {
      var s = g.box(0, 0, 0, 210, 46, 8);
      s += g.box(6, 2, 8, 200, 9, 8, "g");
      s += g.box(6, 35, 8, 200, 9, 8, "g");
      s += g.box(-2, 18, 17, 190, 7, 7, "h");
      s += g.box(-56, 6, 4, 50, 34, 34, "g");
      s += g.discXZ(-60, 23, 24, 9, "h");
      s += g.box(-8, 15, 13, 18, 17, 15, "h");
      s += g.box(196, 11, 8, 14, 30, 24, "g");
      s += g.group("p-slide", g.box(76, 0, 8, 60, 46, 22, "g") + g.box(68, -2, 30, 78, 50, 20, "g"));
      return s;
    }
  };

  /* ---------- 取放头 ---------- */

  var head = {
    name: "取放头 / 贴装头",
    bb: [0, -10, -16, 204, 50, 70],
    parts: [
      { k: "beam", n: "横梁与导轨", an: [34, 4, 68],
        role: "整个头的基准。横梁不水平，贴出来的位置就带系统性偏差。",
        faults: ["导轨缺油发涩", "滑块磨损有间隙", "横梁被撞偏移"],
        checks: ["手推全程感受有没有涩点", "每周擦导轨补脂"] },
      { k: "carriage", n: "滑架", an: [80, 4, 46],
        role: "横梁和 Z 轴之间的连接件，带着整套吸嘴往复。",
        faults: ["螺丝松动产生间隙", "拖链磨损线束", "限位块撞变形"],
        checks: ["点动到两端，看有没有异响和过冲"] },
      { k: "zaxis", n: "Z 轴", an: [118, 13, 22],
        role: "决定吸嘴下去多深。行程和重复精度不够，就会压伤元件或吸不到。",
        faults: ["原点偏移", "丝杠/音圈磨损", "缓冲弹簧断"],
        checks: ["打一片，量实际下压高度"] },
      { k: "nozzle", n: "吸嘴", an: [102, 13, 0],
        role: "唯一接触元件的零件。0.4 mm 以下的小孔最容易堵死。",
        faults: ["堵塞", "端面磨损、漏气", "装歪偏心"],
        checks: ["换新吸嘴打一片对比抛料率"] },
      { k: "vacuum", n: "真空管路", an: [146, 13, 34],
        role: "真空发生器 → 气管 → 吸嘴。任何一段漏气，负压就上不去。",
        faults: ["快插接头松", "滤芯积尘", "气管被拖链磨破"],
        checks: ["肥皂水查接头", "看负压建立时间是否超过 200 ms"] },
      { k: "camera", n: "相机 / 光源", an: [166, 4, 52],
        role: "识别元件和 Mark 点，决定贴装角度和位置补偿。",
        faults: ["镜头积油雾", "光源衰减", "支架松动跑焦"],
        checks: ["擦镜头，用确认 OK 的板做对比"] }
    ],
    motion: { cls: "p-z", d: [0, 0, -16] },
    m3d: {
      cam: { yaw: -0.7, pitch: 0.36, dist: 340, target: [0, 26, 0] },
      anim: [{ k: "zaxis", axis: "y", amp: -16, period: 2400 }, { k: "nozzle", axis: "y", amp: -16, period: 2400 }],
      colors: {
        beam: "#d7dae4", carriage: "#cfd3e0", zaxis: "#c2c7d6",
        nozzle: "#9aa1b3", vacuum: "#b8bdcc", camera: "#ccd0dd", ctx: "#eceef4",
        hmi: "#0d1a2a", light: "#2a4a2a"
      },
      emissive: { hmi: [0.04, 0.15, 0.28], light: [0.06, 0.30, 0.08] },
      parts: [
        { k: "beam", a: [-80, 66, 0], b: [[0, 60, 0, 240, 16, 26], [0, 51, 0, 232, 4, 8]] },
        { k: "carriage", a: [-24, 40, 10], b: [[-16, 40, 0, 60, 20, 22]] },
        { k: "zaxis", a: [-16, 24, 12], c: [[-16, 25, 0, 10, 22, "y", 12]] },
        { k: "nozzle", a: [-16, 11, 0], b: [[-16, 12, 0, 14, 8, 14]] },
        { k: "vacuum", a: [-34, 34, -14], c: [[-34, 34, -6, 2.5, 26, "z", 8]] },
        { k: "camera", a: [52, 44, 12], b: [[52, 34, 0, 30, 20, 24]] },
        { k: "ctx", b: [[-60, -10, 0, 120, 6, 44], [96, -4, 0, 44, 12, 28],
          [-100, 25, 0, 12, 72, 26], [100, 25, 0, 12, 72, 26], [104, 30, -34, 26, 56, 6]] },
        { k: "hmi", b: [[104, 40, -30, 18, 14, 2]] },
        { k: "light", c: [[104, 62, -34, 4, 8, "y", 10]] }
      ]
    },
    draw: function (g) {
      var s = g.box(0, 0, 50, 200, 26, 18);
      s += g.box(8, 4, 48, 184, 8, 5, "h");
      s += g.box(70, 2, 30, 64, 22, 20, "g");
      s += g.group("p-z", g.cylZ(102, 13, 10, 14, 20, "h") + g.box(94, 5, 2, 16, 16, 8, "g") +
        g.box(110, 7, 32, 36, 8, 5, "h"));
      s += g.box(140, 2, 36, 32, 22, 16, "g");
      s += g.box(40, -6, -14, 120, 44, 6, "h");
      s += g.box(160, 2, -10, 40, 26, 10, "g");
      return s;
    }
  };

  /* ---------- 视觉系统 ---------- */

  var vision = {
    name: "视觉系统",
    bb: [-12, -18, -10, 140, 76, 100],
    parts: [
      { k: "camera", n: "工业相机", an: [63, 4, 80],
        role: "把图像交给算法。它出问题的表现通常是整体发暗、有条纹、或者直接掉线。",
        faults: ["网线/数据线接触不良", "供电不足", "传感器过热"],
        checks: ["看掉线时是不是伴随从站报警"] },
      { k: "lens", n: "镜头", an: [63, 20, 58],
        role: "决定视野和景深。焦距跑了，整个坐标系都偏。",
        faults: ["跑焦（支架松动）", "镜片有油雾", "光圈被误调"],
        checks: ["手动对焦看边缘是否锐利"] },
      { k: "ring", n: "环形光源", an: [78, 13, 50],
        role: "把 Mark 点的反差打出来。光源衰减是渐进的，很容易被忽略。",
        faults: ["单路不亮", "亮度衰减", "角度偏了产生反光"],
        checks: ["四路逐一遮挡，看是否都亮"] },
      { k: "bracket", n: "支架", an: [6, 5, 40],
        role: "所有精度的地基。支架一动，之前标定的坐标全部作废。",
        faults: ["螺丝松", "被撞移位", "底座不平"],
        checks: ["手推相机看有没有旷量，动了必须重新标定"] },
      { k: "pcb", n: "被测板 / Mark 点", an: [63, 52, -4],
        role: "识别对象本身。来料差异（油污、氧化、印刷偏）经常被当成设备故障。",
        faults: ["Mark 被锡膏污染", "印刷对比度不够", "板翘"],
        checks: ["拿确认 OK 的板做对比，排除来料"] }
    ],
    draw: function (g) {
      var s = g.box(0, 0, 0, 10, 10, 88);
      s += g.box(120, 0, 0, 10, 10, 88);
      s += g.box(0, 0, 88, 130, 10, 12);
      s += g.box(46, 0, 64, 34, 24, 24, "g");
      s += g.box(56, 8, 52, 14, 10, 12, "h");
      s += g.discXY(63, 13, 52, 13, "h");
      s += g.box(-6, -12, -10, 138, 76, 6, "h");
      s += g.box(57, 24, -5, 12, 10, 3, "m");
      return s;
    },
    m3d: {
      cam: { yaw: -0.62, pitch: 0.34, dist: 330, f: 700, target: [0, 62, 0] },
      colors: {
        camera: "#d3d7e2", lens: "#b9bfd0", ring: "#c8cdda",
        bracket: "#ccd1de", pcb: "#dfe3ec"
      },
      parts: [
        { k: "bracket", a: [-78, 60, 0], b: [[-78, 56, 0, 10, 100, 10], [-58, 104, 0, 40, 10, 12]] },
        { k: "camera", a: [-30, 84, 0], b: [[-30, 84, 0, 36, 26, 26]] },
        { k: "lens", a: [-30, 66, 0], b: [[-30, 66, 0, 16, 14, 16]] },
        { k: "ring", a: [-30, 56, 0], c: [[-30, 56, 0, 20, 6, "y", 18]] },
        { k: "pcb", a: [10, 14, 24], b: [[0, 14, 0, 150, 6, 70]] }
      ]
    }
  };

  /* ---------- 供料器 ---------- */

  var feeder = {
    name: "供料器",
    bb: [-14, -2, -4, 186, 52, 72],
    parts: [
      { k: "reel", n: "料盘", an: [18, 20, 40],
        role: "存料。盘的阻力太大会把料带拉变形，太小会散料。",
        faults: ["盘卡死转不动", "料带缠绕", "盘径不对导致张力异常"],
        checks: ["手转一圈，感受阻力是否均匀"] },
      { k: "tape", n: "料带", an: [78, 20, 40],
        role: "元件就封在载带的口袋里。料带孔被拉坏，棘轮就抓不住。",
        faults: ["孔被拉长", "料带受潮", "上盖带粘太紧"],
        checks: ["换一盘料试，排除料带本身"] },
      { k: "sprocket", n: "棘轮 / 步进机构", an: [118, 20, 26],
        role: "按固定节距把料带往前送一格。丢步就表现为偏半格、吸空。",
        faults: ["棘轮齿磨平", "步进丢步（电流不足）", "压料盖没压到位"],
        checks: ["听“咔”声是否清脆、节奏是否均匀"] },
      { k: "peel", n: "剥料板", an: [136, 12, 36],
        role: "把上盖带撕开，露出元件。角度不对会带起元件。",
        faults: ["角度不对", "刃口磨损", "上盖带没绕到收料轮"],
        checks: ["看撕开后的口袋是否平整无翻边"] },
      { k: "pickup", n: "取料位", an: [162, 20, 32],
        role: "吸嘴来这里取件。供料器没插到底，取料位就整体偏。",
        faults: ["供料器没插到位", "取料位高度不对", "料带在这里拱起"],
        checks: ["拔下重插到底，确认有到位声"] },
      { k: "motor", n: "驱动电机", an: [104, 40, 12],
        role: "带动棘轮。驱动电流不足会丢步，机械阻力大也会丢步。",
        faults: ["驱动电流设置偏低", "齿轮磨损", "线束接触不良"],
        checks: ["同一站反复丢步就换供料器，别一直手动补偿"] }
    ],
    draw: function (g) {
      var s = g.discXZ(18, 20, 40, 34, "g");
      s += g.discXZ(18, 20, 40, 12, "h");
      s += g.box(50, 15, 38, 64, 10, 4, "h");
      s += g.discXZ(118, 20, 26, 13, "g");
      s += g.box(132, 8, 32, 22, 20, 5, "h");
      s += g.box(158, 10, 24, 16, 20, 16, "g");
      s += g.box(92, 30, 0, 44, 18, 20, "g");
      return s;
    },
    m3d: {
      cam: { yaw: -0.5, pitch: 0.36, dist: 330, f: 720, target: [30, 40, 0] },
      colors: {
        reel: "#d8dbe5", tape: "#c3c8d5", sprocket: "#c8ccd9",
        peel: "#dde1ea", pickup: "#cfd3e0", motor: "#c9cdda"
      },
      parts: [
        { k: "reel", a: [-60, 78, 6], c: [[-60, 50, 0, 40, 10, "z", 20]] },
        { k: "tape", a: [0, 54, 6], b: [[0, 52, 0, 70, 6, 8]] },
        { k: "sprocket", a: [40, 42, 6], c: [[40, 42, 0, 14, 12, "z", 14]] },
        { k: "peel", a: [66, 50, 6], b: [[66, 50, 0, 28, 6, 8]] },
        { k: "pickup", a: [92, 44, 0], b: [[92, 44, 0, 16, 24, 16]] },
        { k: "motor", a: [20, 20, 0], b: [[20, 20, 0, 44, 24, 20]] }
      ]
    }
  };

  /* ---------- 气缸（剖面） ---------- */

  var cylinder = {
    name: "气缸 / 执行机构",
    blurb: "双作用气缸，靠两侧进气推动活塞往复。这里画成剖切：前面那层壳被切开，才看得到里面的活塞和密封圈。",
    m3d: {
      cam: { yaw: -0.62, pitch: 0.30, dist: 330, fov: 0.8, target: [0, 4, 0] },
      colors: {
        barrel: "#d8dbe5", piston: "#b6bdcd", rod: "#e8ebf2",
        seal: "#8f97a8", mag: "#c2c8d6", port: "#c9cedb"
      },
      anim: [{ k: "piston", axis: "x", amp: 26, period: 2800 }],
      parts: [
        { k: "barrel", a: [56, 30, 12], b: [
          [0, -31, 0, 160, 8, 60], [0, 31, 0, 160, 8, 60], [0, 0, -26, 160, 70, 8],
          [-80, 0, 0, 10, 62, 60], [80, 0, 0, 10, 62, 60]
        ] },
        { k: "piston", a: [-20, 18, 22], b: [[-20, 0, 0, 14, 54, 54]] },
        { k: "seal", a: [-20, 28, 24], b: [[-20, 26, 0, 15, 5, 56], [-20, -26, 0, 15, 5, 56]] },
        { k: "rod", a: [44, 8, 0], c: [[44, 0, 0, 8, 116, "x", 14]] },
        { k: "port", a: [-40, 46, 0], b: [[-40, 40, 0, 12, 14, 12], [40, 40, 0, 12, 14, 12]] },
        { k: "mag", a: [-58, 40, 22], b: [[-58, 36, 22, 26, 8, 8]] }
      ]
    },
    parts: [
      { k: "barrel", n: "缸筒", at: [59, 33],
        role: "活塞在里面往复，缸筒内壁就是活塞密封圈的滑动面。内壁拉毛就会串气，缸就没力。",
        faults: ["内壁拉伤、有铁屑", "缸筒变形（撞过缸）", "积水锈蚀"],
        checks: ["拆前端盖看内壁有没有纵向划痕", "排水：气源三联件每周放一次水"] },
      { k: "piston", n: "活塞", at: [40, 52],
        role: "把气压变成推力。活塞上的两道密封圈决定推力够不够、会不会爬行。",
        faults: ["密封圈老化变硬", "活塞螺母松动", "异物卡在活塞与端盖之间"],
        checks: ["低速走一遍看有没有爬行（一顿一顿）"] },
      { k: "rod", n: "活塞杆", at: [84, 52],
        role: "把活塞的力传到工装。杆的直线度直接决定工装会不会偏摆。",
        faults: ["被侧向力撞弯", "表面镀层脱落生锈", "杆端螺纹松脱"],
        checks: ["手推杆端感受有没有旷量", "看杆面有没有发蓝、拉毛"] },
      { k: "seal", n: "密封圈", at: [38, 68],
        role: "活塞密封（内漏）和杆密封（外漏）是两套。内漏表现是没力，外漏表现是漏气、喷油。",
        faults: ["老化硬化失去弹性", "被铁屑划伤", "装反（唇口朝错方向）"],
        checks: ["杆伸出时在杆面涂肥皂水看有没有气泡"] },
      { k: "mag", n: "磁性开关", at: [14, 27],
        role: "靠活塞上的磁环感应，给 PLC 一个“到位”信号。位置差 1 mm，程序就可能判超时。",
        faults: ["位置滑动、提前或滞后", "线被拖链拉断", "两个开关互相干扰"],
        checks: ["手动伸到底，推到灯刚亮再回退 1 mm 锁紧"] },
      { k: "port", n: "进气口 / 电磁阀", at: [33, 19],
        role: "两路气一进一出决定伸还是缩。阀不换向，气缸就停在半路。",
        faults: ["电磁阀线圈烧", "阀芯卡（有水和油泥）", "快插接头漏气"],
        checks: ["手动按阀上的应急按钮，看缸动不动"] }
    ],
    svg:
      '<svg viewBox="0 0 320 200" data-tpl="cylinder" class="dsvg">' +
      '<line class="cl" x1="10" y1="104" x2="310" y2="104"/>' +
      '<rect class="f1" x="36" y="64" width="200" height="80" rx="4"/>' +
      '<rect class="void" x="46" y="74" width="180" height="60" rx="2"/>' +
      '<rect class="f2" x="24" y="64" width="12" height="80" rx="2"/>' +
      '<rect class="f2" x="236" y="64" width="16" height="80" rx="2"/>' +
      '<g class="p-piston">' +
      '<rect class="f3" x="152" y="95" width="118" height="18" rx="9"/>' +
      '<rect class="f2" x="126" y="74" width="26" height="60" rx="2"/>' +
      '<rect class="void" x="126" y="74" width="26" height="4"/>' +
      '<rect class="void" x="126" y="130" width="26" height="4"/>' +
      "</g>" +
      '<circle class="f3" cx="30" cy="74" r="2.6"/>' +
      '<circle class="f3" cx="30" cy="134" r="2.6"/>' +
      '<circle class="f3" cx="244" cy="74" r="2.6"/>' +
      '<circle class="f3" cx="244" cy="134" r="2.6"/>' +
      '<rect class="f3" x="96" y="46" width="16" height="18" rx="2"/>' +
      '<rect class="f3" x="196" y="46" width="16" height="18" rx="2"/>' +
      '<line class="hair" x1="96" y1="52" x2="112" y2="52"/>' +
      '<line class="hair" x1="196" y1="52" x2="212" y2="52"/>' +
      '<rect class="f3" x="50" y="56" width="30" height="8" rx="2"/>' +
      '<circle class="dotm" cx="77" cy="60" r="2.2"/>' +
      '<path class="ac" d="M104 30 L104 43"/>' +
      '<path class="ac" d="M99 38 L104 43 L109 38"/>' +
      '<path class="ac" d="M204 43 L204 30"/>' +
      '<path class="ac" d="M199 35 L204 30 L209 35"/>' +
      "</svg>"
  };

  /* ---------- 构建：图 + 热区 ---------- */

  var ALL = { cylinder: cylinder, servo: servo, conveyor: conveyor, head: head, vision: vision, feeder: feeder };

  Object.keys(ALL).forEach(function (k) {
    var t = ALL[k];
    if (!t.draw) return;
    t.fit = autofit(t.bb);
    var g = iso(t.fit);
    var style = "";
    if (t.motion) {
      var dx = (t.motion.d[0] - t.motion.d[1]) * KX * t.fit.sc;
      var dy = (t.motion.d[0] + t.motion.d[1]) * SY * t.fit.sc - t.motion.d[2] * SZ * t.fit.sc;
      style = ' style="--mvx:' + Math.round(dx * 10) / 10 + "px;--mvy:" +
        Math.round(dy * 10) / 10 + 'px"';
    }
    t.svg = '<svg viewBox="0 0 320 174" data-tpl="' + k + '" class="dsvg"' + style + ">" +
      t.draw(g) + "</svg>";
    t.parts.forEach(function (p) {
      var s = g.P(p.an[0], p.an[1], p.an[2]);
      p.at = [s[0] / W * 100, s[1] / H * 100];
    });
  });

  window.DEVICES = ALL;
  window.DEVICE_ORDER = ["head", "feeder", "conveyor", "servo", "cylinder", "vision"];
})();
