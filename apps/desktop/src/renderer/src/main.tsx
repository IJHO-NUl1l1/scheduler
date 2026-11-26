import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './styles.css';
import { App } from './App';
import { useStore } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 개발 빌드에서만: 화면 확인 스크립트가 탭을 바꿀 수 있게
if (import.meta.env.DEV || import.meta.env.MODE === 'development') (window as unknown as { __store: typeof useStore }).__store = useStore;
