// Offscreen Document Script

const signinFrame = document.getElementById("signinFrame");
let signinPopupUrl = "";

// Background Service Worker로부터 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "INIT_AUTH") {
    signinPopupUrl = message.signinPopupUrl;
    initializeAuth();
    sendResponse({ success: true });
  }
  return true;
});

// 인증 초기화
function initializeAuth() {
  if (!signinPopupUrl) {
    console.error("Signin popup URL이 설정되지 않았습니다.");
    return;
  }

  // iframe에 signin-popup 페이지 로드
  signinFrame.src = signinPopupUrl;

  // iframe 로드 완료 후 메시지 전송
  signinFrame.onload = () => {
    // iframe 내부 페이지에 초기화 메시지 전송
    signinFrame.contentWindow.postMessage({ initAuth: true }, signinPopupUrl);
  };
}

// iframe으로부터 메시지 수신 (인증 결과)
window.addEventListener("message", async (event) => {
  // 보안: origin 확인
  if (signinPopupUrl) {
    try {
      const expectedOrigin = new URL(signinPopupUrl).origin;
      if (event.origin !== expectedOrigin) {
        console.warn("알 수 없는 origin에서 메시지 수신:", event.origin, "예상:", expectedOrigin);
        return;
      }
    } catch (error) {
      console.error("Origin 확인 오류:", error);
    }
  }

  const { user, idToken, error } = event.data;

  if (error) {
    console.error("인증 오류:", error);
    // Background에 오류 전송
    try {
      chrome.runtime.sendMessage({
        type: "AUTH_RESULT",
        error: error,
      });
    } catch (err) {
      console.error("Background에 메시지 전송 실패:", err);
    }
    return;
  }

  if (user && idToken) {
    // Background Service Worker에 인증 결과 전송
    try {
      chrome.runtime.sendMessage({
        type: "AUTH_RESULT",
        user: user,
        idToken: idToken,
      });
    } catch (error) {
      console.error("Background에 메시지 전송 실패:", error);
    }
  }
});
