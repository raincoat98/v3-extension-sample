// Popup Script

// ===== DOM 요소 =====
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const statusDiv = document.getElementById("status");
const userInfoDiv = document.getElementById("userInfo");
const userDetailsDiv = document.getElementById("userDetails");
const loadingDiv = document.getElementById("loading");
const dataInfoDiv = document.getElementById("dataInfo");
const dataCountDiv = document.getElementById("dataCount");

// ===== 헬퍼 함수 =====

// 상태 업데이트
function updateStatus(message, isLoggedIn) {
  statusDiv.textContent = message;
  statusDiv.className = "status " + (isLoggedIn ? "logged-in" : "logged-out");
}

// 사용자 정보 표시 (XSS 방지)
function displayUserInfo(user) {
  userInfoDiv.style.display = "block";
  userDetailsDiv.innerHTML = "";

  const emailDiv = document.createElement("div");
  emailDiv.textContent = `이메일: ${user.email || "N/A"}`;

  const nameDiv = document.createElement("div");
  nameDiv.textContent = `이름: ${user.displayName || "N/A"}`;

  const uidDiv = document.createElement("div");
  uidDiv.textContent = `UID: ${user.uid || "N/A"}`;

  userDetailsDiv.appendChild(emailDiv);
  userDetailsDiv.appendChild(nameDiv);
  userDetailsDiv.appendChild(uidDiv);
}

// 데이터 정보 UI 업데이트
function updateDataInfo(display = true, text = null) {
  if (dataInfoDiv) {
    dataInfoDiv.style.display = display ? "block" : "none";
  }
  if (dataCountDiv && text !== null) {
    dataCountDiv.textContent = text;
  }
}

// 로그인 상태 UI 업데이트
function updateLoginUI(isLoggedIn, user = null) {
  updateStatus(isLoggedIn ? "로그인됨" : "로그인되지 않음", isLoggedIn);

  if (isLoggedIn && user) {
    displayUserInfo(user);
    userInfoDiv.style.display = "block";
    loginBtn.style.display = "none";
    logoutBtn.style.display = "block";
    loadDataCount();
  } else {
    userInfoDiv.style.display = "none";
    updateDataInfo(false);
    loginBtn.style.display = "block";
    logoutBtn.style.display = "none";
  }
}

// ===== 비즈니스 로직 =====

// 인증 상태 로드
async function loadAuthState() {
  try {
    chrome.storage.local.get(["user"], (result) => {
      if (chrome.runtime.lastError) {
        console.error("저장된 상태 로드 오류:", chrome.runtime.lastError);
        requestUserFromBackground();
        return;
      }

      const storedUser = result?.user;
      if (storedUser) {
        console.log("✅ Storage에서 사용자 정보 복원:", storedUser.email);
        updateLoginUI(true, storedUser);
      } else {
        console.log("📭 Storage에 사용자 정보 없음 - Background에서 요청");
        requestUserFromBackground();
      }
    });
  } catch (error) {
    console.error("상태 로드 오류:", error);
    updateStatus("로그인되지 않음", false);
  }
}

// Background에서 메모리 정보 요청 (fallback)
function requestUserFromBackground() {
  chrome.runtime.sendMessage({ type: "GET_CURRENT_USER" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Background 상태 로드 실패:", chrome.runtime.lastError);
      updateLoginUI(false);
      return;
    }

    updateLoginUI(!!response?.user, response?.user || null);
  });
}

// 데이터 개수 로드
async function loadDataCount() {
  console.log("📊 데이터 개수 로드 시작");
  updateDataInfo(true, "로딩 중...");

  try {
    chrome.runtime.sendMessage("GET_DATA_COUNT", (response) => {
      console.log("📥 Background로부터 응답 수신:", response);

      if (chrome.runtime.lastError) {
        console.error("데이터 개수 가져오기 실패:", chrome.runtime.lastError);
        updateDataInfo(true, "데이터를 가져올 수 없습니다");
        return;
      }

      if (response?.success) {
        console.log("✅ 데이터 개수:", response.count);
        updateDataInfo(true, `총 ${response.count}개 항목`);
      } else {
        console.error("❌ 데이터 개수 가져오기 실패:", response?.error);
        updateDataInfo(true, response?.error || "데이터를 가져올 수 없습니다");
      }
    });
  } catch (error) {
    console.error("데이터 개수 로드 오류:", error);
    updateDataInfo(true, "데이터를 가져올 수 없습니다");
  }
}

// ===== 이벤트 리스너 =====

// 로그인 버튼 클릭
loginBtn.addEventListener("click", () => {
  loginBtn.disabled = true;
  loadingDiv.style.display = "block";
  updateStatus("로그인 페이지를 여는 중...", false);

  chrome.runtime.sendMessage("LOGIN_GOOGLE", (response) => {
    if (chrome.runtime.lastError) {
      console.error("메시지 전송 오류:", chrome.runtime.lastError);
      updateStatus("로그인 실패: " + chrome.runtime.lastError.message, false);
      loadingDiv.style.display = "none";
      loginBtn.disabled = false;
    } else {
      updateStatus(
        "로그인 페이지가 열렸습니다. 새 탭에서 로그인을 진행하세요.",
        false
      );
    }
  });
});

// 로그아웃 버튼 클릭
logoutBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "LOGOUT" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("로그아웃 오류:", chrome.runtime.lastError);
      return;
    }

    updateLoginUI(false);
  });
});

// Storage 변경 이벤트 리스너
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.user) {
    console.log("📥 Storage 변경 감지 - 상태 업데이트 중...");
    updateLoginUI(!!changes.user.newValue, changes.user.newValue || null);
  }
});

// Background에서 인증 성공 메시지 수신
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "AUTH_SUCCESS") {
    updateStatus("로그인 성공!", true);
    updateLoginUI(true, message.user);
  }
});

// ===== 초기화 =====

loadAuthState();
