"use strict";

/**
 * 执行批量下载：使用 chrome.downloads API
 * @param {{url:string,filename:string}[]} items
 * @returns {Promise<{started:number,failed:number}>}
 */
async function performDownloads(items) {
  let started = 0;
  let failed = 0;
  for (const it of items) {
    try {
      await new Promise((resolve, reject) => {
        chrome.downloads.download(
          {
            url: it.url,
            filename: it.filename,
            saveAs: false,
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else if (!downloadId) {
              reject(new Error("无下载 ID"));
            } else {
              resolve(downloadId);
            }
          }
        );
      });
      started += 1;
      console.log("[MOC Downloader] 下载开始:", it.filename, it.url);
    } catch (e) {
      failed += 1;
      console.error("[MOC Downloader] 下载失败:", it.filename, it.url, e);
    }
  }
  return { started, failed };
}

/**
 * 监听来自内容脚本的下载请求
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.kind === "downloadItems" && Array.isArray(msg.items)) {
        const summary = await performDownloads(msg.items);
        sendResponse({ ok: true, summary });
      } else {
        sendResponse({ ok: false, error: "未知消息或缺少 items" });
      }
    } catch (e) {
      console.error("[MOC Downloader] 后台处理失败:", e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  // 异步响应
  return true;
});
