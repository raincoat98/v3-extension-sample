import { useEffect, useState, useCallback } from "react";
import { signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";
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

function SignInPopup() {
  const [status, setStatus] = useState<string>("초기화 중...");
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const handleGoogleSignIn = useCallback(async (): Promise<void> => {
    try {
      setStatus("Google 로그인 팝업 열기...");

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      const user: User = result.user;
      const idToken: string = await user.getIdToken();

      setStatus("로그인 성공!");

        const userData: UserData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        };

      // Extension에서 열렸는지 확인 (URL 파라미터 또는 window.name으로 확인)
      const isInIframe = window.self !== window.top;
      const urlParams = new URLSearchParams(window.location.search);
      const isExtensionTab =
        urlParams.get("extension") === "true" ||
        window.name === "extension-auth";

      if (isExtensionTab) {
        // Extension에서 열린 탭: localStorage에 저장하고 Extension이 읽도록 함
        const authData = {
          type: "AUTH_RESULT",
          user: userData,
          idToken: idToken,
          timestamp: Date.now(),
        };

        try {
          // localStorage에 저장 (리다이렉트 후에도 유지되도록)
          localStorage.setItem(
            "extension_auth_result",
            JSON.stringify(authData)
          );

          // sessionStorage에도 백업 저장 (리다이렉트 후에도 확인 가능)
          sessionStorage.setItem(
            "extension_auth_result",
            JSON.stringify(authData)
          );
        } catch (storageError) {
          console.error("localStorage 저장 실패:", storageError);
        }

        // window.postMessage로 Extension content script에 전송 시도
        window.postMessage(
          {
            type: "AUTH_RESULT",
            user: userData,
            idToken: idToken,
          },
          "*"
        );

        setStatus(
          "로그인 성공! Extension이 결과를 확인할 때까지 기다리는 중..."
        );

        // Extension이 데이터를 읽을 때까지 기다림 (리다이렉트 방지)
        // Extension이 localStorage를 읽으면 데이터를 정리하므로,
        // 주기적으로 확인하여 데이터가 사라지면 창 닫기
        const checkExtensionRead = setInterval(() => {
          const stillExists =
            localStorage.getItem("extension_auth_result") ||
            sessionStorage.getItem("extension_auth_result");

          if (!stillExists) {
            // Extension이 데이터를 읽었음
            clearInterval(checkExtensionRead);
            setTimeout(() => {
              window.close();
            }, 500);
          }
        }, 1000); // 1초마다 확인

        // 최대 30초 후 타임아웃
        setTimeout(() => {
          clearInterval(checkExtensionRead);
          window.close();
        }, 30000);
      } else if (isInIframe && window.parent) {
        // iframe 내부인 경우 부모 창(Offscreen Document)에 전송
        window.parent.postMessage(
          {
            user: userData,
            idToken: idToken,
          },
          "*" // 실제 배포 시 적절한 origin으로 변경
        );

      // 잠시 후 페이지 닫기 (iframe 내부이므로 실제로는 부모가 처리)
      setTimeout(() => {
        setStatus("완료되었습니다.");
      }, 1000);
      } else {
        // 독립 실행 모드: 메인 페이지로 리다이렉트
        setStatus("로그인 성공! 메인 페이지로 이동합니다...");
        
        // URL 파라미터로 웹 앱에서 온 경우 확인
        const urlParams = new URLSearchParams(window.location.search);
        const isWebApp = urlParams.get("web") === "true";
        
        setTimeout(() => {
          if (isWebApp) {
            window.location.href = "/";
          } else {
          window.location.href = "/";
          }
        }, 1500);
      }
    } catch (error) {
      console.error("로그인 오류:", error);
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류";
      setStatus(`로그인 실패: ${errorMessage}`);

      // 에러 전송
      const isInIframe = window.self !== window.top;
      const isExtensionContext =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;

      if (isExtensionContext) {
        // Extension 컨텍스트
        try {
          chrome.runtime?.sendMessage?.(chrome.runtime.id!, {
            type: "AUTH_RESULT",
            error: errorMessage,
          });
        } catch (error) {
          console.error("Extension 메시지 전송 실패:", error);
        }
      } else if (isInIframe && window.parent) {
        // iframe 내부인 경우
        window.parent.postMessage(
          {
            error: errorMessage,
          },
          "*"
        );
      }
    }
  }, []);

  useEffect(() => {
    // iframe 내부인지 확인 (확장 프로그램의 offscreen document에서 실행되는 경우)
    const isInIframe = window.self !== window.top;

    // URL 파라미터 확인 (Extension에서 열린 탭인지)
    const urlParams = new URLSearchParams(window.location.search);
    const isExtensionTab = urlParams.get("extension") === "true";

    if (isInIframe) {
      // 부모 창(Offscreen Document)으로부터 초기화 메시지 수신
      const handleMessage = async (event: MessageEvent) => {
        // 보안: origin 확인 (실제 배포 시 적절한 origin으로 변경)
        // if (event.origin !== 'chrome-extension://...') {
        //   return;
        // }

        const message = event.data as InitAuthMessage;
        if (message && message.initAuth) {
          setIsInitialized(true);
          setStatus("Google 로그인 준비 중...");

          // Google 로그인 실행
          await handleGoogleSignIn();
        }
      };

      window.addEventListener("message", handleMessage);

      return () => {
        window.removeEventListener("message", handleMessage);
      };
    } else if (isExtensionTab) {
      // Extension에서 열린 탭: 자동으로 로그인 시작
      setIsInitialized(true);
      setStatus("Google 로그인 준비 중...");

      // 페이지가 완전히 로드될 때까지 기다린 후 자동 로그인 시작
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
    } else {
      // 독립 실행 모드: 직접 로그인 버튼 표시
      setIsInitialized(true);
      setStatus("Google 로그인을 시작하려면 버튼을 클릭하세요.");
    }
  }, [handleGoogleSignIn]);

  const isInIframe = window.self !== window.top;

  return (
    <div className="SignInPopup">
      <div className="container">
        <h1>Firebase 인증</h1>
        <div className="status">{status}</div>
        {!isInIframe && isInitialized && (
          <button
            onClick={handleGoogleSignIn}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Google로 로그인
          </button>
        )}
        {isInIframe && !isInitialized && <p>초기화 대기 중...</p>}
      </div>
    </div>
  );
}

export default SignInPopup;
