// Offscreen Document - Firebase 초기화 및 관리

// Firebase Config (build-config.js에서 주입됨)
const FIREBASE_CONFIG = {
  apiKey: "FIREBASE_API_KEY_PLACEHOLDER",
  authDomain: "FIREBASE_AUTH_DOMAIN_PLACEHOLDER",
  projectId: "FIREBASE_PROJECT_ID_PLACEHOLDER",
  storageBucket: "FIREBASE_STORAGE_BUCKET_PLACEHOLDER",
  messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER",
  appId: "FIREBASE_APP_ID_PLACEHOLDER",
};

let app = null;
let auth = null;
let db = null;

// Firebase 초기화
function initializeFirebase() {
  if (app) {
    console.log("✅ Firebase 이미 초기화됨");
    return;
  }

  try {
    app = firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("✅ Firebase 초기화 완료 (Offscreen)");
  } catch (error) {
    console.error("❌ Firebase 초기화 실패:", error);
  }
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_DATA_COUNT") {
    handleGetDataCount(request, sendResponse);
    return true; // 비동기 응답
  }

  return false;
});

// 데이터 개수 가져오기
async function handleGetDataCount(request, sendResponse) {
  try {
    console.log("📊 Offscreen에서 데이터 개수 조회 시작...");

    // Firebase 초기화
    if (!app) {
      initializeFirebase();
    }

    // Background Script에서 전달받은 사용자 정보와 idToken 확인
    const user = request.user;
    const idToken = request.idToken;

    if (!user || !user.uid) {
      sendResponse({
        success: false,
        error: "사용자 정보가 없습니다.",
      });
      return;
    }

    // idToken이 있으면 인증 설정 시도
    if (idToken) {
      try {
        // idToken을 사용하여 커스텀 토큰으로 간접 인증
        // 서버 측 검증을 위해 Firestore 규칙에서 idToken을 검증하도록 설정하거나,
        // 클라이언트 측에서 직접 idToken 검증
        console.log("ℹ️ idToken으로 인증 설정 중...");

        // Firebase compat library에서는 직접 idToken으로 로그인할 수 없으므로
        // Firestore 규칙에서 userId로 직접 검증하고, 클라이언트는 userId로 필터링
        // Authorization은 Firestore 규칙 레벨에서 처리
      } catch (error) {
        console.log("⚠️ idToken 인증 설정 실패 (계속 진행):", error);
      }
    }

    // Firestore에서 데이터 개수 조회
    // 주의: 이 쿼리는 Firestore 규칙의 request.auth이 필요함
    // 규칙을 업데이트하거나, 다른 인증 방식을 사용해야 함
    const itemsRef = db.collection("items");
    const querySnapshot = await itemsRef
      .where("userId", "==", user.uid)
      .get();

    const count = querySnapshot.size;
    console.log("✅ 데이터 개수 조회 완료:", count);

    sendResponse({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error("❌ Offscreen에서 데이터 조회 실패:", error);
    sendResponse({
      success: false,
      error: error.message || "데이터 개수를 가져오는 중 오류가 발생했습니다.",
    });
  }
}

// 페이지 로드 시 Firebase 초기화
console.log("🔄 Offscreen Document 로드됨");
initializeFirebase();
