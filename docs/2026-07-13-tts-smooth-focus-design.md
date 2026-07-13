# 음성 부드럽게 + 읽는 부분 포커싱 — 설계

2026-07-13. 대상: 단일 HTML 학습 앱(Web Speech API 내레이션·소리 모드).

## 요구
1. 사이트 음성(내레이션·탭 발음)을 더 부드럽게.
2. 음성이 읽는 부분을 화면에서 포커싱(하이라이트)해 학습을 돕는다.

전제: Web Speech API(기기 내장 음성) 유지 — 외부 TTS API·오디오 재생성 없음(무의존·오프라인 원칙).
별도 MP3 듣기 트랙(audio/)은 이번 범위 밖(이미 신경망 음성).

## A. 음성 부드럽게
1. **목소리 점수 랭킹** — `pickVoices()`를 점수제로:
   natural +40 · neural +36 · online +20 · google +18 · premium/enhanced +14 · siri +10,
   정확 로케일(ja-JP/ko-KR) +8, eSpeak/compact −40 · desktop(구형) −18.
   ja·ko 모두 적용. 신경망 음성이 있으면 반드시 그것을 잡는다.
2. **호흡 간격** — 큐 항목별 `gap`(발화 후 대기):
   낱말→뜻 140ms(붙여서) · 항목 마무리 450~500ms(호흡) · 문단 문장 240ms. 기존 일률 230ms 대체.
3. **일본어 청취 속도** — 내레이션·단발 발음의 ja 발화는 기준 속도 ×0.93 (학습자 청취),
   한국어 설명은 기준 그대로 → 대비가 자연스러움. pitch=1 명시.
4. **keepalive 게이팅** — 9초 pause/resume 트릭은 데스크톱 Chromium에서만.
   iOS/Safari/Android에서는 제거(스터터 원인, 필요 없음).

## B. 읽는 부분 포커싱
1. **가이드 낭독 전면 동기화** — guideNarration/guideDetail이 같은 chunkText로 잠금 동기:
   intro·섹션 본문은 문장 청크를 `<span class="nseg" id=…>`로 렌더 → **문장 단위** 하이라이트.
   예문/실수/팁/제목은 요소 단위 id. (기존: 가이드에는 ref가 전혀 없었음)
2. **데일리 한자 ref** — 한자 타일에 id 부여, 내레이션 한자 항목이 이를 참조.
3. **하이라이트 강화** — `.d-hi`: 금색 워시 + 2px 링 + 은은한 펄스(prefers-reduced-motion 시 정지).
4. **하단 자막 바** — 지금 읽는 텍스트를 화면 하단 캡션으로 표시(ref 없는 전환 멘트도 따라감).
   pointer-events:none, 내레이션 정지 시 사라짐.
5. **소리 모드 탭 발음** — 탭한 텍스트에 0.9초 d-hi 플래시.

## 검증
- 헤드리스(playwright + speechSynthesis 목): 음성 랭킹 선택, 가이드/데일리 하이라이트 시퀀스,
  자막 표시/숨김, ja<ko 속도 차, 기존 18개 회귀 체크.
- 배포 후 라이브 sha·자산 검증. Windows SMB 사본 동기화.

## 비고
- "fable" 요청은 Fable(Claude) 모델로 파이프라인을 튜닝하는 의미로 해석.
  (Anthropic은 TTS 보이스 미제공 · OpenAI 'fable' 보이스는 별도 API 키 필요 + 영어 특화라 부적합)
