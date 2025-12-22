# VerdantFlow 프로젝트

Todo와 메모를 한곳에서 관리하는 생산성 앱입니다. Chrome Extension v3와 Firebase를 사용합니다.

## 프로젝트 구조

```
test-extension/
├── extension/          # Chrome Extension v3
│   ├── manifest.json
│   ├── background.js   # Service Worker (인증 및 데이터 처리)
│   ├── content-script.js # Content Script (웹 앱과 통신)
│   ├── popup.html      # Extension 팝업 UI
│   ├── popup.js        # Extension 팝업 로직
│   ├── offscreen.html  # Offscreen 문서 (탭 없이 백그라운드 실행)
│   ├── offscreen.js    # Offscreen 문서 스크립트
│   ├── build-config.js # 빌드 스크립트 (환경 변수 주입)
│   └── dist/           # 빌드 결과물 (Chrome에 로드할 폴더)
└── web/                # React + Vite + TypeScript 앱 (메인 웹 애플리케이션 + SignInPopup 포함)
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── App.tsx          # 메인 앱 (Firestore 데이터 관리)
        ├── SignInPopup.tsx  # Extension용 로그인 팝업 (/signin-popup 경로)
        └── firebase-config.ts # Firebase 설정
```

## 인증 플로우 (Offscreen API 사용)

1. **Popup** → `sendMessage("LOGIN_GOOGLE")`
2. **Background SW** → Offscreen 문서 생성 (탭 없이 백그라운드 실행)
3. **Offscreen 문서** → iframe으로 `https://your-domain.com/signin-popup?extension=true` 로드
4. **SignInPopup** → URL 파라미터 확인 → 자동으로 Google 로그인 시작
5. **SignInPopup** → Firebase SDK `signInWithPopup()` 실행 → Google OAuth 팝업
6. **SignInPopup** → 로그인 성공 시 `window.postMessage`로 인증 결과 전송
7. **Offscreen 문서** → `window.postMessage` 감지 → `chrome.runtime.sendMessage`로 Background에 전달
8. **Background SW** → 인증 결과 수신 → `chrome.storage.local`에 저장
9. **Background SW** → Popup에 `AUTH_SUCCESS` 메시지 전송
10. **Popup** → 로그인 상태 업데이트 및 Firestore 데이터 개수 표시

**참고**:

- Offscreen API를 사용하여 **탭 없이** 백그라운드에서 인증이 처리됩니다
- 이벤트 기반 통신을 사용하므로 폴링(주기적 확인) 없이 즉시 처리됩니다
- 사용자는 탭이 열리거나 닫히는 것을 보지 않습니다

## 설정 방법

### 1. Firebase 프로젝트 설정

1. Firebase Console에서 새 프로젝트 생성
2. Authentication 활성화 (Google Sign-in 방법 추가)
3. Firestore Database 생성
4. Firebase 설정 정보를 각 폴더의 `.env` 파일에 입력

### 2. 환경 변수 설정

각 프로젝트 폴더에 `.env` 파일을 생성하고 설정을 입력하세요:

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

Extension은 Firebase를 직접 사용하지 않으며, 웹 앱의 URL만 필요합니다:

```env
SIGNIN_POPUP_URL=https://your_domain.com/signin-popup
WEB_APP_URL=https://your_domain.com
```

**참고**: `WEB_APP_URL`이 없으면 `SIGNIN_POPUP_URL`에서 `/signin-popup`을 제거한 값이 사용됩니다.

### 3. Extension 설정

1. `extension` 폴더로 이동
2. 의존성 설치 및 빌드:
   ```bash
   cd extension
   npm install
   npm run build
   ```
   빌드 후 `extension/dist` 폴더에 결과물이 생성됩니다.
3. Chrome에서 `chrome://extensions/` 열기
4. "개발자 모드" 활성화
5. "압축해제된 확장 프로그램을 로드합니다" 클릭
6. **`extension/dist` 폴더 선택** (빌드된 결과물)

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

### 5. 빌드 및 배포 스크립트

프로젝트 루트에 빌드 및 배포 스크립트가 포함되어 있습니다:

#### 빌드만 실행

```bash
# 방법 1: npm 스크립트 사용
npm run build

# 방법 2: 빌드 스크립트 사용
./build.sh
```

#### 배포

```bash
# 방법 1: npm 스크립트 사용
npm run deploy          # 빌드 + Firebase Hosting 배포
npm run deploy:firebase # Firebase Hosting만 배포
npm run deploy:firestore # Firestore 규칙만 배포
npm run deploy:all      # 빌드 + 전체 배포 (Hosting + Firestore)

# 방법 2: 배포 스크립트 사용 (대화형)
./deploy.sh
```

#### 개별 빌드

```bash
# 웹 앱만 빌드
npm run build:web

# Extension만 빌드
npm run build:extension
```

#### Firebase 직접 배포

```bash
firebase deploy --only hosting    # Hosting만
firebase deploy --only firestore  # Firestore만
firebase deploy                   # 전체 배포
```

**중요**: Extension의 `.env` 파일에서 `SIGNIN_POPUP_URL`과 `WEB_APP_URL`을 web 앱의 배포된 URL로 설정하세요:

```env
SIGNIN_POPUP_URL=https://your_domain.com/signin-popup
WEB_APP_URL=https://your_domain.com
```

## 데이터 개수 조회 기능 (Offscreen API 사용)

Extension 팝업에서 로그인 후 Firestore의 데이터 개수를 표시합니다:

1. **Popup** → 로그인 성공 시 `sendMessage("GET_DATA_COUNT")`
2. **Background SW** → Offscreen 문서 생성 또는 기존 문서 사용 (탭 없이 백그라운드 실행)
3. **Offscreen 문서** → iframe으로 웹 앱 로드
4. **Offscreen 문서** → iframe 내 웹 앱에 `window.postMessage`로 데이터 개수 요청
5. **Web App (App.tsx)** → `window.postMessage`로 메시지 수신
6. **Web App** → Firestore에서 데이터 개수 조회
7. **Web App** → `window.postMessage`로 결과 전송
8. **Offscreen 문서** → 결과를 `chrome.runtime.sendMessage`로 Background에 전달
9. **Background SW** → 결과를 Popup에 전달
10. **Popup** → 데이터 개수 표시

**참고**: Offscreen API를 사용하여 **탭 없이** 백그라운드에서 데이터를 조회합니다. 사용자는 탭이 열리거나 닫히는 것을 보지 않습니다.

## 주의사항

- `web/.env` 파일에 실제 Firebase 설정 정보를 입력해야 합니다
- `extension/.env` 파일에는 웹 앱의 URL만 설정하면 됩니다 (Firebase 설정 불필요)
- `.env` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다
- `extension` 폴더의 경우 `.env` 파일을 설정한 후 `npm run build`를 실행해야 합니다
- 빌드 후에는 **`extension/dist` 폴더**를 Chrome Extension으로 로드해야 합니다
- Extension 아이콘 파일(`icon16.png`, `icon48.png`, `icon128.png`)이 없어도 작동하지만, 추가하면 더 좋습니다
- Extension은 Firebase를 직접 사용하지 않으며, 모든 Firebase 작업은 웹 앱에서 처리됩니다
- **Offscreen API 사용**: 이 Extension은 Chrome의 Offscreen API를 사용하여 탭 없이 백그라운드에서 웹 앱과 통신합니다. 사용자는 탭이 열리거나 닫히는 것을 보지 않습니다.
