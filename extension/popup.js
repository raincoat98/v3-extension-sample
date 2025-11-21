// Popup Script

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const statusDiv = document.getElementById("status");
const userInfoDiv = document.getElementById("userInfo");
const userDetailsDiv = document.getElementById("userDetails");
const loadingDiv = document.getElementById("loading");

// 초기 상태 로드
loadAuthState();

// 로그인 버튼 클릭
loginBtn.addEventListener("click", async () => {
  try {
    loginBtn.disabled = true;
    loadingDiv.style.display = "block";

    // Background Service Worker에 로그인 요청
    chrome.runtime.sendMessage("LOGIN_GOOGLE", (response) => {
      loadingDiv.style.display = "none";
      loginBtn.disabled = false;

      if (chrome.runtime.lastError) {
        console.error("메시지 전송 오류:", chrome.runtime.lastError);
        updateStatus("로그인 실패: " + chrome.runtime.lastError.message, false);
        return;
      }

      if (response && response.success) {
        updateStatus("로그인 성공!", true);
        displayUserInfo(response.user);
        loginBtn.style.display = "none";
        logoutBtn.style.display = "block";
      } else {
        updateStatus(
          "로그인 실패: " + (response?.error || "알 수 없는 오류"),
          false
        );
      }
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    loadingDiv.style.display = "none";
    loginBtn.disabled = false;
    updateStatus("로그인 오류: " + error.message, false);
  }
});

// 로그아웃 버튼 클릭
logoutBtn.addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove(["user", "idToken", "isAuthenticated"]);
    updateStatus("로그인되지 않음", false);
    userInfoDiv.style.display = "none";
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
    } else {
      updateStatus("로그인되지 않음", false);
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

// Background에서 인증 성공 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "AUTH_SUCCESS") {
    updateStatus("로그인 성공!", true);
    displayUserInfo(message.user);
    loginBtn.style.display = "none";
    logoutBtn.style.display = "block";
  }
});
