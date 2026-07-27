import { redirect } from 'next/navigation';

// middleware.js가 항상 '/' 요청을 '/login'으로 리다이렉트하므로 이 파일이
// 렌더링될 일은 거의 없다 — 미들웨어가 어떤 이유로든 실행되지 않는 경우를
// 대비한 서버 사이드 안전망일 뿐이다.
export default function RootPage() {
  redirect('/login');
}
