// Extension 빌드 스크립트
// .env 파일을 읽어서 firebase-config.js와 background.js를 업데이트합니다

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// firebase-config.js 생성
const firebaseConfig = `// Firebase 설정 (자동 생성됨 - .env 파일에서 읽어옴)
const firebaseConfig = {
  apiKey: "${process.env.FIREBASE_API_KEY || "YOUR_API_KEY"}",
  authDomain: "${
    process.env.FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com"
  }",
  projectId: "${process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID"}",
  storageBucket: "${
    process.env.FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com"
  }",
  messagingSenderId: "${
    process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID"
  }",
  appId: "${process.env.FIREBASE_APP_ID || "YOUR_APP_ID"}",
};

// Firebase 초기화는 각 컨텍스트에서 필요에 따라 수행됩니다
`;

const configPath = path.join(__dirname, "firebase-config.js");
fs.writeFileSync(configPath, firebaseConfig, "utf8");
console.log("✅ firebase-config.js 파일이 생성되었습니다.");

// background.js의 SIGNIN_POPUP_URL 업데이트
const backgroundPath = path.join(__dirname, "background.js");
let backgroundContent = fs.readFileSync(backgroundPath, "utf8");
const signinPopupUrl =
  process.env.SIGNIN_POPUP_URL ||
  "https://YOUR_PROJECT_ID.web.app/signin-popup";

// SIGNIN_POPUP_URL 상수 업데이트
backgroundContent = backgroundContent.replace(
  /const SIGNIN_POPUP_URL = ".*?";/,
  `const SIGNIN_POPUP_URL = "${signinPopupUrl}";`
);

fs.writeFileSync(backgroundPath, backgroundContent, "utf8");
console.log("✅ background.js의 SIGNIN_POPUP_URL이 업데이트되었습니다.");
