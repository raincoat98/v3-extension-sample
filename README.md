# Firebase Auth Extension 프로젝트

Chrome Extension v3를 사용한 Firebase Authentication 샘플 프로젝트입니다.

## 프로젝트 구조

```
test-extension/
├── extension/          # Chrome Extension v3
│   ├── manifest.json
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── offscreen.html
│   ├── offscreen.js
│   └── firebase-config.js
└── web/                # React + Vite + TypeScript 앱 (메인 웹 애플리케이션 + SignInPopup 포함)
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── App.tsx          # 메인 앱
        └── SignInPopup.tsx  # Extension용 로그인 팝업 (/signin-popup 경로)
```

## 인증 플로우

1. **Popup** → `sendMessage("LOGIN_GOOGLE")`
2. **Background SW** → `setupOffscreen()` → `chrome.offscreen.createDocument()`
3. **Offscreen Document** → iframe 생성 → signin-popup 페이지 로드
4. **Offscreen Document** → `postMessage({ initAuth: true })`
5. **Signin-popup** → Firebase SDK `signInWithPopup()` 실행 → Google OAuth 팝업
6. **Signin-popup** → `postMessage({ user, idToken })`
7. **Offscreen Document** → `chrome.runtime.sendMessage({ user, idToken })`
8. **Background SW** → `sendResponse()`
9. **Popup** → 로그인 결과 수신 & 저장

## 설정 방법

### 1. Firebase 프로젝트 설정

1. Firebase Console에서 새 프로젝트 생성
2. Authentication 활성화 (Google Sign-in 방법 추가)
3. Firestore Database 생성
4. Firebase 설정 정보를 각 폴더의 `.env` 파일에 입력

### 2. 환경 변수 설정

각 프로젝트 폴더에 `.env` 파일을 생성하고 Firebase 설정을 입력하세요:

#### web/.env (Vite)

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

#### extension/.env

```env
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_app_id
SIGNIN_POPUP_URL=https://your_domain.com/signin-popup
```

각 폴더의 `.env.example` 파일을 참고하세요.

### 3. Extension 설정

1. `extension` 폴더로 이동
2. 의존성 설치 및 빌드:
   ```bash
   cd extension
   npm install
   npm run build
   ```
3. Chrome에서 `chrome://extensions/` 열기
4. "개발자 모드" 활성화
5. "압축해제된 확장 프로그램을 로드합니다" 클릭
6. `extension` 폴더 선택

### 4. Web 앱 실행 및 배포 (Vite)

Web 앱에는 메인 앱과 SignInPopup이 모두 포함되어 있습니다 (React Router 사용):

- `/` - 메인 앱 (App.tsx)
- `/signin-popup` - Extension용 로그인 팝업 (SignInPopup.tsx)

개발 서버 실행:

```bash
cd web
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
npm run preview  # 빌드된 앱 미리보기
```

Firebase Hosting에 배포:

```bash
firebase deploy --only hosting
```

또는 `firebase.json` 설정 후:

```bash
firebase init hosting
firebase deploy
```

**중요**: Extension의 `.env` 파일에서 `SIGNIN_POPUP_URL`을 web 앱의 배포된 URL로 설정하세요:

```
SIGNIN_POPUP_URL=https://your_domain.com/signin-popup
```

## 주의사항

- 모든 `.env` 파일에 실제 Firebase 설정 정보를 입력해야 합니다
- `.env` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다
- `extension` 폴더의 경우 `.env` 파일을 설정한 후 `npm run build`를 실행해야 합니다
- 보안을 위해 실제 배포 시 `postMessage`의 origin 검증을 강화해야 합니다
- Extension 아이콘 파일(`icon16.png`, `icon48.png`, `icon128.png`)을 추가해야 합니다
