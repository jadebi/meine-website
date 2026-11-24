(() => {
  "use strict";

  /* ========================================================================
     Helpers
     ======================================================================== */

  const R = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const rn = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const $ = (id) => document.getElementById(id);

  const LET = "abcdefghijklmnopqrstuvwxyz";
  const VOW = "aeiou";
  const CON = "bcdfghjklmnpqrstvwxyz";
  const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

  /* ========================================================================
     Word pools (built-in fallback, extended by external lists on load)
     ======================================================================== */

  const split = (s) => s.split(" ");
  let words = split("dark shadow silent frozen toxic mystic rapid lucky salty cosmic angry tiny golden wild sneaky savage royal pixel fuzzy cursed icy ember lunar solar nether ender stormy sleepy spicy rusty swift hollow brave feral epic ultra mega hyper evil holy broken fallen lost hidden secret neon turbo atomic wolf fox knight dragon ghost panda blaze creeper miner raven tiger viper phoenix ninja golem slime falcon bear reaper hunter wizard cookie potato waffle toast pickle comet storm frost void bandit spider zombie shark moth otter blade arrow crystal anvil cat dog bunny duck frog lion eagle hawk snake rat bat owl whale koala llama penguin mango lemon banana noodle taco pizza burger muffin cloud rain thunder moon star sun galaxy rocket tank sniper pilot samurai monk pirate viking ranger rogue mage titan demon angel goblin orc elf creeper diamond redstone obsidian steve zombie skeleton piglin warden ghast pickaxe elytra totem villager cobble deepslate wither sculk axolotl bedrock lava spawn");
  let firstNames = split("jake liam noah ethan luca max finn leo kai aiden owen mason zane cole ryan tyler jayden nico theo evan maya ella lily zoe mia nora ava chloe jack sam alex ben dan tom eli ian rhys oscar felix hugo lucas jonas elias tim paul nils tobi anna emma lena sara jana john matt chris josh drew cody dylan logan blake chase brady trey wyatt carter gavin ellie holly ruby ivy luna stella jade fiona");
  let shortWords = words.filter((w) => w.length <= 5);

  function mergeList(base, extra, min, max) {
    const set = new Set(base);
    extra.forEach((w) => {
      w = w.trim().toLowerCase();
      if (w.length >= min && w.length <= max && /^[a-z]+$/.test(w)) set.add(w);
    });
    return [...set];
  }

  async function loadList(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return (await res.text()).split(/\r?\n/);
  }

  // Optional: bigger pools make collisions with taken names far less likely.
  // If a download fails, the built-in lists keep working.
  async function loadExternal() {
    const [w, n] = await Promise.allSettled([
      loadList("https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"),
      loadList("https://raw.githubusercontent.com/dominictarr/random-name/master/first-names.txt"),
    ]);
    if (w.status === "fulfilled") {
      words = mergeList(words, w.value, 3, 9);
      shortWords = words.filter((x) => x.length <= 5);
    }
    if (n.status === "fulfilled") firstNames = mergeList(firstNames, n.value, 3, 8);
    if (w.status === "fulfilled" || n.status === "fulfilled") gen();
  }

  const W = () => R(words);
  const SW = () => R(shortWords);
  const P = () => R(firstNames);

  /* ========================================================================
     Random building blocks
     ======================================================================== */

  // n random letters; pv = probability each one is a vowel (0.38 ≈ natural-ish)
  const rs = (n, pv = 0.2) => {
    let s = "";
    for (let i = 0; i < n; i++) s += chance(pv) ? R(VOW) : R(chance(0.7) ? CON : LET);
    return s;
  };

  const digs = () => R([
    () => String(rn(1, 99)), () => String(rn(100, 999)), () => String(rn(1000, 9999)),
    () => "0" + rn(1, 9), () => String(rn(2003, 2012)), () => String(rn(0, 9)),
    () => String(rn(10, 99)), () => String(rn(1, 9)) + String(rn(1, 9)),
  ])();

  const leet = (s, p = 0.6) => s.replace(/[eoai]/gi, (c) => chance(p) ? ({ e: "3", o: "0", a: "4", i: "1" })[c.toLowerCase()] : c);

  // Invented pronounceable words: Velkor, Zinra, Thyrex ...
  const ON = split("b d f g h j k l m n p r s t v z br dr gr kr tr st sk sl sn sh th ch cl fl gl pl vr zr kl x y w qu fr pr cr bl sp sw z v k");
  const VO = split("a e i o u a e i o u ae ia io ou ei y ya yo ie ui");
  const CO = split("l r n s k x th rn rk lk nd ng m t z v d rx rt sk lz nk ks mn p b f");
  const syl = (last) => R(ON) + R(VO) + (chance(last ? 0.7 : 0.35) ? R(CO) : "");
  const inv = (n = rn(2, 3)) => {
    let s = "";
    for (let i = 0; i < n; i++) s += syl(i === n - 1);
    return s;
  };

  const walk = () => {
    const row = R(ROWS);
    const start = rn(0, row.length - 3);
    const s = row.slice(start, start + rn(3, 6));
    return chance(0.5) ? s : [...s].reverse().join("");
  };

  /* ========================================================================
     Styles (select any number; they are mixed together)
     ======================================================================== */

  const styles = {
    mash: {
      label: "Tastatur-Mash",
      f: [
        () => rs(rn(4, 8)),
        () => rs(rn(4, 8), 0.05),
        () => rs(rn(3, 5)) + digs(),
        () => walk() + (chance(0.5) ? digs() : ""),
        () => R(LET).repeat(rn(2, 3)) + rs(rn(2, 4), 0.1),
        () => rs(rn(2, 4)) + "_" + rs(rn(2, 4)),
        () => rs(rn(3, 6)) + R(["_", "__", "x", "xx", "z"]),
      ],
    },
    invented: {
      label: "Erfundene Wörter",
      f: [
        () => inv(),
        () => inv(),
        () => inv(1) + inv(rn(1, 2)),
        () => inv() + digs(),
        () => inv(2) + R(["x", "z", "_", "xd", "o"]),
        () => R(["_", "x", "i", "z"]) + inv(),
      ],
    },
    hybrid: {
      label: "Wort + Zufall",
      f: [
        () => W() + rs(rn(1, 4)),
        () => rs(rn(1, 3)) + W(),
        () => SW() + rs(rn(1, 3)) + SW(),
        () => W() + digs(),
        () => rs(rn(1, 2)) + W() + digs(),
        () => W() + "_" + rs(rn(2, 4)),
        () => SW() + inv(1) + (chance(0.4) ? digs() : ""),
        () => rs(rn(2, 3)) + SW() + rs(rn(1, 2)),
      ],
    },
    digits: {
      label: "Leet / Ziffern",
      f: [
        () => leet(inv()),
        () => leet(W()) + digs(),
        () => rs(rn(1, 3)) + rn(1, 9) + rs(rn(1, 3)),
        () => leet(rs(rn(3, 5), 0.3)) + digs(),
        () => digs() + rs(rn(3, 5)),
        () => rs(2) + rn(1, 9) + rs(1) + rn(1, 9),
      ],
    },
    short: {
      label: "Kurz (3–6)",
      f: [
        () => rs(3),
        () => rs(rn(3, 4), 0.1),
        () => inv(1) + (chance(0.3) ? rn(1, 9) : ""),
        () => R(CON) + R(VOW) + R(CON) + (chance(0.5) ? R(LET) : ""),
        () => rs(2) + digs().slice(0, 2),
      ],
    },
    names: {
      label: "Name + Zufall",
      f: [
        () => P() + rs(rn(1, 3)),
        () => rs(1) + P() + digs(),
        () => P() + "_" + rs(rn(1, 3)),
        () => P() + digs(),
        () => P().slice(0, rn(3, 4)) + inv(1),
        () => P() + rs(1) + rs(1) + digs(),
      ],
    },
    sloppy: {
      label: "Unterstriche",
      f: [
        () => "_" + rs(rn(3, 6)),
        () => rs(rn(3, 6)) + "_",
        () => "_" + rs(rn(2, 4)) + "_",
        () => "__" + inv(),
        () => W() + "_" + inv(1) + "_",
        () => "_" + SW() + rs(rn(1, 2)),
      ],
    },
  };

  const keys = Object.keys(styles);
  const selected = new Set(["mash", "invented", "hybrid"]);

  /* ========================================================================
     Generation
     ======================================================================== */

  function lim() {
    let a = +$("min").value || 3;
    let b = +$("max").value || 16;
    a = Math.max(3, Math.min(16, a));
    b = Math.max(3, Math.min(16, b));
    if (a > b) [a, b] = [b, a];
    return [a, b];
  }

  // Random capitalisation, like people actually type them
  function finish(s) {
    const r = Math.random();
    if (r < 0.45) return s.toLowerCase();
    if (r < 0.8) return cap(s.toLowerCase());
    if (r < 0.88) return s.toUpperCase();
    return s;
  }

  function one(a, b) {
    const pool = selected.size ? [...selected] : keys;
    for (let i = 0; i < 60; i++) {
      const s = finish(R(styles[R(pool)].f)());
      if (s.length >= a && s.length <= b && /^[A-Za-z0-9_]+$/.test(s)) return s;
    }
    return null;
  }

  function many(n, a, b) {
    const set = new Set();
    const seen = new Set();
    let tries = 0;
    while (set.size < n && tries < n * 40 + 500) {
      tries++;
      const s = one(a, b);
      if (s && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase());
        set.add(s);
      }
    }
    return [...set];
  }

  function gen() {
    const [a, b] = lim();
    const list = many(12, a, b);
    const ul = $("out");
    ul.innerHTML = "";
    list.forEach((n) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      const small = document.createElement("small");
      button.type = "button";
      button.textContent = n;
      small.textContent = n.length + " · kopieren";
      button.appendChild(small);
      button.onclick = () => copy(n);
      li.appendChild(button);
      ul.appendChild(li);
    });
  }

  /* ========================================================================
     Clipboard, export and status
     ======================================================================== */

  let toastTimer;

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1500);
  }

  function copy(text, message) {
    const ok = () => toast(message || "Kopiert: " + text);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(ok, () => toast("Kopieren blockiert, bitte manuell markieren"));
    } else {
      toast("Kopieren wird hier nicht unterstützt");
    }
  }

  function build() {
    const n = Math.max(1, Math.min(50000, Math.floor(+$("cnt").value) || 1));
    const [a, b] = lim();
    const list = many(n, a, b);
    const status = $("status");
    const textarea = $("ta");
    status.textContent = list.length < n
      ? `Nur ${list.length} eindeutige Namen passen zu diesen Einstellungen (angefragt: ${n}). Wähle einen grösseren Längenbereich oder mehr Stile.`
      : `${list.length} eindeutige Namen bereit.`;
    textarea.value = list.join("\n");
    textarea.hidden = false;
    return textarea.value;
  }

  /* ========================================================================
     Wiring
     ======================================================================== */

  const chips = $("chips");
  keys.forEach((k) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = styles[k].label;
    button.setAttribute("aria-pressed", selected.has(k));
    button.onclick = () => {
      if (selected.has(k)) selected.delete(k);
      else selected.add(k);
      button.setAttribute("aria-pressed", selected.has(k));
      gen();
    };
    chips.appendChild(button);
  });

  $("cp").onclick = () => {
    const text = build();
    copy(text, "Liste kopiert");
  };

  $("dl").onclick = () => {
    const text = build();
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "minecraft-usernames.txt";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast("Gespeichert");
    } catch (error) {
      const textarea = $("ta");
      textarea.hidden = false;
      textarea.select();
      $("status").textContent += " Download ist hier nicht verfügbar, die Liste steht unten. Kopiere sie.";
    }
  };

  $("go").onclick = gen;
  ["min", "max"].forEach((id) => $(id).addEventListener("change", gen));

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !/INPUT|TEXTAREA|BUTTON/.test(event.target.tagName)) {
      event.preventDefault();
      gen();
    }
  });

  gen();
  loadExternal().catch(() => {});
})();