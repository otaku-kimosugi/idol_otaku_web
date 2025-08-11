import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const BEARER = process.env.TWITTER_BEARER;

// 簡易キャッシュ（5分）
const cache = new Map();
const setCache = (k, v, ms = 60 * 60 * 1000) => cache.set(k, { v, exp: Date.now() + ms });
const getCache = (key) => {
  const hit = cache.get(key);
  return hit && hit.expire > Date.now() ? hit.data : null;
};

app.use(cors()); // 同一オリジンなら不要。Netlify等から呼ぶならONでOK
app.get("/api/twitter/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const cacheKey = `u:${username}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    // 1) username → user id
    const uRes = await fetch(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`,
      { headers: { Authorization: `Bearer ${BEARER}` } }
    );
    const uJson = await uRes.json();
    if (!uRes.ok) return res.status(uRes.status).json(uJson);
    const userId = uJson.data?.id;
    if (!userId) return res.status(404).json({ error: "User not found" });

    // 2) user timeline（最新ツイート）3件
    const tRes = await fetch(
      `https://api.x.com/2/users/${userId}/tweets?max_results=5&exclude=retweets,replies&tweet.fields=created_at,public_metrics,entities,attachments&expansions=attachments.media_keys,author_id&media.fields=preview_image_url,url`,
      { headers: { Authorization: `Bearer ${BEARER}` } }
    );
    const tJson = await tRes.json();
    if (!tRes.ok) return res.status(tRes.status).json(tJson);

    // 3件に絞る
    tJson.data = Array.isArray(tJson.data) ? tJson.data.slice(0, 3) : [];

    setCache(cacheKey, tJson);
    res.json(tJson);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

app.post("/admin/refresh/:username", async (req, res) => {
  if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) return res.sendStatus(401);
  try {
    const user = req.params.username; // ilife_nara / ion_mugi
    // ここでそのユーザー分だけ取得して該当 JSON を上書き
    // （fetch_tweets.js の処理を函数化して呼び出す）
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});