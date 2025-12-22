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

// 인증 정보 (메모리 + storage)
// currentUser: 메모리에 캐시 (빠른 접근)
// Storage에 저장된 사용자 정보는 브라우저 재시작 후에도 유지
let currentUser = null;

// Sender 검증 함수
function isValidSender(sender) {
  // 자신의 확장에서만 메시지 수신
  return sender.id === chrome.runtime.id;
}

// 메시지 리스너 (async 지원)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 비동기 처리를 위해 별도 함수에서 실행
  handleMessage(message, sender, sendResponse);
  return true; // 비동기 응답 처리
});

async function handleMessage(message, sender, sendResponse) {
  try {
    // 신뢰할 수 있는 sender인지 확인 (자신의 extension만 허용)
    if (!isValidSender(sender)) {
      console.warn("⚠️ 신뢰할 수 없는 sender로부터 메시지 수신:", sender);
      return;
    }

    if (message === "LOGIN_GOOGLE") {
      handleGoogleLogin(sendResponse);
      return;
    }

    if (message === "GET_DATA_COUNT") {
      console.log("📊 데이터 개수 요청 수신");
      handleGetDataCount(sendResponse);
      return;
    }

    // 현재 사용자 정보 요청 (storage에서 복원할 수도 있음)
    if (message && message.type === "GET_CURRENT_USER") {
      // 메모리에 없으면 storage에서 로드
      if (!currentUser) {
        await restoreUserInfo();
      }
      sendResponse({
        user: currentUser,
      });
      return;
    }

    // 로그아웃 요청
    if (message && message.type === "LOGOUT") {
      currentUser = null;
      try {
        await chrome.storage.local.remove(["user"]);
      } catch (e) {
        console.warn("storage 삭제 실패:", e);
      }
      sendResponse({ success: true });
      return;
    }

    // Content script로부터 인증 결과 수신 (이벤트 기반)
    if (message && message.type === "AUTH_RESULT_FROM_WEB") {
      console.log("📥 인증 결과 수신:", message);
      // sender.tab.id를 사용하여 탭 ID 가져오기
      const tabId = sender.tab ? sender.tab.id : null;
      await handleAuthResultFromWeb(message.user, message.idToken, tabId);
      sendResponse({ success: true }); // 중요: sendResponse 호출
      return;
    }
  } catch (error) {
    console.error("메시지 처리 오류:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// 데이터 개수 가져오기 처리 (Offscreen Document으로 위임)
async function handleGetDataCount(sendResponse) {
  try {
    console.log("📊 Offscreen Document으로 데이터 개수 요청 위임");

    // 메모리에 저장된 사용자 정보 확인
    if (!currentUser) {
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

    // Offscreen document에 메시지 전송 (사용자 정보만 전달, idToken은 Offscreen에서 Firebase SDK로 가져옴)
    const response = await chrome.runtime.sendMessage({
      type: "GET_DATA_COUNT",
      user: currentUser,
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
// idToken은 더 이상 저장하지 않음 (보안: 메모리에만 유지하고 저장하지 않음)
async function handleAuthResultFromWeb(user, idToken, tabId) {
  try {
    console.log("✅ 웹 앱으로부터 인증 결과 처리 시작");

    // 사용자 정보를 메모리 및 storage에 저장 (브라우저 재시작 후에도 유지)
    currentUser = user;
    try {
      await chrome.storage.local.set({
        user: user,
        lastLoginTime: Date.now(), // 마지막 로그인 시간도 저장
      });
      console.log("✅ 사용자 정보 저장 완료:", user.email || user.uid);
    } catch (e) {
      console.warn("⚠️ 사용자 정보 저장 실패 (메모리에는 유지됨):", e);
    }

    // Popup에 응답 전송
    if (authResponseHandler) {
      authResponseHandler({
        success: true,
        user: user,
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

// 저장된 사용자 정보 복원 함수
async function restoreUserInfo() {
  try {
    const stored = await chrome.storage.local.get(["user"]);
    if (stored?.user) {
      currentUser = stored.user;
      console.log(
        "✅ 저장된 사용자 정보 복원 완료:",
        stored.user.email || stored.user.uid
      );
    } else {
      currentUser = null;
      console.log("📭 저장된 사용자 정보 없음");
    }
  } catch (error) {
    console.error("❌ 사용자 정보 복원 실패:", error);
    // 오류가 발생해도 메모리 상태는 유지
  }
}

// Storage 변경 이벤트 리스너 (다른 곳에서 변경된 경우 동기화)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.user) {
    if (changes.user.newValue) {
      currentUser = changes.user.newValue;
      console.log(
        "✅ Storage 변경 감지 - 사용자 정보 업데이트:",
        currentUser.email
      );
    } else {
      currentUser = null;
      console.log("✅ Storage 변경 감지 - 사용자 정보 삭제됨");
    }
  }
});

// Extension 시작 시 저장된 사용자 정보 복원
chrome.runtime.onStartup?.addListener(async () => {
  console.log("🚀 Extension 시작됨 - 사용자 정보 복원 중...");
  await restoreUserInfo();
});

// Extension 설치 시 초기화
chrome.runtime.onInstalled?.addListener(async (details) => {
  console.log("✅ Extension 설치/업데이트 완료:", details.reason);
  await restoreUserInfo();
});

// Service Worker 시작 시 즉시 복원 (onStartup/onInstalled가 실행되지 않는 경우 대비)
(async () => {
  console.log("🚀 Background Service Worker 시작 - 사용자 정보 복원 중...");
  await restoreUserInfo();
})();
