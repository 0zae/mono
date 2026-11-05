# Mono

입력창 하나에 "어제 스벅 5800 현금"처럼 적으면 날짜, 금액, 결제수단, 분류를 알아서 나눠 기록하는 가계부예요.
상호명은 Gemini가 알아보고, 한 번 알아낸 상호는 기억해 둬서 다음부터는 바로 분류해요.

## 구조

기록·설정·Gemini 키는 모두 **그 기기의 브라우저 저장소(IndexedDB)** 안에만 있어요. 서버가 없어요.

| 파일 | 역할 |
| --- | --- |
| `public/index.html` | 화면 (iOS 스타일) |
| `public/app.js` | 문장 해석(날짜·금액·결제수단), 화면 로직 |
| `public/local.js` | 기기 안 저장소, Gemini 호출, 정기 결제 자동 기록 |
| `public/sw.js`, `manifest.webmanifest` | 홈 화면 앱(PWA), 오프라인 실행 |
| `.github/workflows/pages.yml` | main에 올리면 `public/`을 GitHub Pages로 배포 |
| `server.js` | 맥에서 개발할 때 쓰는 정적 파일 서버 (`npm start`) |

## 개발

```bash
npm start
```
http://localhost:5173 에서 열어요. 맥 브라우저의 기록도 그 브라우저 안에만 저장돼요.

## 배포와 업데이트

`git push` 하면 GitHub Pages에 자동으로 올라가요. 폰에서 앱을 다시 열면 새 버전이 적용돼요.

## 아이폰에 설치

Safari로 배포 주소를 열고 공유 → **홈 화면에 추가**. 설정에서 Gemini 키를 넣고, 가끔 **백업 파일 내보내기**를 해 두세요.
