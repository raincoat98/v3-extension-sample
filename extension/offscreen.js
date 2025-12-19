// Offscreen Document Script
// 이 문서는 백그라운드에서 실행되며 탭 없이 동작합니다

const WEB_APP_URL = "WEB_APP_URL_PLACEHOLDER"; // build-config.js에서 주입됨
const SIGNIN_POPUP_URL = "SIGNIN_POPUP_URL_PLACEHOLDER"; // build-config.js에서 주입됨

let iframe = null;
let messageHandlers = new Map();

// Background Service Worker로부터 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📥 Offscreen 문서로 메시지 수신:", message);

  if (message.type === "GET_DATA_COUNT") {
    handleGetDataCount().then((response) => {
      // Background로 응답 전달
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_DATA_COUNT_RESPONSE",
        response: response,
      });
      sendResponse({ success: true }); // 메시지 수신 확인
    }).catch((error) => {
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_DATA_COUNT_RESPONSE",
        response: { success: false, error: error.message },
      });
      sendResponse({ success: false });
    });
    return true; // 비동기 응답
  }

  if (message.type === "LOGIN_GOOGLE") {
    handleGoogleLogin().then((response) => {
      sendResponse(response);
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // 비동기 응답
  }

  return false;
});

// iframe 로드
function loadIframe(url) {
  return new Promise((resolve, reject) => {
    if (iframe && iframe.src.includes(url)) {
      console.log("✅ 기존 iframe 사용");
      resolve(iframe);
      return;
    }

    // 기존 iframe 제거
    if (iframe) {
      iframe.remove();
    }

    // 새 iframe 생성
    iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";

    iframe.onload = () => {
      console.log("✅ iframe 로드 완료:", url);
      resolve(iframe);
    };

    iframe.onerror = () => {
      console.error("❌ iframe 로드 실패");
      reject(new Error("iframe 로드 실패"));
    };

    document.getElementById("iframe-container").appendChild(iframe);
  });
}

// 웹 앱으로부터 메시지 수신
window.addEventListener("message", (event) => {
  // 보안: origin 확인
  if (!event.origin.includes(new URL(WEB_APP_URL).origin)) {
    return;
  }

  console.log("📥 웹 앱으로부터 메시지 수신:", event.data);

  if (event.data && event.data.type === "DATA_COUNT_RESPONSE") {
    // 데이터 개수 응답 처리
    const handlerId = "DATA_COUNT";
    const handler = messageHandlers.get(handlerId);
    if (handler) {
      handler(event.data);
      messageHandlers.delete(handlerId);
    }
  }

  if (event.data && event.data.type === "AUTH_RESULT") {
    // 인증 결과 처리
    chrome.runtime.sendMessage({
      type: "AUTH_RESULT_FROM_WEB",
      user: event.data.user,
      idToken: event.data.idToken,
    });
  }
});

// 데이터 개수 가져오기
async function handleGetDataCount() {
  return new Promise((resolve, reject) => {
    try {
      console.log("🔍 웹 앱 iframe 로드 중...");
      
      // iframe 로드
      loadIframe(WEB_APP_URL).then(() => {
        // React 앱이 로드될 때까지 대기
        const checkReactLoaded = setInterval(() => {
          try {
            const iframeWindow = iframe.contentWindow;
            const hasReactApp = iframeWindow?.document?.querySelector(".App") !== null;

            if (hasReactApp || iframeWindow?.document?.readyState === "complete") {
              clearInterval(checkReactLoaded);
              console.log("✅ React 앱 로드 완료");

              // 약간의 지연 후 메시지 전송
              setTimeout(() => {
                // 응답 핸들러 저장
                messageHandlers.set("DATA_COUNT", (response) => {
                  console.log("✅ 데이터 개수 응답 수신:", response);
                  resolve(response);
                });

                // 웹 앱에 데이터 개수 요청
                iframe.contentWindow.postMessage(
                  { type: "GET_DATA_COUNT_FROM_EXTENSION" },
                  new URL(WEB_APP_URL).origin
                );

                // 타임아웃 (5초)
                setTimeout(() => {
                  if (messageHandlers.has("DATA_COUNT")) {
                    messageHandlers.delete("DATA_COUNT");
                    resolve({
                      success: false,
                      error: "타임아웃: 웹 앱으로부터 응답을 받지 못했습니다.",
                    });
                  }
                }, 5000);
              }, 500);
            }
          } catch (error) {
            // Cross-origin 오류는 무시 (iframe이 로드되는 중일 수 있음)
            if (!error.message.includes("Blocked a frame")) {
              console.error("❌ 오류:", error);
            }
          }
        }, 100);

        // 최대 10초 대기
        setTimeout(() => {
          clearInterval(checkReactLoaded);
          if (messageHandlers.has("DATA_COUNT")) {
            messageHandlers.delete("DATA_COUNT");
            resolve({
              success: false,
              error: "웹 앱이 로드되지 않았습니다.",
            });
          }
        }, 10000);
      }).catch((error) => {
        console.error("❌ iframe 로드 오류:", error);
        reject(error);
      });

    } catch (error) {
      console.error("❌ handleGetDataCount 오류:", error);
      reject(error);
    }
  });
}

// Google 로그인 처리
async function handleGoogleLogin() {
  return new Promise((resolve, reject) => {
    try {
      console.log("🔍 로그인 팝업 iframe 로드 중...");
      
      const signinUrl = SIGNIN_POPUP_URL + 
        (SIGNIN_POPUP_URL.includes("?") ? "&" : "?") + 
        "extension=true";

      // iframe 로드 (로그인용)
      loadIframe(signinUrl).then(() => {
        // 로그인 완료 대기 (AUTH_RESULT 메시지로 처리됨)
        console.log("⏳ 로그인 완료 대기 중...");

        // 최대 2분 후 타임아웃
        setTimeout(() => {
          resolve({
            success: false,
            error: "인증 결과를 받지 못했습니다. 시간이 초과되었습니다.",
          });
        }, 120000);
      }).catch((error) => {
        reject(error);
      });

    } catch (error) {
      console.error("❌ handleGoogleLogin 오류:", error);
      reject(error);
    }
  });
}

