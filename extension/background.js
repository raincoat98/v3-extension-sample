// Background Service Worker

// SIGNIN_POPUP_URL과 WEB_APP_URL은 build-config.js에서 환경 변수로 주입됩니다
// 빌드 후에는 실제 URL로 대체됩니다
const SIGNIN_POPUP_URL = "SIGNIN_POPUP_URL_PLACEHOLDER"; // build-config.js에서 주입됨
const WEB_APP_URL = "WEB_APP_URL_PLACEHOLDER"; // build-config.js에서 주입됨

// 응답 핸들러 저장 (Service Worker에서는 window 객체가 없으므로 전역 변수 사용)
let authResponseHandler = null;

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === "LOGIN_GOOGLE") {
    handleGoogleLogin(sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  }

  if (message === "GET_DATA_COUNT") {
    console.log("📊 데이터 개수 요청 수신");
    handleGetDataCount(sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  }

  // Content script로부터 인증 결과 수신 (이벤트 기반)
  if (message && message.type === "AUTH_RESULT_FROM_WEB") {
    console.log("📥 Content script로부터 인증 결과 수신:", message);
    handleAuthResultFromWeb(message.user, message.idToken, sender.tab?.id);
    return true;
  }

  return false;
});

// 데이터 개수 가져오기 처리
async function handleGetDataCount(sendResponse) {
  try {
    console.log("🔍 웹 앱 탭 찾는 중...");
    // 웹 앱 탭 찾기
    const tabs = await chrome.tabs.query({
      url: WEB_APP_URL + "/*",
    });

    console.log("📍 찾은 탭 개수:", tabs.length);

    if (tabs.length === 0) {
      console.log("📂 웹 앱 탭이 없음, 새로 열기");
      // 웹 앱 탭이 없으면 새로 열기
      const tab = await chrome.tabs.create({
        url: WEB_APP_URL,
        active: false,
      });

      console.log("✅ 새 탭 생성됨:", tab.id);

      // 탭이 로드될 때까지 대기
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            console.log("✅ 탭 로드 완료");
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      // 웹 앱에 데이터 개수 요청
      requestDataCountFromWebApp(tab.id, sendResponse);
    } else {
      console.log("✅ 기존 탭 사용:", tabs[0].id);
      // 기존 탭 사용
      requestDataCountFromWebApp(tabs[0].id, sendResponse);
    }
  } catch (error) {
    console.error("❌ handleGetDataCount 오류:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// 웹 앱에 데이터 개수 요청
async function requestDataCountFromWebApp(tabId, sendResponse) {
  try {
    console.log("📤 웹 앱에 데이터 개수 요청 전송 중...");
    // 웹 앱 페이지에 스크립트 주입하여 데이터 개수 요청
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        return new Promise((resolve) => {
          console.log("🔍 React 앱 로드 확인 중...");
          // React 앱이 로드될 때까지 대기
          const checkReactLoaded = setInterval(() => {
            // React 앱이 로드되었는지 확인 (React DevTools 또는 특정 요소 확인)
            const hasReactApp = document.querySelector(".App") !== null;

            if (hasReactApp || document.readyState === "complete") {
              clearInterval(checkReactLoaded);
              console.log("✅ React 앱 로드 완료, 메시지 전송");

              // 약간의 지연 후 메시지 전송 (React가 완전히 로드되도록)
              setTimeout(() => {
                // 웹 앱에 메시지 전송
                console.log("📤 웹 앱에 메시지 전송:", {
                  type: "GET_DATA_COUNT_FROM_EXTENSION",
                });
                window.postMessage(
                  { type: "GET_DATA_COUNT_FROM_EXTENSION" },
                  window.location.origin
                );

                // 웹 앱으로부터 응답 수신
                const messageListener = (event) => {
                  console.log("📥 메시지 수신:", event.data);
                  if (
                    event.data &&
                    event.data.type === "DATA_COUNT_RESPONSE" &&
                    event.origin === window.location.origin
                  ) {
                    console.log("✅ 응답 수신 완료:", event.data);
                    window.removeEventListener("message", messageListener);
                    resolve(event.data);
                  }
                };

                window.addEventListener("message", messageListener);

                // 타임아웃 (5초)
                setTimeout(() => {
                  window.removeEventListener("message", messageListener);
                  console.warn("⏰ 타임아웃");
                  resolve({
                    success: false,
                    error: "타임아웃: 웹 앱으로부터 응답을 받지 못했습니다.",
                  });
                }, 5000);
              }, 500);
            }
          }, 100);

          // 최대 10초 대기
          setTimeout(() => {
            clearInterval(checkReactLoaded);
            console.warn("⏰ React 앱 로드 타임아웃");
            resolve({
              success: false,
              error: "웹 앱이 로드되지 않았습니다.",
            });
          }, 10000);
        });
      },
    });

    console.log("📥 스크립트 실행 결과:", results);
    if (results && results[0] && results[0].result) {
      console.log("✅ 최종 응답:", results[0].result);
      sendResponse(results[0].result);
    } else {
      console.error("❌ 응답 없음");
      sendResponse({
        success: false,
        error: "웹 앱으로부터 응답을 받지 못했습니다.",
      });
    }
  } catch (error) {
    console.error("❌ requestDataCountFromWebApp 오류:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// Google 로그인 처리
async function handleGoogleLogin(sendResponse) {
  try {
    // 응답 핸들러 저장
    authResponseHandler = sendResponse;

    // 새 탭으로 signin-popup 페이지 열기 (extension 파라미터 추가)
    const signinUrl =
      SIGNIN_POPUP_URL +
      (SIGNIN_POPUP_URL.includes("?") ? "&" : "?") +
      "extension=true";
    const tab = await chrome.tabs.create({
      url: signinUrl,
      active: true,
    });

    // Content script가 자동으로 로드되므로 별도 주입 불필요
    // Content script가 window.postMessage를 감지하여 chrome.runtime.sendMessage로 전달

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

    // 탭이 닫히면 에러 처리
    chrome.tabs.onRemoved.addListener(function tabRemovedListener(tabId) {
      if (tabId === tab.id) {
        chrome.tabs.onRemoved.removeListener(tabRemovedListener);
        // 탭이 닫혔지만 메시지를 받지 못한 경우
    setTimeout(() => {
          if (authResponseHandler) {
            // 탭이 닫혔다는 것은 사용자가 취소했을 수도 있으므로 에러로 처리하지 않음
            authResponseHandler = null;
          }
        }, 1000);
          }
        });
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

// Extension 설치 시 초기화
chrome.runtime.onInstalled.addListener(() => {
  // 초기화 완료
});
