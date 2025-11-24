// Extension 빌드 스크립트
// .env 파일을 읽어서 dist 폴더에 빌드 결과물을 생성합니다

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// dist 폴더 경로
const distDir = path.join(__dirname, "dist");

// dist 폴더가 없으면 생성
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log("📁 dist 폴더를 생성했습니다.");
}

// 복사할 파일 목록
const filesToCopy = ["manifest.json", "popup.html", "popup.js", "content-script.js"];

// 복사할 아이콘 파일 목록
const iconFiles = ["icon16.png", "icon48.png", "icon128.png"];

// 파일 복사 함수
function copyFile(src, dest) {
  const srcPath = path.join(__dirname, src);
  const destPath = path.join(distDir, dest);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    return true;
  }
  return false;
}

// 파일 복사
console.log("📋 파일 복사 중...");
filesToCopy.forEach((file) => {
  if (copyFile(file, file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ⚠️  ${file} (파일을 찾을 수 없습니다)`);
  }
});

// 아이콘 파일 복사
console.log("\n🎨 아이콘 파일 복사 중...");
let missingIcons = [];
iconFiles.forEach((icon) => {
  if (copyFile(icon, icon)) {
    console.log(`  ✅ ${icon}`);
  } else {
    console.log(`  ⚠️  ${icon} (파일을 찾을 수 없습니다)`);
    missingIcons.push(icon);
  }
});

if (missingIcons.length > 0) {
  console.log("\n⚠️  경고: 다음 아이콘 파일들이 없습니다:");
  missingIcons.forEach((icon) => console.log(`    - ${icon}`));
  console.log("\n💡 manifest.json에서 아이콘 참조를 제거합니다...");

  // manifest.json에서 아이콘 참조 제거
  const manifestPath = path.join(distDir, "manifest.json");
  let manifestContent = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestContent);

  // icons와 action.default_icon 제거
  delete manifest.icons;
  if (manifest.action) {
    delete manifest.action.default_icon;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log("✅ manifest.json에서 아이콘 참조를 제거했습니다.");
  console.log(
    "\n💡 나중에 아이콘 파일을 추가하면 다시 참조를 추가할 수 있습니다."
  );
}

// background.js의 SIGNIN_POPUP_URL과 WEB_APP_URL 업데이트
const backgroundPath = path.join(__dirname, "background.js");
const backgroundDestPath = path.join(distDir, "background.js");
let backgroundContent = fs.readFileSync(backgroundPath, "utf8");

// 환경 변수에서 URL 가져오기
const signinPopupUrl = process.env.SIGNIN_POPUP_URL || " ";
const webAppUrl = process.env.WEB_APP_URL || " ";

// SIGNIN_POPUP_URL 상수 업데이트 (extension 파라미터 포함)
const signinPopupUrlWithParam =
  signinPopupUrl +
  (signinPopupUrl.includes("?") ? "&" : "?") +
  "extension=true";
backgroundContent = backgroundContent.replace(
  /const SIGNIN_POPUP_URL = "SIGNIN_POPUP_URL_PLACEHOLDER";/,
  `const SIGNIN_POPUP_URL = "${signinPopupUrlWithParam}";`
);

// WEB_APP_URL 상수 업데이트
backgroundContent = backgroundContent.replace(
  /const WEB_APP_URL = "WEB_APP_URL_PLACEHOLDER";/,
  `const WEB_APP_URL = "${webAppUrl}";`
);

fs.writeFileSync(backgroundDestPath, backgroundContent, "utf8");
console.log(
  "✅ background.js의 SIGNIN_POPUP_URL과 WEB_APP_URL이 업데이트되었습니다."
);
console.log(`   SIGNIN_POPUP_URL: ${signinPopupUrlWithParam}`);
console.log(`   WEB_APP_URL: ${webAppUrl}`);

console.log("\n🎉 빌드 완료! dist 폴더를 확인하세요.");
