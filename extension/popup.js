document.getElementById("open").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("share.html") });
  window.close();
});
