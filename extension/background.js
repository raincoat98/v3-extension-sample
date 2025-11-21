// Background Service Worker

const OFFSCREEN_DOCUMENT_PATH = "/offscreen.html";
// SIGNIN_POPUP_URL은 build-config.js에서 환경 변수로 주입됩니다
// 빌드 후에는 실제 URL로 대체됩니다
const SIGNIN_POPUP_URL = "https://YOUR_PROJECT_ID.web.app/signin-popup"; // Firebase Hosting URL

// 응답 핸들러 저장 (Service Worker에서는 window 객체가 없으므로 전역 변수 사용)
let authResponseHandler = null;

// Offscreen Document 생성
async function setupOffscreen() {
  try {
    // 이미 존재하는지 확인
    const hasDocument = await chrome.offscreen.hasDocument();
    if (hasDocument) {
      return;
    }

    // Offscreen Document 생성
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["DOM_SCRAPING"],
      justification: "Firebase Authentication을 위한 iframe 로드",
    });

    // 문서가 로드될 때까지 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error("Offscreen document 생성 실패:", error);
    throw error;
  }
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === "LOGIN_GOOGLE") {
    handleGoogleLogin(sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  }

  if (message.type === "AUTH_RESULT") {
    // Offscreen Document로부터 인증 결과 수신
    handleAuthResult(message.user, message.idToken, sendResponse);
    return true;
  }
});

// Google 로그인 처리
async function handleGoogleLogin(sendResponse) {
  try {
    // 응답 핸들러 저장
    authResponseHandler = sendResponse;

    // Offscreen Document 설정
    await setupOffscreen();

    // Offscreen Document에 메시지 전송 (약간의 지연 후)
    setTimeout(() => {
      chrome.runtime
        .sendMessage({
          type: "INIT_AUTH",
          signinPopupUrl: SIGNIN_POPUP_URL,
        })
        .catch((error) => {
          console.error("Offscreen document에 메시지 전송 실패:", error);
          if (authResponseHandler) {
            authResponseHandler({ success: false, error: error.message });
            authResponseHandler = null;
          }
        });
    }, 200);
  } catch (error) {
    console.error("Google 로그인 처리 실패:", error);
    if (authResponseHandler) {
      authResponseHandler({ success: false, error: error.message });
      authResponseHandler = null;
    }
  }
}

// 인증 결과 처리
async function handleAuthResult(user, idToken, sendResponse) {
  try {
    // 사용자 정보 저장
    await chrome.storage.local.set({
      user: user,
      idToken: idToken,
      isAuthenticated: true,
    });

    // Popup에 응답 전송
    if (authResponseHandler) {
      authResponseHandler({
        success: true,
        user: user,
        idToken: idToken,
      });
      authResponseHandler = null;
    }

    // 모든 탭에 로그인 완료 알림
    chrome.runtime
      .sendMessage({
        type: "AUTH_SUCCESS",
        user: user,
      })
      .catch(() => {
        // Popup이 닫혀있을 수 있으므로 에러 무시
      });
  } catch (error) {
    console.error("인증 결과 저장 실패:", error);
    if (authResponseHandler) {
      authResponseHandler({
        success: false,
        error: error.message,
      });
      authResponseHandler = null;
    }
  }
}

// Extension 설치 시 초기화
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});
