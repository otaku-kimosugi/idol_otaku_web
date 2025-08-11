// updater.js
import cron from "node-cron";
import { exec } from "node:child_process";

function run(cmd){ return new Promise(r=>exec(cmd,(e,stdout,stderr)=>{console.log(stdout||stderr); r();})) }

// 10分おきに実行（必要なら15分/30分に）
cron.schedule("*/15 * * * *", async () => {
  console.log("[cron] updating tweets…", new Date().toISOString());
  await run("node fetch_tweets.js"); // 429ならプレースホルダ書く実装にしておくと安心
});