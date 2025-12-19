// Background Service Worker

// SIGNIN_POPUP_URL과 WEB_APP_URL은 build-config.js에서 환경 변수로 주입됩니다
// 빌드 후에는 실제 URL로 대체됩니다
const SIGNIN_POPUP_URL = "SIGNIN_POPUP_URL_PLACEHOLDER"; // build-config.js에서 주입됨
const WEB_APP_URL = "WEB_APP_URL_PLACEHOLDER"; // build-config.js에서 주입됨

// 응답 핸들러 저장 (Service Worker에서는 window 객체가 없으므로 전역 변수 사용)
let authResponseHandler = null;

// 활성 탭 추적 (데이터 개수 요청용)
let activeDataCountTab = null;

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
    console.log("📥 인증 결과 수신:", message);
    // sender.tab.id를 사용하여 탭 ID 가져오기
    const tabId = sender.tab ? sender.tab.id : null;
    handleAuthResultFromWeb(message.user, message.idToken, tabId);
    return true;
  }

  // Content script로부터 데이터 개수 응답 수신
  if (message && message.type === "DATA_COUNT_RESPONSE") {
    console.log("📥 데이터 개수 응답 수신:", message);
    // 응답은 handleGetDataCount의 리스너에서 처리됨
    return true;
  }

  return false;
});

// 데이터 개수 가져오기 처리 (새 탭 사용)
async function handleGetDataCount(sendResponse) {
  try {
    console.log("🔍 새 탭을 통해 데이터 개수 요청...");

    // 응답 핸들러 저장
    let responseSent = false;

    // Content script로부터 응답을 받을 리스너
    const responseListener = (message, sender, sendResponseToMessage) => {
      if (message && message.type === "DATA_COUNT_RESPONSE") {
        if (!responseSent) {
          responseSent = true;
          chrome.runtime.onMessage.removeListener(responseListener);
          console.log("✅ 데이터 개수 응답 수신:", message.response);

          // 탭 닫기
          if (activeDataCountTab) {
            chrome.tabs.remove(activeDataCountTab).catch(() => {
              // 탭이 이미 닫혔을 수 있음
            });
            activeDataCountTab = null;
          }

          sendResponse(message.response);
        }
        return true;
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(responseListener);

    // 타임아웃 설정 (15초)
    setTimeout(() => {
      if (!responseSent) {
        responseSent = true;
        chrome.runtime.onMessage.removeListener(responseListener);

        // 탭 닫기
        if (activeDataCountTab) {
          chrome.tabs.remove(activeDataCountTab).catch(() => {});
          activeDataCountTab = null;
        }

        sendResponse({
          success: false,
          error: "타임아웃: 웹 앱으로부터 응답을 받지 못했습니다.",
        });
      }
    }, 15000);

    // 새 탭 열기
    try {
      const tab = await chrome.tabs.create({
        url: WEB_APP_URL,
        active: false, // 백그라운드에서 열기
      });
      activeDataCountTab = tab.id;
      console.log("✅ 데이터 개수 조회용 탭 생성:", tab.id);

      // 탭이 로드될 때까지 대기
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);

          // Content script 준비 확인 및 메시지 전송 (재시도 로직 포함)
          let retryCount = 0;
          const maxRetries = 10;
          const retryDelay = 500; // 0.5초

          const checkAndSendMessage = () => {
            // 먼저 content script가 준비되었는지 확인 (PING)
            chrome.tabs.sendMessage(
              tab.id,
              { type: "PING" },
              (pingResponse) => {
                if (chrome.runtime.lastError) {
                  const error =
                    chrome.runtime.lastError.message ||
                    String(chrome.runtime.lastError);

                  // 재시도
                  if (retryCount < maxRetries - 1) {
                    retryCount++;
                    console.log(
                      `⏳ Content script 준비 대기 중... (${retryCount}/${maxRetries})`
                    );
                    setTimeout(checkAndSendMessage, retryDelay);
                  } else {
                    // 최대 재시도 횟수 초과
                    console.error(`❌ Content script 준비 실패: ${error}`);
                    if (!responseSent) {
                      responseSent = true;
                      chrome.runtime.onMessage.removeListener(responseListener);
                      if (activeDataCountTab) {
                        chrome.tabs.remove(activeDataCountTab).catch(() => {});
                        activeDataCountTab = null;
                      }
                      sendResponse({
                        success: false,
                        error: `Content script가 준비되지 않았습니다: ${error}`,
                      });
                    }
                  }
                } else {
                  // Content script가 준비됨 - 실제 메시지 전송
                  console.log(
                    "✅ Content script 준비 확인됨, 데이터 개수 요청 전송"
                  );
                  chrome.tabs.sendMessage(
                    tab.id,
                    { type: "GET_DATA_COUNT" },
                    (response) => {
                      if (chrome.runtime.lastError) {
                        const error =
                          chrome.runtime.lastError.message ||
                          String(chrome.runtime.lastError);
                        console.error("❌ 데이터 개수 요청 전송 실패:", error);
                        if (!responseSent) {
                          responseSent = true;
                          chrome.runtime.onMessage.removeListener(
                            responseListener
                          );
                          if (activeDataCountTab) {
                            chrome.tabs
                              .remove(activeDataCountTab)
                              .catch(() => {});
                            activeDataCountTab = null;
                          }
                          sendResponse({
                            success: false,
                            error: `데이터 개수 요청 실패: ${error}`,
                          });
                        }
                      } else {
                        // 성공적으로 전송됨 (실제 응답은 responseListener를 통해 받음)
                        console.log(
                          "✅ 데이터 개수 요청 전송 성공, 웹 앱 응답 대기 중..."
                        );
                        // 응답은 responseListener에서 처리됨
                      }
                    }
                  );
                }
              }
            );
          };

          // 첫 시도 (페이지 로드 후 약간의 지연)
          setTimeout(checkAndSendMessage, 1000);
        }
      });
    } catch (error) {
      console.error("❌ 탭 생성 오류:", error);
      if (!responseSent) {
        responseSent = true;
        chrome.runtime.onMessage.removeListener(responseListener);
        sendResponse({ success: false, error: error.message });
      }
    }
  } catch (error) {
    console.error("❌ handleGetDataCount 오류:", error);
    sendResponse({ success: false, error: error.message });
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
