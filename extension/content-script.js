// Content Script for listening to postMessage from web app
// Extension context이므로 chrome.runtime.sendMessage를 사용할 수 있음

console.log("📥 Content script 로드됨");

// Background로부터 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Content script 준비 확인용 핑
  if (message.type === "PING") {
    sendResponse({ ready: true });
    return true;
  }

  if (message.type === "GET_DATA_COUNT") {
    console.log("📥 데이터 개수 요청 수신 (content script)");

    // 메시지 채널을 닫기 위해 즉시 응답 (실제 응답은 별도로 전송)
    sendResponse({ received: true });

    // 확장 프로그램의 인증 정보 가져오기
    chrome.storage.local.get(["user", "idToken"], (result) => {
      // 웹 앱에 메시지 전송 (인증 정보 포함)
      window.postMessage(
        { 
          type: "GET_DATA_COUNT_FROM_EXTENSION",
          user: result.user,
          idToken: result.idToken
        },
        window.location.origin
      );
    });

    // 응답 핸들러 설정
    const responseHandler = (event) => {
      if (
        event.data &&
        event.data.type === "DATA_COUNT_RESPONSE" &&
        event.origin === window.location.origin
      ) {
        window.removeEventListener("message", responseHandler);
        console.log("📥 데이터 개수 응답 수신 (content script):", event.data);

        // Background에 전달
        chrome.runtime.sendMessage({
          type: "DATA_COUNT_RESPONSE",
          response: event.data,
        });
      }
    };

    window.addEventListener("message", responseHandler);

    // 타임아웃 (10초)
    setTimeout(() => {
      window.removeEventListener("message", responseHandler);
      chrome.runtime.sendMessage({
        type: "DATA_COUNT_RESPONSE",
        response: {
          success: false,
          error: "타임아웃: 웹 앱으로부터 응답을 받지 못했습니다.",
        },
      });
    }, 10000);

    return false; // 이미 sendResponse를 호출했으므로 false 반환
  }

  return false;
});

// window.postMessage를 감지하여 background에 전달
window.addEventListener("message", (event) => {
  // Extension에서 온 메시지만 처리
  if (
    event.data &&
    event.data.type === "AUTH_RESULT" &&
    event.origin === window.location.origin
  ) {
    console.log("📥 인증 결과 메시지 수신 (content script):", event.data);

    // 현재 탭 ID 가져오기
    chrome.runtime.sendMessage(
      {
        type: "AUTH_RESULT_FROM_WEB",
        user: event.data.user,
        idToken: event.data.idToken,
        tabId: null, // content script에서는 tabId를 직접 알 수 없으므로 null
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
