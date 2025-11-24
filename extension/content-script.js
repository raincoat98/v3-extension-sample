// Content Script for listening to postMessage from web app
// Extension context이므로 chrome.runtime.sendMessage를 사용할 수 있음

console.log("📥 Content script 로드됨");

// window.postMessage를 감지하여 background에 전달
window.addEventListener("message", (event) => {
  // Extension에서 온 메시지만 처리
  if (
    event.data &&
    event.data.type === "AUTH_RESULT" &&
    event.origin === window.location.origin
  ) {
    console.log("📥 인증 결과 메시지 수신 (content script):", event.data);
    
    // background에 전달
    chrome.runtime.sendMessage(
      {
        type: "AUTH_RESULT_FROM_WEB",
        user: event.data.user,
        idToken: event.data.idToken,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("메시지 전송 오류:", chrome.runtime.lastError);
        } else {
          console.log("✅ 인증 결과 전달 완료");
        }
      }
    );
  }
});

