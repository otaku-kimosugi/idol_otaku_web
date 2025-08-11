// fetch_tweets.js
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const BEARER = process.env.TWITTER_BEARER;
if (!BEARER) throw new Error("TWITTER_BEARER が .env にありません");

// 追加: 更新間隔（必要なら数値だけ変えてOK）
const TWEET_INTERVAL_MIN = 60;   // ツイートは1時間おき
const PROFILE_INTERVAL_H  = 24;  // アイコンは1日おき

// 追加: ファイルの最終更新からの経過で実行可否を決める
const readJSON = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const dueByMinutes = (p, min) => {
  const j = readJSON(p);
  if (!j || !j.fetched_at) return true;               // 初回は実行
  const diffMin = (Date.now() - new Date(j.fetched_at).getTime()) / 60000;
  return diffMin >= min;
};
const dueByHours = (p, h) => dueByMinutes(p, h * 60);

// 共通: API呼び出し（twitter.com と x.com の両方試す）
async function callX(urlPath) {
  const hosts = ["https://api.twitter.com", "https://api.x.com"];
  let lastErr;
  for (const host of hosts) {
    const url = `${host}${urlPath}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${BEARER}`, "User-Agent": "oshi-portfolio/1.0" }
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (res.ok) return json;
    lastErr = { status: res.status, json, url };
    if (res.status === 429) {                        // レート制限時は少し待って次へ
      console.warn("Rate limited. Waiting 10s then retrying…");
      await new Promise(r => setTimeout(r, 10000));
      continue;
    }
  }
  throw new Error(`X API error: ${lastErr.status} on ${lastErr.url}\n` + JSON.stringify(lastErr.json, null, 2));
}

async function getUserId(username) {
  const data = await callX(`/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url,name,username`);
  const id = data?.data?.id;
  if (!id) throw new Error(`Could not resolve user id for @${username}. Response:\n` + JSON.stringify(data, null, 2));
  return id;
}

async function fetchTweetsById(userId) {
  // まずは除外あり → 0件なら除外なし
  let data = await callX(`/2/users/${userId}/tweets?max_results=5&exclude=retweets,replies&tweet.fields=created_at`);
  let arr = Array.isArray(data?.data) ? data.data : [];
  if (arr.length === 0) {
    data = await callX(`/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at`);
    arr = Array.isArray(data?.data) ? data.data : [];
  }
  return { data: arr };
}

// ここは“基盤”を保ちつつ、fetched_at 付与＆間隔ガードを追加
async function saveTweets(username, outFile) {
  // 追加: 間隔チェック
  if (!dueByMinutes(outFile, TWEET_INTERVAL_MIN)) {
    console.log(`skip tweets for @${username} (not due)`);
    return;
  }
  try {
    console.log(`→ fetching @${username}`);
    const id = await getUserId(username);
    const tweets = await fetchTweetsById(id);
    const out = { fetched_at: new Date().toISOString(), username, ...tweets };
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log(`  saved ${tweets.data?.length || 0} tweets to ${outFile}`);
  } catch (e) {
    console.error(`  fail for @${username}: ${e.message}`);
    // 初回でも表示が壊れないようプレースホルダを書き出す
    const placeholder = {
      fetched_at: new Date().toISOString(),
      username,
      data: [{ id: "placeholder-1", text: "（一時表示）API制限のため取得できませんでした。", created_at: new Date().toISOString() }]
    };
    fs.writeFileSync(outFile, JSON.stringify(placeholder, null, 2));
    console.log(`  wrote placeholder to ${outFile}`);
  }
}

// 追加関数: ユーザー情報（アイコンURL）
async function fetchUser(username) {
  const hosts = ["https://api.twitter.com", "https://api.x.com"];
  for (const host of hosts) {
    const res = await fetch(
      `${host}/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url,name,username`,
      { headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER}` } }
    );
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (res.ok) {
      const data = json.data || {};
      if (data.profile_image_url) data.profile_image_url = data.profile_image_url.replace("_normal", "_400x400");
      return { username: data.username, name: data.name, profile_image_url: data.profile_image_url };
    }
    if (res.status === 429) throw new Error("429");
  }
  return null;
}

// 追加: プロフィール保存（間隔ガード＋fetched_at付き）
async function saveUser(username, outFile) {
  if (!dueByHours(outFile, PROFILE_INTERVAL_H)) {
    console.log(`skip profile for @${username} (not due)`);
    return;
  }
  try {
    console.log(`→ fetch user @${username}`);
    const u = await fetchUser(username);
    if (!u) return;
    const out = { fetched_at: new Date().toISOString(), ...u };
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log(`  wrote ${outFile}`);
  } catch (e) {
    if (String(e.message).includes("429")) {
      console.warn(`  rate limited for @${username}, keep existing user file`);
    } else {
      console.warn(`  error for @${username}: ${e.message}`);
    }
  }
}

// 実行（順序そのまま／基盤維持）
(async () => {
  try {
    await saveTweets("ilife_nara", "tweets_ilife_nara.json");
    await saveTweets("ion_mugi",  "tweets_ion_mugi.json");
    await saveUser("ilife_nara",  "user_ilife_nara.json");
    await saveUser("ion_mugi",    "user_ion_mugi.json");
    console.log("Done.");
  } catch (e) {
    console.error("\n--- ERROR ---\n" + e.message);
    process.exit(1);
  }
})();