/* Spaced review: brings back questions from EARLIER days (about two, four, eight weeks ago), taken from the games of those days.
   No account, nothing is stored: it is practice, not a test. Data: assets/review/days.json and assets/review/day-N.json (built by tools/build_review_bank.py). */
(function () {
  var box = document.querySelector(".spaced[data-day]");
  if (!box) return;
  var day = parseInt(box.getAttribute("data-day"), 10);
  var lags = box.getAttribute("data-lags").split(",").map(Number);
  var base = box.getAttribute("data-base") || "../assets/review/";
  function get(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function shuffle(a) { a = a.slice(); for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = a[k]; a[k] = a[j]; a[j] = t; } return a; }
  function lessonUrl(d) { return "day-" + (d < 10 ? "0" + d : d) + ".html"; }
  function weeksAgo(n) { var w = Math.round(n / 7); return w <= 1 ? "about a week ago" : "about " + w + " weeks ago"; }

  get(base + "days.json").then(function (days) {
    var used = {}, picks = [];
    lags.forEach(function (lag) {
      var target = day - lag;
      if (target < 1) return;
      var chosen = null;
      for (var i = days.length - 1; i >= 0; i--) { if (days[i] <= target && !used[days[i]]) { chosen = days[i]; break; } }   // the nearest earlier lesson with questions
      if (chosen !== null) { used[chosen] = true; picks.push({ day: chosen, ago: day - chosen }); }
    });
    if (!picks.length) return;
    return Promise.all(picks.map(function (p) { return get(base + "day-" + p.day + ".json"); })).then(function (all) {
      var list = el("div", { class: "spaced-list" });
      picks.forEach(function (p, i) {
        var rounds = all[i], r = rounds[(day * 7 + p.day) % rounds.length];
        var card = el("div", { class: "spaced-q" });
        card.appendChild(el("p", { class: "from", text: "From Day " + p.day + " (" + weeksAgo(p.ago) + ")" }));
        if (r.c) card.appendChild(/[\n{}();=<>]/.test(r.c) ? el("pre", {}, [el("code", { text: r.c })]) : el("p", { class: "ctx", text: r.c }));
        card.appendChild(el("p", { class: "q", text: r.q }));
        var opts = el("div", { class: "choices" }), fb = el("div", { class: "fb", hidden: "" });
        fb.setAttribute("aria-live", "polite");
        var right = r.o[r.a];
        shuffle(r.o).forEach(function (text) {
          var b = el("button", { type: "button", text: text });
          b.addEventListener("click", function () {
            if (card.getAttribute("data-done")) return;
            card.setAttribute("data-done", "1");
            [].forEach.call(opts.children, function (x) { x.disabled = true; if (x.textContent === right) x.className = "right"; });
            b.className = text === right ? "right pick" : "wrong pick";
            fb.hidden = false; fb.removeAttribute("hidden");
            fb.textContent = "";
            fb.appendChild(el("b", { text: text === right ? "Yes. " : "Not quite. " }));
            fb.appendChild(document.createTextNode((text === right ? "" : "The answer is: " + right + ". ") + r.why + " "));
            fb.appendChild(el("a", { href: lessonUrl(p.day), target: "_blank", rel: "noopener", text: "Open Day " + p.day }));
          });
          opts.appendChild(b);
        });
        card.appendChild(opts); card.appendChild(fb); list.appendChild(card);
      });
      box.appendChild(el("h3", { text: "Spaced review: from earlier days" }));
      box.appendChild(el("p", { class: "note", text: "Facts fade unless you meet them again after a while. These " + picks.length + " come from lessons a few weeks back. Nothing is saved: it is practice." }));
      box.appendChild(list);
      box.removeAttribute("hidden");
    });
  }).catch(function () { /* no questions: the box stays hidden */ });
})();
