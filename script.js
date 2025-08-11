const API_BASE = "http://localhost:3000"; // デプロイ先に合わせて変更

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

// シンプルなURL/ハッシュタグ/メンションのリンク化（雑に最低限）
function linkify(text) {
  let t = escapeHTML(text);
  t = t.replace(/https?:\/\/\S+/g, (url) => `<a class="tweet-link" href="${url}" target="_blank" rel="noreferrer">${url}</a>`);
  t = t.replace(/(^|\\s)#([\\w_]+)/g, (_m, sp, tag) => `${sp}<a class="tweet-link" href="https://x.com/hashtag/${tag}" target="_blank" rel="noreferrer">#${tag}</a>`);
  t = t.replace(/(^|\\s)@([A-Za-z0-9_]+)/g, (_m, sp, u) => `${sp}<a class="tweet-link" href="https://x.com/${u}" target="_blank" rel="noreferrer">@${u}</a>`);
  return t;
}

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

    const html = tweets
      .map((tw) => {
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
      })
      .join("");
    container.innerHTML = html;
  } catch (e) {
    console.error(e);
    container.innerHTML = "エラーが発生しました。時間をおいて再度お試しください。";
  }
}
async function mountTweets(container) {
  const username = container.dataset.username;
  if (!username) return;

  // 同じ階層の JSON を確実に取りに行く（キャッシュ無効化）
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
        <div class="tweet-text">${linkify(t.text || "")}</div>
        <div><a class="link" href="https://x.com/${username}/status/${t.id}" target="_blank" rel="noreferrer">Xで開く →</a></div>
      </article>
    `).join("");
  } catch (e) {
    console.error("fetch error:", e, "url:", url);
    container.textContent = "読み込み失敗";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const box = document.getElementById("tweets");
  if (box) mountTweets(box); // こっちを使う
});