import { useState, useEffect, useRef } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  QueryDocumentSnapshot,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { db, auth } from "./firebase-config";
import "./App.css";

interface Item {
  id: string;
  name: string;
  userId?: string;
  createdAt?: {
    toDate: () => Date;
  };
}

function App() {
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const navigate = useNavigate();
  const hasExtensionRequestRef = useRef<boolean>(false);

  useEffect(() => {
    // Extension으로부터 데이터 개수 요청 수신
    const handleMessage = async (event: MessageEvent) => {
      // Extension에서 온 메시지인지 확인
      if (event.data && event.data.type === "GET_DATA_COUNT_FROM_EXTENSION") {
        hasExtensionRequestRef.current = true;
        console.log("📥 Extension으로부터 데이터 개수 요청 수신");

        // 인증 상태가 준비될 때까지 대기하는 헬퍼 함수
        const waitForAuth = (): Promise<User | null> => {
          return new Promise((resolve) => {
            // 이미 로그인되어 있는 경우
            if (auth.currentUser) {
              resolve(auth.currentUser);
              return;
            }

            // 최대 5초 대기
            const timeout = setTimeout(() => {
              unsubscribe();
              resolve(null);
            }, 5000);

            const unsubscribe = onAuthStateChanged(auth, (user) => {
              if (user) {
                clearTimeout(timeout);
                unsubscribe();
                resolve(user);
              }
            });
          });
        };

        try {
          // 인증 상태 대기 (웹 앱이 로그인 페이지로 리다이렉트되면서 로그인할 수 있도록)
          const currentUser = await waitForAuth();

          // 로그인되어 있지 않은 경우
          if (!currentUser) {
            const errorMsg =
              event.data.user && event.data.user.email
                ? `웹 앱에서 먼저 로그인해주세요. (Extension: ${event.data.user.email})`
                : "로그인이 필요합니다.";

            console.warn("⚠️ 웹 앱에서 로그인되지 않음");
            window.postMessage(
              {
                type: "DATA_COUNT_RESPONSE",
                success: false,
                error: errorMsg,
              },
              window.location.origin
            );
            return;
          }

          // Extension에서 전달받은 사용자 정보와 현재 로그인한 사용자가 일치하는지 확인
          if (
            event.data.user &&
            event.data.user.uid &&
            currentUser.uid !== event.data.user.uid
          ) {
            console.warn("⚠️ Extension 사용자와 웹 앱 사용자가 일치하지 않음");
            window.postMessage(
              {
                type: "DATA_COUNT_RESPONSE",
                success: false,
                error: "Extension과 웹 앱에서 같은 계정으로 로그인해주세요.",
              },
              window.location.origin
            );
            return;
          }

          // 현재 로그인한 사용자의 데이터만 조회
          const q = query(
            collection(db, "items"),
            where("userId", "==", currentUser.uid)
          );
          const querySnapshot = await getDocs(q);
          const count = querySnapshot.size;
          console.log("✅ 데이터 개수 조회 완료:", count);

          // Extension에 응답 전송 (같은 window에 메시지 전송)
          window.postMessage(
            {
              type: "DATA_COUNT_RESPONSE",
              success: true,
              count: count,
            },
            window.location.origin
          );
          console.log("📤 Extension에 응답 전송 완료");
        } catch (error) {
          console.error("❌ 데이터 개수 가져오기 실패:", error);

          // Firestore 권한 오류인 경우 상세 정보 추가
          let errorMessage =
            error instanceof Error ? error.message : "알 수 없는 오류";
          if (
            error instanceof Error &&
            (error as any).code === "permission-denied"
          ) {
            errorMessage =
              "권한 오류: 웹 앱에서 로그인한 후 다시 시도해주세요.";
          }

          window.postMessage(
            {
              type: "DATA_COUNT_RESPONSE",
              success: false,
              error: errorMessage,
            },
            window.location.origin
          );
        }
      }
    };

    window.addEventListener("message", handleMessage);

    // 인증 상태 확인
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        // 로그인된 경우 데이터 로드
        loadData();
      } else {
        // Extension 요청이 있으면 리다이렉트하지 않음 (Extension이 에러 응답을 받을 수 있도록)
        if (!hasExtensionRequestRef.current) {
          // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
          navigate("/signin-popup?web=true");
        }
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener("message", handleMessage);
    };
  }, [navigate]);

  const loadData = async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 현재 로그인한 사용자의 데이터만 조회
      const q = query(
        collection(db, "items"),
        where("userId", "==", currentUser.uid)
      );
      const querySnapshot = await getDocs(q);
      const items: Item[] = [];
      querySnapshot.forEach((doc: QueryDocumentSnapshot) => {
        items.push({ id: doc.id, ...doc.data() } as Item);
      });

      setData(items);
    } catch (error) {
      console.error("❌ 데이터 로드 오류:", error);

      // Firestore 관련 오류 상세 정보
      if (error instanceof Error) {
        const firestoreError = error as any;
        console.error("오류 상세:", {
          name: error.name,
          message: error.message,
          code: firestoreError.code,
          stack: error.stack,
        });

        // 권한 오류인 경우 추가 안내
        if (firestoreError.code === "permission-denied") {
          console.error("💡 권한 오류 해결 방법:");
          console.error(
            "1. Firebase Console에서 Firestore 데이터베이스가 생성되었는지 확인"
          );
          console.error(
            "2. Firestore 규칙이 배포되었는지 확인: firebase deploy --only firestore:rules"
          );
          console.error("3. 브라우저를 새로고침하거나 캐시를 지우세요");
          console.error(
            "4. Firebase Console: https://console.firebase.google.com/project/" +
              db.app.options.projectId +
              "/firestore"
          );
        }
      }

      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류";
      setError(`데이터 로드 실패: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const addItem = async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("로그인이 필요합니다.");
      return;
    }

    try {
      setError(null);
      setLoading(true);

      await addDoc(collection(db, "items"), {
        name: `Item ${Date.now()}`,
        userId: currentUser.uid,
        createdAt: new Date(),
      });

      setSuccessMessage("항목이 성공적으로 추가되었습니다!");
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadData();
    } catch (error) {
      console.error("❌ 데이터 추가 오류:", error);
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류";

      // Firestore 관련 오류 상세 정보
      if (error instanceof Error) {
        console.error("오류 상세:", {
          name: error.name,
          message: error.message,
          code: (error as any).code,
          stack: error.stack,
        });
      }

      setError(`데이터 추가 실패: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (itemId: string): Promise<void> => {
    try {
      setError(null);
      setLoading(true);

      await deleteDoc(doc(db, "items", itemId));

      setSuccessMessage("항목이 성공적으로 삭제되었습니다!");
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadData();
    } catch (error) {
      console.error("❌ 데이터 삭제 오류:", error);
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류";

      // Firestore 관련 오류 상세 정보
      if (error instanceof Error) {
        console.error("오류 상세:", {
          name: error.name,
          message: error.message,
          code: (error as any).code,
          stack: error.stack,
        });
      }

      setError(`데이터 삭제 실패: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await signOut(auth);
      navigate("/signin-popup?web=true");
    } catch (error) {
      console.error("로그아웃 오류:", error);
      setError("로그아웃 중 오류가 발생했습니다.");
    }
  };

  // 인증 로딩 중
  if (authLoading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Web Application</h1>
          <p>로딩 중...</p>
        </header>
      </div>
    );
  }

  // 로그인되지 않은 경우 (리다이렉트 중이므로 빈 화면)
  if (!user) {
    return null;
  }

  return (
    <div className="App">
      <header className="App-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginBottom: "20px",
          }}
        >
          <div>
            <h1>Web Application</h1>
            <p>Firebase Firestore 연동 예제</p>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "14px", color: "#666" }}>{user.email}</div>
            <button
              onClick={handleLogout}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                cursor: "pointer",
                backgroundColor: "#ff6b6b",
                color: "white",
                border: "none",
                borderRadius: "4px",
              }}
            >
              로그아웃
            </button>
          </div>
        </div>

        <button onClick={addItem} disabled={loading}>
          항목 추가
        </button>

        <button onClick={loadData} disabled={loading}>
          새로고침
        </button>

        {loading && <p>로딩 중...</p>}

        {error && (
          <div
            style={{
              margin: "20px 0",
              padding: "15px",
              backgroundColor: "rgba(255, 0, 0, 0.1)",
              border: "1px solid rgba(255, 0, 0, 0.3)",
              borderRadius: "5px",
              color: "#ff6b6b",
            }}
          >
            <strong>오류:</strong> {error}
            <div style={{ marginTop: "10px", fontSize: "0.9em", opacity: 0.8 }}>
              💡 브라우저 개발자 도구 콘솔(F12)에서 상세 오류를 확인하세요.
            </div>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              margin: "20px 0",
              padding: "15px",
              backgroundColor: "rgba(0, 255, 0, 0.1)",
              border: "1px solid rgba(0, 255, 0, 0.3)",
              borderRadius: "5px",
              color: "#51cf66",
            }}
          >
            ✅ {successMessage}
          </div>
        )}

        <div className="data-list">
          <h2>데이터 목록</h2>
          {!loading && data.length === 0 && !error && (
            <p>
              데이터가 없습니다. "항목 추가" 버튼을 클릭하여 데이터를
              추가하세요.
            </p>
          )}
          {data.length > 0 && (
            <ul>
              {data.map((item) => (
                <li key={item.id} className="data-item">
                  <span className="item-content">
                    {item.name} - {item.createdAt?.toDate?.().toLocaleString()}
                  </span>
                  <button
                    className="delete-btn"
                    onClick={() => deleteItem(item.id)}
                    disabled={loading}
                    title="항목 삭제"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>
    </div>
  );
}

export default App;
