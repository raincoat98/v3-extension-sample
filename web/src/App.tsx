import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase-config";
import "./App.css";

interface Item {
  id: string;
  name: string;
  createdAt?: {
    toDate: () => Date;
  };
}

function App() {
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();

    // Extension으로부터 데이터 개수 요청 수신
    const handleMessage = async (event: MessageEvent) => {
      // Extension에서 온 메시지인지 확인
      if (event.data && event.data.type === "GET_DATA_COUNT_FROM_EXTENSION") {
        console.log("📥 Extension으로부터 데이터 개수 요청 수신");
        try {
          const querySnapshot = await getDocs(collection(db, "items"));
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
          window.postMessage(
            {
              type: "DATA_COUNT_RESPONSE",
              success: false,
              error: error instanceof Error ? error.message : "알 수 없는 오류",
            },
            window.location.origin
          );
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const querySnapshot = await getDocs(collection(db, "items"));
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
    try {
      setError(null);
      setLoading(true);

      await addDoc(collection(db, "items"), {
        name: `Item ${Date.now()}`,
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

  return (
    <div className="App">
      <header className="App-header">
        <h1>Web Application</h1>
        <p>Firebase Firestore 연동 예제</p>

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
