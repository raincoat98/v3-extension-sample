import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, "items"));
      const items: Item[] = [];
      querySnapshot.forEach((doc: QueryDocumentSnapshot) => {
        items.push({ id: doc.id, ...doc.data() } as Item);
      });
      setData(items);
    } catch (error) {
      console.error("데이터 로드 오류:", error);
    } finally {
      setLoading(false);
    }
  };

  const addItem = async (): Promise<void> => {
    try {
      await addDoc(collection(db, "items"), {
        name: `Item ${Date.now()}`,
        createdAt: new Date(),
      });
      loadData();
    } catch (error) {
      console.error("데이터 추가 오류:", error);
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

        <div className="data-list">
          <h2>데이터 목록</h2>
          {data.length === 0 ? (
            <p>데이터가 없습니다.</p>
          ) : (
            <ul>
              {data.map((item) => (
                <li key={item.id}>
                  {item.name} - {item.createdAt?.toDate?.().toLocaleString()}
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
