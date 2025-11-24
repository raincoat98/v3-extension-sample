// Popup Script

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const statusDiv = document.getElementById("status");
const userInfoDiv = document.getElementById("userInfo");
const userDetailsDiv = document.getElementById("userDetails");
const loadingDiv = document.getElementById("loading");
const dataInfoDiv = document.getElementById("dataInfo");
const dataCountDiv = document.getElementById("dataCount");

// 초기 상태 로드
loadAuthState();

// 로그인 버튼 클릭
loginBtn.addEventListener("click", async () => {
  try {
    loginBtn.disabled = true;
    loadingDiv.style.display = "block";
    updateStatus("로그인 페이지를 여는 중...", false);

    // Background Service Worker에 로그인 요청 (Promise 기반)
    try {
      // 탭이 열리는 것을 기다리지 않고 즉시 응답 대기 모드로 전환
    chrome.runtime.sendMessage("LOGIN_GOOGLE", (response) => {
        // 이 콜백은 탭이 열린 직후 호출될 수 있으므로, 실제 인증 결과는 AUTH_SUCCESS 메시지로 받음
        if (chrome.runtime.lastError) {
          console.error("메시지 전송 오류:", chrome.runtime.lastError);
          updateStatus(
            "로그인 실패: " + chrome.runtime.lastError.message,
            false
          );
          loadingDiv.style.display = "none";
          loginBtn.disabled = false;
        } else {
          // 탭이 열렸음을 알림
          updateStatus(
            "로그인 페이지가 열렸습니다. 새 탭에서 로그인을 진행하세요.",
            false
          );
          // 팝업은 열어둠 (사용자가 로그인 완료를 기다림)
        }
      });
    } catch (error) {
      console.error("메시지 전송 오류:", error);
      updateStatus(
        "로그인 실패: " + (error.message || "알 수 없는 오류"),
        false
      );
      loadingDiv.style.display = "none";
      loginBtn.disabled = false;
    }
  } catch (error) {
    console.error("로그인 오류:", error);
    updateStatus("로그인 오류: " + error.message, false);
    loadingDiv.style.display = "none";
    loginBtn.disabled = false;
  }
});

// 로그아웃 버튼 클릭
logoutBtn.addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove(["user", "idToken", "isAuthenticated"]);
    updateStatus("로그인되지 않음", false);
    userInfoDiv.style.display = "none";
    if (dataInfoDiv) {
      dataInfoDiv.style.display = "none";
    }
    loginBtn.style.display = "block";
    logoutBtn.style.display = "none";
  } catch (error) {
    console.error("로그아웃 오류:", error);
  }
});

// 인증 상태 로드
async function loadAuthState() {
  try {
    const result = await chrome.storage.local.get(["user", "isAuthenticated"]);
    if (result.isAuthenticated && result.user) {
      updateStatus("로그인됨", true);
      displayUserInfo(result.user);
      loginBtn.style.display = "none";
      logoutBtn.style.display = "block";
      // 로그인된 경우 데이터 개수 로드
      loadDataCount();
    } else {
      updateStatus("로그인되지 않음", false);
      if (dataInfoDiv) {
        dataInfoDiv.style.display = "none";
      }
    }
  } catch (error) {
    console.error("상태 로드 오류:", error);
  }
}

// 상태 업데이트
function updateStatus(message, isLoggedIn) {
  statusDiv.textContent = message;
  statusDiv.className = "status " + (isLoggedIn ? "logged-in" : "logged-out");
}

// 사용자 정보 표시
function displayUserInfo(user) {
  userInfoDiv.style.display = "block";
  userDetailsDiv.innerHTML = `
    <div>이메일: ${user.email || "N/A"}</div>
    <div>이름: ${user.displayName || "N/A"}</div>
    <div>UID: ${user.uid || "N/A"}</div>
  `;
}

// 데이터 개수 로드
async function loadDataCount() {
  console.log("📊 데이터 개수 로드 시작");
  if (dataInfoDiv) {
    dataInfoDiv.style.display = "block";
  }
  if (dataCountDiv) {
    dataCountDiv.textContent = "로딩 중...";
  }

  try {
    chrome.runtime.sendMessage("GET_DATA_COUNT", (response) => {
      console.log("📥 Background로부터 응답 수신:", response);
      if (chrome.runtime.lastError) {
        console.error("데이터 개수 가져오기 실패:", chrome.runtime.lastError);
        if (dataCountDiv) {
          dataCountDiv.textContent = "데이터를 가져올 수 없습니다";
        }
        if (dataInfoDiv) {
          dataInfoDiv.style.display = "block";
        }
        return;
      }

      if (response && response.success) {
        console.log("✅ 데이터 개수:", response.count);
        if (dataCountDiv) {
          dataCountDiv.textContent = `총 ${response.count}개 항목`;
        }
        if (dataInfoDiv) {
          dataInfoDiv.style.display = "block";
        }
      } else {
        console.error("❌ 데이터 개수 가져오기 실패:", response?.error);
        if (dataCountDiv) {
          dataCountDiv.textContent =
            response?.error || "데이터를 가져올 수 없습니다";
        }
        if (dataInfoDiv) {
          dataInfoDiv.style.display = "block";
        }
      }
    });
  } catch (error) {
    console.error("데이터 개수 로드 오류:", error);
    if (dataCountDiv) {
      dataCountDiv.textContent = "데이터를 가져올 수 없습니다";
    }
    if (dataInfoDiv) {
      dataInfoDiv.style.display = "block";
    }
  }
}

// Background에서 인증 성공 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "AUTH_SUCCESS") {
    updateStatus("로그인 성공!", true);
    displayUserInfo(message.user);
    loginBtn.style.display = "none";
    logoutBtn.style.display = "block";
    // 로그인 성공 후 데이터 개수 로드
    loadDataCount();
  }
});
