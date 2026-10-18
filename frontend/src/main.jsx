import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'
import { startAutoUpdate } from './lib/autoUpdate.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

// 개발 서버에선 캐시가 수정사항을 가리므로 배포 빌드에서만 등록
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}

// 새 배포가 나오면 켜 둔 화면도 알아서 새 버전으로
if (import.meta.env.PROD) startAutoUpdate()
