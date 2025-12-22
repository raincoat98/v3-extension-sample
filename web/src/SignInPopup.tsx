import { useEffect, useState, useCallback } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User,
} from "firebase/auth";
import { Mail, Lock } from "lucide-react";
import { auth } from "./firebase-config";
import "./SignInPopup.css";

interface InitAuthMessage {
  initAuth?: boolean;
}

interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

type AuthMode = "google" | "email";
type EmailMode = "login" | "signup";

function SignInPopup() {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<AuthMode>("email");
  const [emailMode, setEmailMode] = useState<EmailMode>("login");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 공통 인증 결과 처리 함수
  const handleAuthSuccess = useCallback(async (user: User, idToken: string) => {
    setErrorMessage(null);
    const userData: UserData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };

    const isInIframe = window.self !== window.top;
    const urlParams = new URLSearchParams(window.location.search);
    const isExtensionTab =
      urlParams.get("extension") === "true" || window.name === "extension-auth";

    if (isExtensionTab) {
      console.log("✅ Extension 탭에서 로그인 성공, 인증 결과 처리 시작");

      const authData = {
        type: "AUTH_RESULT",
        user: userData,
        idToken: idToken,
        timestamp: Date.now(),
      };

      try {
        localStorage.setItem("extension_auth_result", JSON.stringify(authData));
        sessionStorage.setItem(
          "extension_auth_result",
          JSON.stringify(authData)
        );
        console.log("✅ localStorage/sessionStorage에 인증 결과 저장 완료");
      } catch (storageError) {
        console.error("❌ localStorage 저장 실패:", storageError);
      }

      // Extension content script에 인증 결과 전송 (약간의 지연을 두어 content script가 준비될 시간 제공)
      setTimeout(() => {
        console.log("📤 Extension content script에 인증 결과 전송:", {
          type: "AUTH_RESULT",
          userEmail: userData.email,
          origin: window.location.origin,
        });
        window.postMessage(
          {
            type: "AUTH_RESULT",
            user: userData,
            idToken: idToken,
          },
          window.location.origin
        );
      }, 100);

      const checkExtensionRead = setInterval(() => {
        const stillExists =
          localStorage.getItem("extension_auth_result") ||
          sessionStorage.getItem("extension_auth_result");

        if (!stillExists) {
          clearInterval(checkExtensionRead);
          setTimeout(() => {
            window.close();
          }, 500);
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(checkExtensionRead);
        window.close();
      }, 30000);
    } else if (isInIframe && window.parent) {
      window.parent.postMessage(
        {
          user: userData,
          idToken: idToken,
        },
        "*"
      );
    } else {
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    }
  }, []);

  const handleGoogleSignIn = useCallback(async (): Promise<void> => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      const user: User = result.user;
      const idToken: string = await user.getIdToken();
      await handleAuthSuccess(user, idToken);
    } catch (error) {
      console.error("로그인 오류:", error);
      const errorMsg =
        error instanceof Error ? error.message : "알 수 없는 오류";
      setErrorMessage(errorMsg);

      // 에러 전송
      const isInIframe = window.self !== window.top;
      const isExtensionContext =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;

      if (isExtensionContext) {
        // Extension 컨텍스트
        try {
          chrome.runtime?.sendMessage?.(chrome.runtime.id!, {
            type: "AUTH_RESULT",
            error: errorMsg,
          });
        } catch (error) {
          console.error("Extension 메시지 전송 실패:", error);
        }
      } else if (isInIframe && window.parent) {
        // iframe 내부인 경우
        window.parent.postMessage(
          {
            error: errorMsg,
          },
          "*"
        );
      }
    }
  }, [handleAuthSuccess]);

  // 이메일 로그인/회원가입
  const handleEmailAuth = useCallback(async (): Promise<void> => {
    if (!email || !password) {
      return;
    }

    try {
      if (emailMode === "signup") {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        const user: User = result.user;
        const idToken: string = await user.getIdToken();
        await handleAuthSuccess(user, idToken);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user: User = result.user;
        const idToken: string = await user.getIdToken();
        await handleAuthSuccess(user, idToken);
      }
    } catch (error) {
      console.error("이메일 인증 오류:", error);
      let errorMessage = "알 수 없는 오류";
      if (error instanceof Error) {
        if (error.message.includes("auth/email-already-in-use")) {
          errorMessage = "이미 사용 중인 이메일입니다.";
        } else if (error.message.includes("auth/invalid-email")) {
          errorMessage = "올바른 이메일 주소를 입력해주세요.";
        } else if (error.message.includes("auth/weak-password")) {
          errorMessage = "비밀번호는 6자 이상이어야 합니다.";
        } else if (error.message.includes("auth/user-not-found")) {
          errorMessage = "등록되지 않은 이메일입니다.";
        } else if (
          error.message.includes("auth/wrong-password") ||
          error.message.includes("auth/invalid-credential")
        ) {
          errorMessage = "이메일 또는 비밀번호가 올바르지 않습니다.";
        } else {
          errorMessage = error.message;
        }
      }

      setErrorMessage(errorMessage);

      const isInIframe = window.self !== window.top;
      const isExtensionContext =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;

      if (isExtensionContext) {
        try {
          chrome.runtime?.sendMessage?.(chrome.runtime.id!, {
            type: "AUTH_RESULT",
            error: errorMessage,
          });
        } catch (error) {
          console.error("Extension 메시지 전송 실패:", error);
        }
      } else if (isInIframe && window.parent) {
        window.parent.postMessage(
          {
            error: errorMessage,
          },
          "*"
        );
      }
    }
  }, [email, password, emailMode, handleAuthSuccess]);

  useEffect(() => {
    const isInIframe = window.self !== window.top;
    const urlParams = new URLSearchParams(window.location.search);
    const isExtensionTab = urlParams.get("extension") === "true";
    const mode = urlParams.get("mode") as AuthMode | null;

    // URL 파라미터로 로그인 모드 설정
    if (mode === "email" || mode === "google") {
      setAuthMode(mode);
    }

    if (isInIframe) {
      const handleMessage = async (event: MessageEvent) => {
        const message = event.data as InitAuthMessage;
        if (message && message.initAuth) {
          setIsInitialized(true);
          const authMode = (message as any).authMode || "google";
          setAuthMode(authMode);

          if (authMode === "email") {
            // 이메일 로그인
          } else {
            await handleGoogleSignIn();
          }
        }
      };

      window.addEventListener("message", handleMessage);
      return () => {
        window.removeEventListener("message", handleMessage);
      };
    } else if (isExtensionTab) {
      setIsInitialized(true);
      if (mode !== "email") {
        if (document.readyState === "complete") {
          setTimeout(() => {
            handleGoogleSignIn();
          }, 1000);
        } else {
          window.addEventListener("load", () => {
            setTimeout(() => {
              handleGoogleSignIn();
            }, 1000);
          });
        }
      }
    } else {
      setIsInitialized(true);
    }
  }, [handleGoogleSignIn]);

  const isInIframe = window.self !== window.top;

  return (
    <div className="SignInPopup">
      <div className="container">
        <div className="logo-section">
          <div className="logo-icon">🌿</div>
          <h1>VerdantFlow</h1>
          <p className="subtitle">
            Todo와 메모를 한곳에서 관리하세요.
            <br />
            이메일로 로그인하여 시작하세요
          </p>
        </div>

        {errorMessage && (
          <div className="error-message">
            <strong>오류:</strong> {errorMessage}
          </div>
        )}

        {!isInIframe && isInitialized && (
          <>
            {authMode === "email" && (
              <div className="email-section">
                {emailMode === "login" && (
                  <>
                    <div className="input-group">
                      <span className="input-icon"><Mail size={18} /></span>
                      <input
                        type="email"
                        placeholder="이메일"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <span className="input-icon"><Lock size={18} /></span>
                      <input
                        type="password"
                        placeholder="비밀번호"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleEmailAuth();
                          }
                        }}
                      />
                    </div>

                    <a href="#" className="forgot-password">
                      비밀번호를 잊으셨나요?
                    </a>

                    <button
                      onClick={handleEmailAuth}
                      className="primary-button"
                    >
                      계속하기
                    </button>

                    <div className="divider-text">
                      아직 계정이 없으신가요?
                    </div>

                    <button
                      onClick={() => setEmailMode("signup")}
                      className="secondary-button"
                    >
                      회원가입
                    </button>

                    <button
                      onClick={() => setAuthMode("google")}
                      className="secondary-button"
                    >
                      Google로 로그인
                    </button>
                  </>
                )}

                {emailMode === "signup" && (
                  <>
                    <div className="input-group">
                      <span className="input-icon"><Mail size={18} /></span>
                      <input
                        type="email"
                        placeholder="이메일"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <span className="input-icon"><Lock size={18} /></span>
                      <input
                        type="password"
                        placeholder="비밀번호"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleEmailAuth();
                          }
                        }}
                      />
                    </div>

                    <button
                      onClick={handleEmailAuth}
                      className="primary-button"
                    >
                      회원가입
                    </button>

                    <div className="divider-text">이미 계정이 있으신가요?</div>

                    <button
                      onClick={() => setEmailMode("login")}
                      className="secondary-button"
                    >
                      로그인
                    </button>
                  </>
                )}
              </div>
            )}

            {authMode === "google" && (
              <button onClick={handleGoogleSignIn} className="google-button">
                Google로 로그인
              </button>
            )}
          </>
        )}

        {isInIframe && !isInitialized && <p>초기화 대기 중...</p>}

        <div className="footer-text">
          "계속하기"를 클릭하면 VerdantFlow의
          <br />
          <a href="#">이용약관</a>과 <a href="#">개인정보 보호정책</a>에 동의하는 것입니다
        </div>
      </div>
    </div>
  );
}

export default SignInPopup;
