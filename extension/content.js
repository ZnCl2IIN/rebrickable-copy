"use strict";

/**
 * 提取 URL 中的 MOC 编号（如 MOC-104978 => 104978）
 * @returns {string} MOC 编号字符串，若未匹配则返回空字符串
 */
function getMocIdFromLocation() {
  try {
    const pathname = window.location.pathname || "";
    const m = pathname.match(/MOC-(\d+)/i);
    return m ? m[1] : "";
  } catch (e) {
    console.error("[MOC Downloader] 解析 MOC 编号失败:", e);
    return "";
  }
}

/**
 * 从页面上提取 MOC 名称（优先取主标题，其次从 URL slug 推断）
 * @returns {string} 标题字符串
 */
function getMocTitleFromDocument() {
  try {
    // 尝试主标题
    const h1 = document.querySelector("h1");
    if (h1 && h1.textContent) {
      return sanitizeName(h1.textContent.trim());
    }
    // 回退：从 URL 推断（第二段一般是名称 slug）
    const segments = (window.location.pathname || "")
      .split("/")
      .filter(Boolean);
    const slug = segments.find((s) => /^MOC-\d+$/i.test(s))
      ? segments[
          segments.indexOf(segments.find((s) => /^MOC-\d+$/i.test(s))) + 1
        ]
      : null;
    if (slug) {
      return sanitizeName(slug.replace(/[-_]+/g, " ").trim());
    }
    return "unknown-moc";
  } catch (e) {
    console.error("[MOC Downloader] 解析 MOC 标题失败:", e);
    return "unknown-moc";
  }
}

/**
 * 规范化名称字符串用于文件命名（移除非法文件字符）
 * @param {string} name 原始名称
 * @returns {string} 清理后的名称
 */
function sanitizeName(name) {
  return (name || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 清理可能包含反引号/引号的 URL 字符串
 * @param {string} s 原始字符串
 * @returns {string} 清理后的字符串
 */
function cleanUrlLike(s) {
  try {
    return (s || "")
      .trim()
      .replace(/^[`'"]+/, "")
      .replace(/[`'"]+$/, "");
  } catch {
    return s || "";
  }
}

/**
 * 仅从页面轮播区域（ul.slides）收集图片 URL
 * - 优先取 <img data-src>，否则取 <img src>
 * - 忽略缩略图 data-thumb（只保留大图）
 * - 自动去重并清理异常包装字符
 * @returns {string[]} 图片 URL 列表（去重）
 */
function collectImageUrls() {
  const urls = new Set();
  try {
    const items = document.querySelectorAll("ul.slides li");
    items.forEach((li) => {
      li.querySelectorAll("img").forEach((img) => {
        const raw =
          img.getAttribute("data-src") || img.getAttribute("src") || "";
        const cleaned = cleanUrlLike(raw);
        if (!cleaned) return;
        // 仅保留图片链接，保持原始 CDN 路径与尺寸
        if (isImageUrl(cleaned)) {
          urls.add(toAbsoluteUrl(cleaned.split("?")[0]));
        }
      });
    });
    console.log("[MOC Downloader] 轮播区域图片数量:", urls.size);
  } catch (e) {
    console.error("[MOC Downloader] 收集轮播图片失败:", e);
  }
  // 回退：若无轮播图，则尝试提取主图
  if (urls.size === 0) {
    const heroUrls = collectHeroImageUrls();
    heroUrls.forEach((u) => urls.add(u));
    console.log("[MOC Downloader] 主图区域图片数量:", heroUrls.length);
  }
  return Array.from(urls);
}

/**
 * 采集主展示图（非轮播页面）
 * - 按 MOC-ID 过滤：匹配 alt 中的 "MOC-<id>" 或路径包含 "moc-<id>"
 * - 优先 data-src，其次 src
 * - 仅保存图片链接，移除查询串
 * @returns {string[]} 图片 URL 列表
 */
function collectHeroImageUrls() {
  const out = new Set();
  try {
    const mocId = getMocIdFromLocation();
    const imgs = document.querySelectorAll("img");
    imgs.forEach((img) => {
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      const raw = img.getAttribute("data-src") || img.getAttribute("src") || "";
      const cleaned = cleanUrlLike(raw);
      if (!cleaned) return;
      const path = cleaned.split("?")[0].toLowerCase();
      const hasMocInAlt = mocId ? alt.includes(`moc-${mocId}`) : false;
      const hasMocInPath = mocId
        ? path.includes(`/mocs/moc-${mocId}/`) ||
          path.includes(`/thumbs/mocs/moc-${mocId}/`)
        : path.includes("/mocs/");
      if ((hasMocInAlt || hasMocInPath) && isImageUrl(cleaned)) {
        out.add(toAbsoluteUrl(cleaned.split("?")[0]));
      }
    });
  } catch (e) {
    console.error("[MOC Downloader] 收集主图失败:", e);
  }
  return Array.from(out);
}
/**
 * 从“购买文件区域”收集附件 URL（仅限 /mocs/purchases/download/ 链接）
 * - 作用域限制在包含下载列表的容器（div.pb-30）
 * - 提取文本优先使用内部 .trunc[title]，否则使用 a 的文本
 * - 保留查询参数（如 expire），以保证下载链接有效
 * @returns {{url:string,text:string}[]} 附件信息列表
 */
function collectAttachmentUrls() {
  const results = [];
  try {
    const containers = document.querySelectorAll("div.pb-30");
    containers.forEach((box) => {
      const anchors = box.querySelectorAll(
        'a[href*="/mocs/purchases/download/"]'
      );
      anchors.forEach((a) => {
        const hrefRaw = a.getAttribute("href") || "";
        const href = cleanUrlLike(hrefRaw);
        if (!href) return;
        // 文本：优先 .trunc[title]
        const trunc = a.querySelector(".trunc");
        const titleAttr =
          (trunc && trunc.getAttribute("title")) || a.textContent || "";
        const text = sanitizeName(titleAttr);
        const absoluteUrl = toAbsoluteUrl(href);
        results.push({ url: absoluteUrl, text });
      });
    });
    console.log("[MOC Downloader] 购买区附件数量:", results.length);
  } catch (e) {
    console.error("[MOC Downloader] 收集附件 URL 失败:", e);
  }
  return dedupeAttachmentResults(results);
}

/**
 * 将 URL 简单标准化（移除查询串，转为绝对地址）
 * - 不再替换 /media/thumbs/ 路径，避免 403/404
 * @param {string} url 原始 URL
 * @returns {string} 规范化后的 URL
 */
function normalizeImageUrl(url) {
  if (!url) return url;
  try {
    let u = url.split("?")[0];
    return toAbsoluteUrl(u);
  } catch {
    return url;
  }
}

/**
 * 判断 URL 是否为图片链接
 * @param {string} url
 * @returns {boolean}
 */
function isImageUrl(url) {
  return /\.(jpg|jpeg|png|webp|gif)(?:$|\?)/i.test(url || "");
}

/**
 * 解析 srcset 字符串，提取候选 URL 列表
 * @param {string} srcset
 * @returns {string[]}
 */
function parseSrcset(srcset) {
  if (!srcset) return [];
  return srcset
    .split(",")
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/**
 * 提取 URL 后缀扩展名（不含查询串）
 * @param {string} url
 * @returns {string}
 */
function getUrlExt(url) {
  const clean = (url || "").split("?")[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m ? m[1] : "";
}

/**
 * 将相对链接转换为绝对链接
 * @param {string} href
 * @returns {string}
 */
function toAbsoluteUrl(href) {
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
}

/**
 * 附件列表去重（按 URL）
 * @param {{url:string,text:string}[]} arr
 * @returns {{url:string,text:string}[]}
 */
function dedupeAttachmentResults(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = item.url;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/**
 * 构建图片文件名：MOC-<id>_<title>_<index>.<ext>
 * @param {string} mocId
 * @param {string} mocTitle
 * @param {number} index 从 1 开始
 * @param {string} url 图片 URL
 * @returns {string}
 */
function buildImageFilename(mocId, mocTitle, index, url) {
  const ext = getUrlExt(url) || "jpg";
  const idx = String(index).padStart(2, "0");
  const safeTitle = sanitizeName(mocTitle).replace(/\s+/g, "-");
  return `MOC-${mocId}_${safeTitle}_${idx}.${ext}`;
}

/**
 * 构建附件文件名：MOC-<id>_<title>_<hint>.<ext>
 * @param {string} mocId
 * @param {string} mocTitle
 * @param {string} linkText 来自 a 标签的文本，可能为空
 * @param {string} url 附件 URL
 * @returns {string}
 */
function buildAttachmentFilename(mocId, mocTitle, linkText, url) {
  const ext = getUrlExt(url) || "bin";
  const hint =
    sanitizeName(linkText || "").replace(/\s+/g, "-") || "attachment";
  const safeTitle = sanitizeName(mocTitle).replace(/\s+/g, "-");
  return `MOC-${mocId}_${safeTitle}_${hint}.${ext}`;
}

/**
 * 汇总待下载资源
 * @returns {{images:{url:string,filename:string}[], attachments:{url:string,filename:string}[]}}
 */
function prepareDownloadItems() {
  const mocId = getMocIdFromLocation();
  const mocTitle = getMocTitleFromDocument();
  const imageUrls = collectImageUrls();
  const attachments = collectAttachmentUrls();

  const imageItems = imageUrls.map((url, i) => ({
    url,
    filename: buildImageFilename(mocId, mocTitle, i + 1, url),
  }));

  const attachItems = attachments.map(({ url, text }) => ({
    url,
    filename: buildAttachmentFilename(mocId, mocTitle, text, url),
  }));

  const result = { images: imageItems, attachments: attachItems };
  // 暴露到页面方便调试
  try {
    window.__mocDownloaderData = result;
  } catch {}

  console.log("[MOC Downloader] 汇总资源:", result);
  return result;
}

/**
 * 发送下载请求到后台
 * @param {'images'|'attachments'|'all'} type 下载类型
 */
function requestDownload(type) {
  const items = prepareDownloadItems();
  let payload = [];
  if (type === "images") payload = items.images;
  else if (type === "attachments") payload = items.attachments;
  else payload = items.images.concat(items.attachments);

  if (payload.length === 0) {
    console.warn("[MOC Downloader] 未找到可下载资源");
    return;
  }
  chrome.runtime.sendMessage(
    { kind: "downloadItems", items: payload },
    (resp) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[MOC Downloader] 下载请求失败:",
          chrome.runtime.lastError
        );
        return;
      }
      console.log("[MOC Downloader] 后台响应:", resp);
    }
  );
}

// 接收弹窗指令
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  try {
    if (msg?.kind === "downloadImages") {
      requestDownload("images");
    } else if (msg?.kind === "downloadAttachments") {
      requestDownload("attachments");
    } else if (msg?.kind === "downloadAll") {
      requestDownload("all");
    }
  } catch (e) {
    console.error("[MOC Downloader] 处理消息失败:", e);
  }
});

/**
 * 注入内联样式用于页面工具栏
 * @returns {void}
 */
function injectToolbarStyle() {
  try {
    if (document.getElementById("moc-downloader-style")) return;
    const style = document.createElement("style");
    style.id = "moc-downloader-style";
    style.textContent = `
      .moc-downloader-toolbar {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        background: rgba(0,0,0,0.65);
        backdrop-filter: saturate(120%) blur(2px);
        color: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        padding: 10px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Microsoft YaHei", sans-serif;
      }
      .moc-downloader-toolbar h2 {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 600;
      }
      .moc-downloader-toolbar button {
        display: block;
        width: 180px;
        margin: 6px 0;
        padding: 8px 10px;
        font-size: 13px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        color: #111;
        background: #ffd54f;
      }
      .moc-downloader-toolbar button:hover {
        background: #ffca28;
      }
      .moc-downloader-toolbar .row {
        display: flex;
        gap: 8px;
      }
      .moc-downloader-toolbar .row button {
        width: auto;
        flex: 1;
      }
      @media (max-width: 480px) {
        .moc-downloader-toolbar {
          right: 8px;
          bottom: 8px;
        }
        .moc-downloader-toolbar button {
          width: 160px;
        }
      }
    `;
    document.head.appendChild(style);
  } catch (e) {}
}

/**
 * 在页面右下角注入下载工具栏
 * - 包含三个按钮：下载图片、下载附件、全部下载
 * - 点击后直接调用现有的 requestDownload
 * @returns {void}
 */
function ensureInlineToolbar() {
  try {
    if (document.getElementById("moc-downloader-toolbar")) return;
    injectToolbarStyle();
    const bar = document.createElement("div");
    bar.className = "moc-downloader-toolbar";
    bar.id = "moc-downloader-toolbar";
    const title = document.createElement("h2");
    title.textContent = "MOC 下载器";
    const btnImages = document.createElement("button");
    btnImages.type = "button";
    btnImages.textContent = "下载当前页图片";
    const btnFiles = document.createElement("button");
    btnFiles.type = "button";
    btnFiles.textContent = "下载当前页附件";
    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.textContent = "全部下载";
    btnImages.addEventListener("click", () => requestDownload("images"));
    btnFiles.addEventListener("click", () => requestDownload("attachments"));
    btnAll.addEventListener("click", () => requestDownload("all"));
    bar.appendChild(title);
    bar.appendChild(btnImages);
    bar.appendChild(btnFiles);
    bar.appendChild(btnAll);
    document.body.appendChild(bar);
  } catch (e) {}
}

/**
 * 初始化页面下载按钮工具栏
 * @returns {void}
 */
function initInlineToolbar() {
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", ensureInlineToolbar, {
        once: true,
      });
    } else {
      ensureInlineToolbar();
    }
  } catch (e) {}
}

initInlineToolbar();
