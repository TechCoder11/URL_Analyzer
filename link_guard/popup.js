// popup.js — interacts with background.js
document.getElementById("checkBtn").addEventListener("click", () => {
  const url = document.getElementById("urlInput").value.trim();
  const resultDiv = document.getElementById("result");

  if (!url) {
    resultDiv.textContent = "Please enter a valid URL.";
    resultDiv.className = "result";
    return;
  }

  // Send message to background.js
  chrome.runtime.sendMessage({ type: "assessLink", url }, response => {
    if (chrome.runtime.lastError) {
      resultDiv.textContent = "Error connecting to background.";
      resultDiv.className = "result phishing";
      return;
    }

    if (!response) {
      resultDiv.textContent = "No response received.";
      resultDiv.className = "result phishing";
      return;
    }

    if (response.isPhishing) {
      resultDiv.textContent = `⚠️ Suspicious link detected!\n(${response.url})`;
      resultDiv.className = "result phishing";
    } else {
      resultDiv.textContent = `✅ Safe link: ${response.url}`;
      resultDiv.className = "result safe";
    }
  });
});


  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.style.backgroundColor = isDark ? '#181818' : '#f9fafb';
  document.body.style.color = isDark ? '#f9fafb' : '#1e293b';
