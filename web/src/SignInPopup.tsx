import { useEffect, useState } from "react";
import { signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";
import { auth } from "./firebase-config";
import "./SignInPopup.css";

interface InitAuthMessage {
  data?: {
    initAuth?: boolean;
  };
  origin: string;
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

  useEffect(() => {
    // 부모 창(Offscreen Document)으로부터 초기화 메시지 수신
    const handleMessage = async (event: MessageEvent) => {
      // 보안: origin 확인 (실제 배포 시 적절한 origin으로 변경)
      // if (event.origin !== 'chrome-extension://...') {
      //   return;
      // }

      const message = event as unknown as InitAuthMessage;
      if (message.data && message.data.initAuth) {
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
  }, []);

  const handleGoogleSignIn = async (): Promise<void> => {
    try {
      setStatus("Google 로그인 팝업 열기...");

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      const user: User = result.user;
      const idToken: string = await user.getIdToken();

      setStatus("로그인 성공!");

      // 사용자 정보를 부모 창(Offscreen Document)에 전송
      if (window.parent) {
        const userData: UserData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        };

        window.parent.postMessage(
          {
            user: userData,
            idToken: idToken,
          },
          "*" // 실제 배포 시 적절한 origin으로 변경
        );
      }

      // 잠시 후 페이지 닫기 (iframe 내부이므로 실제로는 부모가 처리)
      setTimeout(() => {
        setStatus("완료되었습니다.");
      }, 1000);
    } catch (error) {
      console.error("로그인 오류:", error);
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류";
      setStatus(`로그인 실패: ${errorMessage}`);

      // 에러를 부모 창에 전송
      if (window.parent) {
        window.parent.postMessage(
          {
            error: errorMessage,
          },
          "*"
        );
      }
    }
  };

  return (
    <div className="SignInPopup">
      <div className="container">
        <h1>Firebase 인증</h1>
        <div className="status">{status}</div>
        {!isInitialized && <p>초기화 대기 중...</p>}
      </div>
    </div>
  );
}

export default SignInPopup;
