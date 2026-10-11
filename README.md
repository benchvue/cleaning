# 본당 청소 로봇 (cleaning)

교회 본당(#105) 카페트를 **Dreame L40 Ultra Gen 2 로봇 3대**가 매주 토요일 오전 9시에 함께 청소하는 시스템의 설계 문서와 웹페이지입니다. 로봇은 순정 펌웨어 그대로 두고, 교회 안의 엣지 서버가 Home Assistant·Matter로 지휘합니다. 천장 카메라가 로봇 윗면의 AprilTag로 위치를 추적합니다.

> 현재 상태: **설계 단계**입니다. 모든 페이지는 실제 계획대로 움직이는 **브라우저 가상 시뮬레이션**과 **예시 데이터**로 동작합니다.

- 사이트: https://benchvue.github.io/cleaning/
- 저장소: https://github.com/benchvue/cleaning (`main` 브랜치를 GitHub Pages로 배포)

## 페이지

| 페이지 | 누가 보나 | 내용 |
|---|---|---|
| [index.html](https://benchvue.github.io/cleaning/index.html) | 성도 (휴대폰) | 지금 청소 상황 가상 시뮬레이션, 지난 청소 기록, 다음 일정, 최근 12주 청소율. 카메라 영상은 없음 |
| [overview.html](https://benchvue.github.io/cleaning/overview.html) | 교역자 · 관리부 | 기술 용어 없이 정리한 도입 안내: 토요일 아침 흐름, 본당 배치, 필요한 장비, 예산, 유지비(주·월·년), 기대 효과, 일정, 사생활·안전, 결정할 것, 자주 묻는 질문 |
| [architecture.html](https://benchvue.github.io/cleaning/architecture.html) | 개발자 | 시스템 경계, 계층 구조, 운행 중 데이터 흐름 애니메이션, 좌표계, **AprilTag 위치 오차 분석(계산기 + 바닥 오차 지도)**, **Valetudo 생태계 활용 방식(기능 대응표)**, 설계 결정(ADR) |
| [software.html](https://benchvue.github.io/cleaning/software.html) | 개발자 | Docker 서비스, 로봇·미션 상태도, 문 뮤텍스, 시퀀스, 데이터 흐름, 알고리즘(줄 생성·재배분·청소율), 칼만 위치 융합, DB, API·MQTT, 설정 파일, Windows 11 Docker 개발, 테스트 |
| [hardware.html](https://benchvue.github.io/cleaning/hardware.html) | 개발자 | BOM, **로봇 비교 (L40 Ultra Gen 2 vs X40 Ultra)**, 물리 구성, 네트워크 VLAN, 전원(도크 회로 분리), 천장 카메라 배치, 태그 부착, 의자 통과 치수, 도크 자리, 설치·보정 절차, 예비 부품 |
| [maintain.html](https://benchvue.github.io/cleaning/maintain.html) | 관리자 · 개발자 | 실시간 지도와 제어(시작·일시정지·모두 복귀·긴급 정지), 로봇 상태, 이벤트, 일정 편집(매주·한 번·건너뛰기, JSON 내보내기/가져오기), 소모품, 기록 그래프. **아직 인증 없음** |

## 로봇

- 선택: [Dreame L40 Ultra Gen 2](https://www.dreametech.com/products/l40-ultra-gen2-robot-vacuum) ([Amazon B0FSJPFDPV](https://www.amazon.com/dp/B0FSJPFDPV?th=1)), 순정 펌웨어
- 대안: Dreame X40 Ultra + [Valetudo](https://valetudo.cloud/) (루팅, 완전 로컬 제어)
- Gen 2는 Valetudo 미지원이고, Matter는 제조사 OTA로 제공 예정입니다. 서버의 RobotPort·가상 로봇·지도 형식은 Valetudo capability에 맞춰 두어 로봇을 바꿔도 서버 코드는 같습니다.

## 핵심 숫자

| 항목 | 값 | 비고 |
|---|---|---|
| 의자 | 223석 (1열 64 · 2열 45 · 3열 45 · 4열 47 · 5열 22) | 실측 |
| 의자 통과 | 다리 사이 45.5 cm, 가로대 30 cm / 로봇 35 × 35 × 9.7 cm | 실측 · 공식 사양 |
| 청소할 카페트 | 약 234 m² | 본당 20 × 18 m 추정 |
| 청소 시간 | 약 67–75분 (3대) | 시뮬레이션 |
| 위치 오차 | 태그 보일 때 95% 약 3–6 cm, 의자 밑 10–30 cm | 천장 6 m, 4K 4대 가정 |
| 초기 비용 | 약 $2,700–4,300 | |
| 유지비 | 주 약 $10–17 (적립 포함), 실제 지출 주 $6–11 | |

## 폴더 구조

```
cleaning/
├─ index.html  overview.html  architecture.html
├─ software.html  hardware.html  maintain.html
├─ assets/
│  ├─ css/site.css       공통 스타일 (흰 바탕)
│  ├─ js/layout.js       본당 배치 데이터 (의자·금지 구역·구역·카메라) ← 실측값은 여기만 고치면 됨
│  ├─ js/sim.js          가상 청소 시뮬레이션 엔진 + 캔버스 뷰 (Fleet 규칙의 참조 구현)
│  ├─ js/diagram.js      상태도·흐름도·시퀀스 SVG 도우미
│  └─ img/               현장 사진
├─ data/
│  ├─ status.json        성도 페이지가 읽는 상태 (예시)
│  ├─ history.json       청소 기록 (예시 12주)
│  └─ schedule.json      일정 (매주·한 번·건너뛰기)
└─ README.md
```

## 로컬에서 보기

```bash
git clone https://github.com/benchvue/cleaning
cd cleaning
python -m http.server 8000      # Windows: py -m http.server 8000
# 브라우저에서 http://localhost:8000
```

`data/*.json`은 `fetch`로 읽기 때문에 파일을 더블클릭(file://)하면 예시 기본값으로 표시됩니다. 서버로 열어 주세요.

## GitHub Pages 배포

1. 이 폴더 내용을 `main` 브랜치 루트에 push
2. 저장소 Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `/ (root)`
3. `.nojekyll` 파일이 있어 `assets/` 폴더가 그대로 배포됩니다

## 실측 후 바꿀 곳

- 본당 폭·깊이, 줄 간격, 통로 폭 → `assets/js/layout.js`의 `L.W`, `L.D`, `chair.rowPitch`, `cols[].x/y`
- 천장 높이 → `layout.js`의 `ceilingH`, 그리고 architecture.html 계산기로 카메라 대수 확인
- 엣지 서버가 생기면 → `index.html`의 `API_BASE`에 공개 API 주소 입력

## 다음 단계

1. 로봇 1대 구매 → 의자 밑 통과, Matter·Home Assistant 연결 검증
2. `edge/` 폴더에 서버 코드 (fleet, scheduler, tracker, fusion, coverage, api) + `docker compose --profile sim`
3. 관리 페이지에 Cloudflare Access 인증을 붙인 뒤 실제 로봇 연결
