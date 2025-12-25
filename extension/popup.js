'use strict';

/**
 * 查询当前激活的标签页
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

/**
 * 发送下载指令到当前页内容脚本
 * @param {'downloadImages'|'downloadAttachments'|'downloadAll'} kind
 * @returns {Promise<void>}
 */
async function sendDownload(kind) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    console.error('[MOC Downloader] 未找到激活标签页');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { kind });
    console.log('[MOC Downloader] 指令已发送:', kind);
  } catch (e) {
    console.error('[MOC Downloader] 发送指令失败:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnImages = document.getElementById('btn-images');
  const btnFiles = document.getElementById('btn-files');
  const btnAll = document.getElementById('btn-all');
  btnImages?.addEventListener('click', () => sendDownload('downloadImages'));
  btnFiles?.addEventListener('click', () => sendDownload('downloadAttachments'));
  btnAll?.addEventListener('click', () => sendDownload('downloadAll'));
});

