import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'

// 앱 높이 = 실제로 보이는 화면 높이 (iPad 사파리·홈 화면 앱에서 100dvh 가 화면과 어긋나 아래가 비는 경우가 있어 직접 잰다)
const setAppHeight = () => {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
}
setAppHeight()
window.addEventListener('resize', setAppHeight)
window.visualViewport?.addEventListener('resize', setAppHeight)
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 300))
window.addEventListener('pageshow', setAppHeight)
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
