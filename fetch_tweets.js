// fetch_tweets.js
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const BEARER = process.env.TWITTER_BEARER;
if (!BEARER) throw new Error("TWITTER_BEARER が .env にありません");

// 共通: API呼び出し（twitter.com と x.com の両方試す）
async function callX(urlPath) {
  const hosts = ["https://api.twitter.com", "https://api.x.com"];
  let lastErr;
  for (const host of hosts) {
    const url = `${host}${urlPath}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${BEARER}`,
        "User-Agent": "oshi-portfolio/1.0"
      }
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (res.ok) return json;
    lastErr = { status: res.status, json, url };
    // 429は待ってから再試行（10秒）
    if (res.status === 429) {
      console.warn("Rate limited. Waiting 10s then retrying…");
      await new Promise(r => setTimeout(r, 10000));
      continue;
    }
    // 他のエラーは次ホストへ
  }
  throw new Error(`X API error: ${lastErr.status} on ${lastErr.url}\n` + JSON.stringify(lastErr.json, null, 2));
}

async function getUserId(username) {
  const data = await callX(`/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url,name,username`);
  const id = data?.data?.id;
  if (!id) {
    throw new Error(`Could not resolve user id for @${username}. Response:\n` + JSON.stringify(data, null, 2));
  }
  return id;
}

async function fetchTweetsById(userId) {
  // まずは除外あり
  let data = await callX(`/2/users/${userId}/tweets?max_results=5&exclude=retweets,replies&tweet.fields=created_at`);
  let arr = Array.isArray(data?.data) ? data.data : [];
  // 0件なら除外なしで再取得
  if (arr.length === 0) {
    data = await callX(`/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at`);
    arr = Array.isArray(data?.data) ? data.data : [];
  }
  return { data: arr };
}

async function saveTweets(username, outFile) {
  try {
    console.log(`→ fetching @${username}`);
    const id = await getUserId(username);
    const tweets = await fetchTweetsById(id);
    fs.writeFileSync(outFile, JSON.stringify(tweets, null, 2));
    console.log(`  saved ${tweets.data?.length || 0} tweets to ${outFile}`);
  } catch (e) {
    console.error(`  fail for @${username}: ${e.message}`);
    // 初回でも表示が壊れないようプレースホルダを書き出す
    const placeholder = {
      data: [
        {
          id: "placeholder-1",
          text: "（一時表示）API制限のため取得できませんでした。",
          created_at: new Date().toISOString()
        }
      ]
    };
    fs.writeFileSync(outFile, JSON.stringify(placeholder, null, 2));
    console.log(`  wrote placeholder to ${outFile}`);
  }
}

(async () => {
  try {
    await saveTweets("ilife_nara", "tweets_ilife_nara.json");
    await saveTweets("ion_mugi", "tweets_ion_mugi.json");
    console.log("Done.");
  } catch (e) {
    console.error("\n--- ERROR ---\n" + e.message);
    process.exit(1);
  }
})();