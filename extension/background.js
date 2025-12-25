"use strict";

/**
 * 维护 URL 到期望文件名的映射，用于在确定最终保存名时强制重命名
 * @type {Map<string,string>}
 */
const desiredByUrl = new Map();

/**
 * 注册下载文件名覆盖事件
 * - 当浏览器决定文件名时，如果存在我们记录的期望名，则进行覆盖
 * @returns {void}
 */
function registerFilenameOverrideHandlers() {
  try {
    chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
      try {
        const key = (item.url || "").split("?")[0];
        const desired = desiredByUrl.get(key);
        if (desired) {
          suggest({ filename: desired, conflictAction: "uniquify" });
        }
      } catch (e) {
        console.error("[MOC Downloader] 覆盖文件名失败:", e);
      }
    });
  } catch (e) {
    console.error("[MOC Downloader] 注册文件名覆盖事件失败:", e);
  }
}

// 初始化事件监听
registerFilenameOverrideHandlers();

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
      // 预先记录期望的文件名（按 URL 映射），用于 onDeterminingFilename 覆盖
      const urlKey = (it.url || "").split("?")[0];
      desiredByUrl.set(urlKey, it.filename);
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
