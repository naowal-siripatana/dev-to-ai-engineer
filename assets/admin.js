/* Admin page (/admin): member statistics for the owner of the site.
   Who may see the data is decided in the DATABASE (supabase/admin.sql: the functions check that the caller is on the admin list).
   This file only signs in with Google and draws what the database returns. Everything that comes from members (names, emails, time zones)
   is untrusted text: it is only ever put on the page with textContent, never as HTML. */
(function () {
  "use strict";
  var DAY_MS = 86400000;
  var PAGE = 1000;   // the API returns at most 1000 rows per request: read in pages

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function maskEmail(e) {
    if (!e) return "";
    var at = e.lastIndexOf("@");
    return at < 1 ? "***" : e.charAt(0) + "***" + e.slice(at);
  }
  function fmtDate(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    return isNaN(d) ? "-" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function ago(iso, now) {
    if (!iso) return "never";
    var days = Math.floor((now - new Date(iso).getTime()) / DAY_MS);
    return days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
  }
  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mondayOf(d) {
    var x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  }

  /* ---------- the numbers (pure: no page, no network: easy to test) ---------- */
  function compute(members, progress, curriculum, now) {
    var days = curriculum.days, byId = {};
    days.forEach(function (d, i) { byId[d.id] = { idx: i, items: d.items, m: d.m }; });
    var doneBy = {};   // user id -> { day id: true } for the days whose items were ALL ticked (the rule of the My Learning page)
    progress.forEach(function (r) {
      var day = byId[r.day];
      if (!day) return;
      var have = {};
      (r.items || []).forEach(function (i) { have[i] = true; });
      if (day.items.every(function (i) { return have[i]; })) (doneBy[r.user_id] = doneBy[r.user_id] || {})[r.day] = true;
    });
    var rows = members.map(function (m) {
      var done = doneBy[m.user_id] || {}, count = 0, now_at = null;
      days.forEach(function (d) { if (done[d.id]) count++; else if (now_at === null) now_at = d.id; });
      var seen = [m.last_sign_in_at, m.last_activity].filter(Boolean).map(function (x) { return new Date(x).getTime(); });
      return {
        user_id: m.user_id, name: m.full_name || "", email: m.email || "", joined: m.joined_at, signedIn: m.last_sign_in_at, activity: m.last_activity,
        tz: m.tz || "", followed: !!m.subscribed_ack, emailOk: !!m.email_opt_in, daysDone: count, nowAt: now_at, done: done,
        lastSeen: seen.length ? Math.max.apply(null, seen) : 0, items: Number(m.items_ticked) || 0
      };
    });
    var week = 7 * DAY_MS;
    var cards = {
      members: rows.length,
      joined7: rows.filter(function (r) { return r.joined && now - new Date(r.joined).getTime() <= week; }).length,
      active7: rows.filter(function (r) { return r.lastSeen && now - r.lastSeen <= week; }).length,
      startedDay1: rows.filter(function (r) { return r.items > 0; }).length,
      day1Done: rows.filter(function (r) { return r.done[1]; }).length,
      medianDays: median(rows.map(function (r) { return r.daysDone; })),
      followed: rows.filter(function (r) { return r.followed; }).length,
      emailOk: rows.filter(function (r) { return r.emailOk; }).length
    };
    var weeks = [], monday = mondayOf(new Date(now));
    for (var k = 7; k >= 0; k--) {
      var start = new Date(monday.getTime() - k * week), end = start.getTime() + week;
      weeks.push({
        label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
        n: rows.filter(function (r) { var t = new Date(r.joined).getTime(); return t >= start.getTime() && t < end; }).length
      });
    }
    var levels = (curriculum.modules || []).map(function (mod, k) {
      return { label: "M" + mod.num + " " + mod.title, n: rows.filter(function (r) { return days.some(function (d) { return d.m === k && r.done[d.id]; }); }).length };
    });
    var first = days.filter(function (d) { return d.id <= 14; }).map(function (d) {
      return { label: d.id === 0 ? "Day 0 (setup)" : "Day " + d.id, n: rows.filter(function (r) { return r.done[d.id]; }).length };
    });
    return { rows: rows, cards: cards, weeks: weeks, levels: levels, firstDays: first, total: rows.length };
  }

  /* ---------- drawing ---------- */
  var state = { model: null, now: Date.now(), showEmails: false, sort: { key: "joined", dir: -1 }, filter: "", subscribers: null };

  function drawCards(c) {
    var items = [
      ["Members", c.members, "signed in at least once"],
      ["Joined in the last 7 days", c.joined7, ""],
      ["Active in the last 7 days", c.active7, "signed in or ticked something"],
      ["Ticked at least one item", c.startedDay1, "of " + c.members],
      ["Finished Day 1", c.day1Done, "every item ticked"],
      ["Median days finished", c.medianDays, "half of the members are below this"],
      ["Ticked “follow the channel”", c.followed, "an honour system"],
      ["Agreed to emails", c.emailOk, "email_opt_in"]
    ];
    var box = $("cards"); box.textContent = "";
    items.forEach(function (i) {
      box.appendChild(el("div", { class: "card" }, [el("p", { class: "num", text: String(i[1]) }), el("p", { class: "lab", text: i[0] }), i[2] ? el("p", { class: "sub", text: i[2] }) : null]));
    });
  }
  function drawBars(id, list, total) {
    var box = $(id); box.textContent = "";
    var max = Math.max(1, total, Math.max.apply(null, list.map(function (x) { return x.n; })));
    list.forEach(function (x) {
      var fill = el("span", { class: "fill" });
      fill.style.width = Math.round((x.n / max) * 100) + "%";
      box.appendChild(el("div", { class: "row" }, [el("span", { class: "lab", text: x.label }), el("span", { class: "track" }, [fill]), el("span", { class: "val", text: String(x.n) })]));
    });
  }
  var COLS = [
    ["name", "Name"], ["email", "Email"], ["joined", "Joined"], ["signedIn", "Last sign-in"], ["daysDone", "Days finished"],
    ["nowAt", "Now at"], ["activity", "Last tick"], ["tz", "Time zone"], ["followed", "Followed"], ["emailOk", "Emails OK"]
  ];
  function sortValue(r, key) {
    var v = r[key];
    if (key === "joined" || key === "signedIn" || key === "activity") return v ? new Date(v).getTime() : 0;
    if (key === "nowAt") return v === null ? 9999 : v;
    if (typeof v === "boolean") return v ? 1 : 0;
    return typeof v === "string" ? v.toLowerCase() : v;
  }
  function drawTable() {
    var m = state.model, now = state.now, q = state.filter.trim().toLowerCase();
    var head = $("members").tHead; head.textContent = "";
    var tr = el("tr");
    COLS.forEach(function (c) {
      var th = el("th", { scope: "col", "aria-sort": state.sort.key === c[0] ? (state.sort.dir > 0 ? "ascending" : "descending") : "none" });
      var b = el("button", { type: "button", class: "sortbtn", text: c[1] + (state.sort.key === c[0] ? (state.sort.dir > 0 ? " ▲" : " ▼") : "") });
      b.addEventListener("click", function () {
        state.sort = { key: c[0], dir: state.sort.key === c[0] ? -state.sort.dir : (c[0] === "name" || c[0] === "email" || c[0] === "tz" ? 1 : -1) };
        drawTable();
      });
      th.appendChild(b); tr.appendChild(th);
    });
    head.appendChild(tr);
    var rows = m.rows.filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.email.toLowerCase().indexOf(q) >= 0; });
    rows.sort(function (a, b) {
      var x = sortValue(a, state.sort.key), y = sortValue(b, state.sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * state.sort.dir;
    });
    var body = $("members").tBodies[0]; body.textContent = "";
    rows.forEach(function (r) {
      var cells = [
        r.name || "(no name)", state.showEmails ? r.email : maskEmail(r.email), fmtDate(r.joined), r.signedIn ? ago(r.signedIn, now) : "-",
        String(r.daysDone), r.nowAt === null ? "finished" : "Day " + r.nowAt, r.activity ? ago(r.activity, now) : "-", r.tz || "-",
        r.followed ? "yes" : "no", r.emailOk ? "yes" : "no"
      ];
      var row = el("tr");
      cells.forEach(function (t, i) { row.appendChild(el("td", { text: t, "data-label": COLS[i][1] })); });
      body.appendChild(row);
    });
    $("members-note").textContent = rows.length + " of " + m.rows.length + " members shown" + (state.showEmails ? "" : ". Emails are hidden: tick “Show emails” to see them.");
  }
  function drawAll() {
    var m = state.model;
    drawCards(m.cards);
    drawBars("weeks", m.weeks, 0);
    drawBars("levels", m.levels, m.total);
    drawBars("firstdays", m.firstDays, m.total);
    drawTable();
    var s = state.subscribers;
    $("subscribers").textContent = s ? s.active + " active, " + s.unsubscribed + " unsubscribed. (Only counts: the addresses stay in the Supabase table.)" : "";
    $("updated").textContent = "Updated " + new Date(state.now).toLocaleString("en-GB") + ". Reading the database again when you press Refresh.";
  }
  function showDashboard(members, progress, subscribers, curriculum, now) {
    state.now = now || Date.now();
    state.model = compute(members, progress, curriculum, state.now);
    state.subscribers = subscribers;
    drawAll();
    show("dash");
  }

  var STATES = ["loading", "signin", "denied", "error", "dash"];
  function show(name) {
    STATES.forEach(function (s) { $("state-" + s).hidden = s !== name; });
    $("signout").hidden = name === "signin" || name === "loading";
  }

  /* ---------- sign-in and loading ---------- */
  var sb = null;
  function fetchAll(call) {   // read a function's rows in pages of 1000
    var out = [];
    function next(from) {
      return call().range(from, from + PAGE - 1).then(function (res) {
        if (res.error) throw res.error;
        out = out.concat(res.data || []);
        return (res.data || []).length === PAGE ? next(from + PAGE) : out;
      });
    }
    return next(0);
  }
  function fail(err) {
    var text = (err && (err.message || err.msg)) || String(err);
    if (err && (err.code === "42501" || /not allowed/i.test(text))) return denied();
    var hint = err && (err.code === "PGRST202" || /could not find the function/i.test(text)) ? " The admin functions are not installed yet: run supabase/admin.sql in the Supabase SQL editor." : "";
    $("error-text").textContent = text + hint;
    show("error");
  }
  var current = null;
  function denied() {
    $("denied-who").textContent = current && current.user ? "You are signed in as " + current.user.email + "." : "";
    show("denied");
  }
  function load() {
    show("loading");
    return sb.rpc("is_admin").then(function (res) {
      if (res.error) throw res.error;
      if (res.data !== true) return denied();
      return Promise.all([
        fetchAll(function () { return sb.rpc("admin_members"); }),
        fetchAll(function () { return sb.rpc("admin_progress"); }),
        sb.rpc("admin_subscribers"),
        fetch("/curriculum/index.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("curriculum/index.json: HTTP " + r.status); return r.json(); })
      ]).then(function (all) {
        if (all[2].error) throw all[2].error;
        showDashboard(all[0], all[1], (all[2].data || [])[0] || null, all[3], Date.now());
      });
    }).catch(fail);
  }
  function start() {
    var cfg = window.APP_CONFIG || {};
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      $("error-text").textContent = "The sign-in library or config.js did not load. Check your connection and reload.";
      return show("error");
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } });
    $("signin").addEventListener("click", function () {
      sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    });
    $("signout").addEventListener("click", function () {
      sb.auth.signOut().then(function () { current = null; $("who").hidden = true; show("signin"); });
    });
    $("retry").addEventListener("click", init);
    $("refresh").addEventListener("click", load);
    $("show-emails").addEventListener("change", function (e) { state.showEmails = e.target.checked; if (state.model) drawTable(); });
    $("filter").addEventListener("input", function (e) { state.filter = e.target.value; if (state.model) drawTable(); });
    init();
  }
  function init() {
    show("loading");
    sb.auth.getSession().then(function (res) {
      current = res.data && res.data.session;
      if (!current) { $("who").hidden = true; return show("signin"); }
      $("who").textContent = current.user.email || "";
      $("who").hidden = false;
      return load();
    }).catch(fail);
  }

  window.AdminUI = { compute: compute, maskEmail: maskEmail, showDashboard: showDashboard, show: show };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
