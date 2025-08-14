const API_BASE = "http://localhost:3000"; // 必要なら変更

/* ========= ユーティリティ ========= */
function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function fmtDate(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

// URL / #タグ / @メンション をリンク化
function linkify(text) {
  let t = escapeHTML(text || "");
  t = t.replace(/https?:\/\/\S+/g, (url) => `<a class="tweet-link" href="${url}" target="_blank" rel="noreferrer">${url}</a>`);
  t = t.replace(/(^|\s)#([\w_]+)/g, (_m, sp, tag) => `${sp}<a class="tweet-link" href="https://x.com/hashtag/${tag}" target="_blank" rel="noreferrer">#${tag}</a>`);
  t = t.replace(/(^|\s)@([A-Za-z0-9_]+)/g, (_m, sp, u) => `${sp}<a class="tweet-link" href="https://x.com/${u}" target="_blank" rel="noreferrer">@${u}</a>`);
  return t;
}

/* ========= ツイート取得（APIモード：今は未使用でも残す） ========= */
async function loadTweets(container) {
  const username = container.dataset.username;
  if (!username) return;

  container.innerHTML = "読み込み中…";
  try {
    const res = await fetch(`${API_BASE}/api/twitter/${encodeURIComponent(username)}`);
    const json = await res.json();
    if (!res.ok) {
      container.innerHTML = `取得に失敗しました（${res.status}）`;
      return;
    }
    const tweets = json.data || [];
    if (!tweets.length) {
      container.innerHTML = "ポストが見つかりませんでした。";
      return;
    }

    container.innerHTML = tweets.map((tw) => {
      const text = linkify(tw.text || "");
      const date = fmtDate(tw.created_at);
      const url = `https://x.com/${username}/status/${tw.id}`;
      return `
        <article class="tweet-card">
          <div class="tweet-meta">${date}</div>
          <div class="tweet-text">${text}</div>
          <div><a class="tweet-link" href="${url}" target="_blank" rel="noreferrer">Xで開く →</a></div>
        </article>
      `;
    }).join("");
  } catch (e) {
    console.error(e);
    container.innerHTML = "エラーが発生しました。時間をおいて再度お試しください。";
  }
}

/* ========= ツイート取得（ローカルJSONモード） ========= */
async function mountTweets(container) {
  const username = container.dataset.username;
  if (!username) return;

  const url = `./tweets_${username}.json`;
  container.textContent = "読み込み中…";

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("JSON fetch failed:", { url, status: res.status, body: txt.slice(0, 200) });
      container.textContent = `読み込み失敗（${res.status}）`;
      return;
    }

    const json = await res.json();
    const tweets = Array.isArray(json.data) ? json.data : [];
    if (tweets.length === 0) {
      container.textContent = "ポストが見つかりませんでした。";
      return;
    }

    container.innerHTML = tweets.slice(0, 3).map(t => `
      <article class="tweet-card">
        <div class="tweet-meta">${fmtDate(t.created_at)}</div>
        <div class="tweet-text">${linkify(t.text)}</div>
        <div><a class="tweet-link" href="https://x.com/${username}/status/${t.id}" target="_blank" rel="noreferrer">Xで開く →</a></div>
      </article>
    `).join("");
  } catch (e) {
    console.error("fetch error:", e, "url:", url);
    container.textContent = "読み込み失敗";
  }
}

/* ========= Xアイコンの自動差し替え ========= */
async function mountAvatar(imgEl) {
  const username = imgEl.dataset.username; // 例: ion_mugi
  if (!username) return;
  try {
    const res = await fetch(`./user_${username}.json`, { cache: "no-store" });
    if (!res.ok) return;
    const u = await res.json();
    if (u.profile_image_url) imgEl.src = u.profile_image_url;

    // 名前も上書きしたいとき用（例: data-name-target="#mugi-name"）
    const nameTarget = imgEl.dataset.nameTarget;
    if (nameTarget) {
      const t = document.querySelector(nameTarget);
      if (t && u.name) t.textContent = u.name;
    }
  } catch (e) {
    console.warn("avatar load failed", username, e);
  }
}

/* ========= 現場リスト：新しい順に並べ替え ========= */
function sortEventsList() {
  const list = document.getElementById("events-list");
  if (!list) return;
  const items = Array.from(list.querySelectorAll("li"));
  items.sort((a, b) => new Date(b.dataset.date) - new Date(a.dataset.date));
  list.innerHTML = "";
  items.forEach(li => list.appendChild(li));
}

/* ========= スクロール出現（.reveal） ========= */
function setupReveals() {
  const io = new IntersectionObserver((ents) => {
    ents.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('show'); io.unobserve(e.target); }
    });
  }, { threshold: .15 });

  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // 現場リストは順番に出現
  document.querySelectorAll('#events-list li').forEach((li, i) => {
    li.style.setProperty('--i', i);
    li.classList.add('reveal');
    io.observe(li);
  });
}

/* ========= 紙吹雪 & クリック遷移ディレイ ========= */
function confetti(x = window.innerWidth / 2) {
  const wrap = document.createElement('div'); wrap.className = 'confetti';
  const emo = ["🎉", "✨", "💖", "🎀", "🌟", "💫", "🎈"];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('span');
    s.textContent = emo[i % emo.length];
    s.style.left = (x + (Math.random() * 240 - 120)) + 'px';
    s.style.animationDelay = (Math.random() * 300) + 'ms';
    s.style.transform = `translateY(-20px) rotate(${Math.random() * 180}deg)`;
    wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1700);
}

function setupConfettiClick() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.oshi-card');
    if (!a) return;
    e.preventDefault(); // すぐ遷移させない
    confetti(e.clientX || (window.innerWidth / 2));
    setTimeout(() => { window.location.href = a.href; }, 1000); // 0.35秒後に遷移
  });

  // 単体アバターでも発火させたい場合（任意）
  document.addEventListener('click', (e) => {
    if (e.target.classList?.contains('avatar')) {
      confetti(e.clientX || (window.innerWidth / 2));
    }
  });
}

/* ========= 初期化 ========= */
document.addEventListener("DOMContentLoaded", () => {
  // ツイート（ページに存在する場合のみ）
  const tweetsBox = document.getElementById("tweets");
  if (tweetsBox) mountTweets(tweetsBox);

  // Xアイコン（ページ内に複数OK）
  document.querySelectorAll(".x-avatar").forEach(mountAvatar);

  // 現場リスト→新しい順
  sortEventsList();

  // reveal付与（タイトルや説明など）
  ['#site-title', '.my-icon', '.tagline', '.oshi-cards', '.tweet-section', 'main h2']
    .forEach(sel => document.querySelectorAll(sel).forEach(el => el.classList.add('reveal')));

  // スクロール出現
  setupReveals();

  // 紙吹雪
  setupConfettiClick();
});

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("page-loaded");
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("a").forEach(a => {
    if (a.href && !a.href.startsWith("#")) {
      a.addEventListener("click", e => {
        e.preventDefault();
        document.body.classList.add("fade-out");
        setTimeout(() => {
          window.location.href = a.href;
        }, 500); // アニメ時間と合わせる
      });
    }
  });
});