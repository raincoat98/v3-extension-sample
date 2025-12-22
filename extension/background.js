// Background Service Worker

// Offscreen Document 생성 (이미 존재하면 무시)
async function ensureOffscreenDocument() {
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["LOCAL_STORAGE"],
      justification: "Firebase Firestore 데이터 조회를 위해 필요합니다",
    });
    console.log("✅ Offscreen document 생성됨");
  } catch (error) {
    // 이미 존재하는 경우 무시
    if (error.message?.includes("offscreen document")) {
      console.log("✅ Offscreen document이 이미 존재합니다");
    } else {
      console.error("❌ Offscreen document 생성 중 오류:", error);
      throw error;
    }
  }
}

// SIGNIN_POPUP_URL은 build-config.js에서 환경 변수로 주입됩니다
const SIGNIN_POPUP_URL = "SIGNIN_POPUP_URL_PLACEHOLDER"; // build-config.js에서 주입됨

// 응답 핸들러 저장 (Service Worker에서는 window 객체가 없으므로 전역 변수 사용)
let authResponseHandler = null;

// 인증 정보 (메모리에만 저장 - 더 안전함)
let currentUser = null;
let currentIdToken = null;

// Sender 검증 함수
function isValidSender(sender) {
  // 자신의 확장에서만 메시지 수신
  return sender.id === chrome.runtime.id;
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 신뢰할 수 있는 sender인지 확인 (자신의 extension만 허용)
  if (!isValidSender(sender)) {
    console.warn("⚠️ 신뢰할 수 없는 sender로부터 메시지 수신:", sender);
    return false;
  }

  if (message === "LOGIN_GOOGLE") {
    handleGoogleLogin(sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  }

  if (message === "GET_DATA_COUNT") {
    console.log("📊 데이터 개수 요청 수신");
    handleGetDataCount(sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  }

  // 현재 사용자 정보 요청
  if (message && message.type === "GET_CURRENT_USER") {
    sendResponse({
      user: currentUser,
    });
    return true;
  }

  // 로그아웃 요청
  if (message && message.type === "LOGOUT") {
    currentUser = null;
    currentIdToken = null;
    sendResponse({ success: true });
    return true;
  }

  // Content script로부터 인증 결과 수신 (이벤트 기반)
  if (message && message.type === "AUTH_RESULT_FROM_WEB") {
    console.log("📥 인증 결과 수신:", message);
    // sender.tab.id를 사용하여 탭 ID 가져오기
    const tabId = sender.tab ? sender.tab.id : null;
    handleAuthResultFromWeb(message.user, message.idToken, tabId);
    return true;
  }

  return false;
});

// 데이터 개수 가져오기 처리 (Offscreen Document으로 위임)
async function handleGetDataCount(sendResponse) {
  try {
    console.log("📊 Offscreen Document으로 데이터 개수 요청 위임");

    // 메모리에 저장된 사용자 정보 확인
    if (!currentUser || !currentIdToken) {
      sendResponse({
        success: false,
        error: "확장 프로그램에서 먼저 로그인해주세요.",
      });
      return;
    }

    // Offscreen document 확인/생성
    await ensureOffscreenDocument();

    // Offscreen document가 준비되도록 잠깐 대기
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Offscreen document에 메시지 전송 (사용자 정보 및 idToken 포함)
    const response = await chrome.runtime.sendMessage({
      type: "GET_DATA_COUNT",
      user: currentUser,
      idToken: currentIdToken,
    });

    sendResponse(response);
  } catch (error) {
    console.error("❌ handleGetDataCount 오류:", error);
    sendResponse({
      success: false,
      error: error.message || "데이터 개수를 가져오는 중 오류가 발생했습니다.",
    });
  }
}

// Google 로그인 처리 (새 탭 사용)
async function handleGoogleLogin(sendResponse) {
  try {
    // 응답 핸들러 저장
    authResponseHandler = sendResponse;

    // 새 탭으로 로그인 페이지 열기
    try {
      const tab = await chrome.tabs.create({
        url: SIGNIN_POPUP_URL,
        active: true, // 사용자가 볼 수 있도록 활성화
      });
      console.log("✅ 로그인 페이지 탭 생성:", tab.id);

      // 최대 2분 후 타임아웃 (무한 대기 방지)
      setTimeout(() => {
        if (authResponseHandler) {
          authResponseHandler({
            success: false,
            error: "인증 결과를 받지 못했습니다. 시간이 초과되었습니다.",
          });
          authResponseHandler = null;
        }
      }, 120000); // 2분
    } catch (error) {
      console.error("❌ 로그인 페이지 열기 오류:", error);
      if (authResponseHandler) {
        authResponseHandler({ success: false, error: error.message });
        authResponseHandler = null;
      }
    }
  } catch (error) {
    console.error("Google 로그인 처리 실패:", error);
    if (authResponseHandler) {
      authResponseHandler({ success: false, error: error.message });
      authResponseHandler = null;
    }
  }
}

// 웹 앱으로부터 인증 결과 처리 (이벤트 기반)
async function handleAuthResultFromWeb(user, idToken, tabId) {
  try {
    console.log("✅ 웹 앱으로부터 인증 결과 처리 시작");

    // 메모리에만 저장 (보안: storage가 아님)
    currentUser = user;
    currentIdToken = idToken;

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
        // 팝업이 닫혀있을 수 있으므로 에러 무시
      });

    // 로그인 성공 후 signin-popup 탭 닫기
    if (tabId) {
      setTimeout(() => {
        chrome.tabs.remove(tabId).catch(() => {
          // 탭이 이미 닫혔을 수 있음
        });
      }, 500);
    } else {
      // tabId가 없으면 URL로 찾기
      chrome.tabs.query({ url: SIGNIN_POPUP_URL + "*" }, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.remove(tab.id);
          }
        });
      });
    }

    // localStorage 정리 (웹 앱에서 이미 정리했을 수 있지만 안전을 위해)
    if (tabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            localStorage.removeItem("extension_auth_result");
            sessionStorage.removeItem("extension_auth_result");
          },
        });
      } catch (error) {
        // 탭이 이미 닫혔을 수 있음
        console.log("localStorage 정리 실패 (탭이 이미 닫힘):", error);
      }
    }
  } catch (err) {
    console.error("인증 결과 저장 실패:", err);
    if (authResponseHandler) {
      authResponseHandler({
        success: false,
        error: err.message,
      });
      authResponseHandler = null;
    }
  }
}

// 인증 결과 처리
async function handleAuthResult(user, idToken, error, sendResponse) {
  try {
    // 에러가 있는 경우
    if (error) {
      console.error("❌ 인증 오류:", error);
      if (authResponseHandler) {
        authResponseHandler({
          success: false,
          error: error,
        });
        authResponseHandler = null;
      }
      if (sendResponse) {
        sendResponse({ success: false, error: error });
      }
      return;
    }

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

    // sendResponse가 있으면 응답 전송
    if (sendResponse) {
      sendResponse({ success: true });
    }

    // 모든 탭에 로그인 완료 알림
    chrome.runtime
      .sendMessage({
        type: "AUTH_SUCCESS",
        user: user,
      })
      .catch(() => {
        // 팝업이 닫혀있을 수 있으므로 에러 무시
      });

    // 로그인 성공 후 signin-popup 탭 닫기
    if (sendResponse) {
      // sender.tab이 있으면 해당 탭 닫기
      chrome.tabs.query({ url: SIGNIN_POPUP_URL + "*" }, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.remove(tab.id);
          }
        });
      });
    }
  } catch (err) {
    console.error("인증 결과 저장 실패:", err);
    if (authResponseHandler) {
      authResponseHandler({
        success: false,
        error: err.message,
      });
      authResponseHandler = null;
    }
    if (sendResponse) {
      sendResponse({ success: false, error: err.message });
    }
  }
}

// Extension 설치 시 초기화 (Firebase는 필요할 때 초기화)
chrome.runtime.onInstalled.addListener(() => {
  console.log("✅ Extension 설치/업데이트 완료");
  // Firebase는 필요할 때 초기화하도록 변경 (onInstalled에서는 초기화하지 않음)
});
