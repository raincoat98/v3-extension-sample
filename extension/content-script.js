// Content Script - 웹 앱과 Extension 간 메시지 중계

console.log("📥 Content script 로드됨");

// ===== 헬퍼 함수 =====

// 데이터 개수 요청 처리
function handleGetDataCount(sendResponse) {
  console.log("📥 데이터 개수 요청 수신 (content script)");
  sendResponse({ received: true });

  // 사용자 정보 가져오기
  chrome.storage.local.get(["user"], (result) => {
    if (chrome.runtime.lastError || !result.user) {
      console.warn("사용자 정보 없음");
      return;
    }

    // 웹 앱에 메시지 전송
    window.postMessage(
      {
        type: "GET_DATA_COUNT_FROM_EXTENSION",
        user: result.user,
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

  return false;
}

// 인증 결과 전달
function handleAuthResult(event) {
  console.log("📥 인증 결과 메시지 수신 (content script):", event.data);

  chrome.runtime.sendMessage(
    {
      type: "AUTH_RESULT_FROM_WEB",
      user: event.data.user,
      idToken: event.data.idToken,
      tabId: null, // content script에서는 tabId를 직접 알 수 없음
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

// ===== 이벤트 리스너 =====

// Background로부터 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ready: true });
    return true;
  }

  if (message.type === "GET_DATA_COUNT") {
    return handleGetDataCount(sendResponse);
  }

  return false;
});

// 웹 앱으로부터 postMessage 수신
window.addEventListener("message", (event) => {
  if (
    event.data &&
    event.data.type === "AUTH_RESULT" &&
    event.origin === window.location.origin
  ) {
    handleAuthResult(event);
  }
});
