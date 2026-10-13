# 배포 가이드 (npm)

배포 대상은 4개 패키지이고 **항상 같은 버전**으로 함께 올라갑니다(changesets `fixed` 그룹).

| 패키지 | 설치 후 쓰는 것 |
| --- | --- |
| `@inspector-agent/core` | 탐지 엔진, 타입, 시나리오 검증 (라이브러리) |
| `@inspector-agent/vite-plugin` | Vite/Nuxt 플러그인 (`data-ia-src` 주입) |
| `@inspector-agent/verifier` | `inspector-scan` CLI 와 스캔·재측정 API |
| `@inspector-agent/mcp-server` | `inspector-agent-mcp` (Claude Code 등 MCP 서버) |

`source-locator`, `extension`, 대시보드, playground 는 배포하지 않습니다(`private`). 대시보드(`apps/dashboard`)는 npm 패키지가 아니라 저장소에서 실행합니다.

## 1. 패키지 이름 확인 결과 (2026-10-13)

| 이름 | npm 상태 |
| --- | --- |
| `@inspector-agent/core`, `/vite-plugin`, `/verifier`, `/mcp-server` | 모두 **비어 있음**(E404) |
| 대안 `inspector-agent-core`, `-vite-plugin`, `-verifier`, `-mcp-server`, `-mcp` | 모두 비어 있음 |

**스코프 `@inspector-agent` 를 내가 쓸 수 있는지는 로그인 없이 확인할 수 없습니다**(npm 사용자·조직 조회가 인증을 요구). 그래서 스코프 이름을 유지했습니다. 배포 전에 아래 중 하나로 확인하세요.

```bash
npm login
npm org ls inspector-agent        # 내가 속한 조직이면 멤버 목록이 나옵니다
```

- **조직이 없으면 만드세요**: https://www.npmjs.com/org/create 에서 이름 `inspector-agent`, 공개 패키지용 **무료** 플랜. 이름이 이미 다른 사람에게 있으면 만들 수 없습니다.
- **스코프를 쓸 수 없으면 대안 이름으로 바꾸세요**: 6절의 일괄 변경 절차를 따릅니다.

## 2. 한 번만 하는 준비

1. **npm 계정**에 2단계 인증(2FA)을 켭니다.
2. **조직 `inspector-agent`** 를 만들거나 멤버로 들어갑니다(위 1절).
3. **자동 배포용 토큰**: npm → Access Tokens → *Generate New Token* → **Granular Access Token**
   - Packages and scopes: `@inspector-agent` 스코프에 **Read and write**
   - 만료일을 정하고(예: 90일), 필요하면 "Bypass two-factor authentication" 을 켭니다(CI 는 OTP 를 입력할 수 없습니다)
4. **GitHub 시크릿**으로 등록합니다(토큰을 채팅·파일에 붙이지 마세요).

   ```bash
   gh secret set NPM_TOKEN        # 프롬프트에 토큰을 붙여 넣기
   ```

   또는 저장소 Settings → Secrets and variables → Actions → New repository secret, 이름 `NPM_TOKEN`.

## 3. 첫 배포 (0.1.0)

현재 버전이 `0.1.0` 이고 아직 npm 에 없으므로, 변경 파일(changeset) 없이 바로 올립니다.

### 3-1. 로컬에서 먼저 검증

```bash
git switch main && git pull
pnpm install --frozen-lockfile
pnpm release:check          # 메타데이터, 산출물, LICENSE, README, 의존 범위 검증
pnpm release:smoke          # pack → 임시 Vite 프로젝트에 설치 → 동작 확인 (Chromium 필요)
```

`release:smoke` 는 tarball 만으로 설치해서 ① 플러그인이 `data-ia-src` 를 주입하고 ② `inspector-scan` 이 375px 결함을 잡고 ③ MCP 서버가 도구 5개를 노출하고 ④ `core` 를 가져올 수 있는지 확인합니다. 저장소 안의 workspace 링크는 `exports` 누락 같은 문제를 가리기 때문에 이 검증이 필요합니다.

### 3-2. 태그를 push 해서 자동 배포 (권장)

```bash
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` 이 다음을 순서대로 합니다. 하나라도 실패하면 배포하지 않습니다.

1. 태그가 **main 에 병합된 커밋**을 가리키는지 확인
2. 타입체크, 전체 테스트(확장 E2E 포함), `release:check --tag v0.1.0`(태그와 패키지 버전 일치), tarball 스모크
3. `NPM_TOKEN` 시크릿 존재 확인
4. `changeset publish` (npm 에 없는 버전만 올림, provenance 켬)

Actions 탭에서 진행을 보고, 끝나면 5절로 확인합니다.

### 3-3. 직접 배포 (Actions 를 쓰지 않을 때)

```bash
npm login                                   # 2FA OTP 입력
pnpm release                                # build → release:check → changeset publish
# OTP 를 매번 물어보는 설정이면:  pnpm build && pnpm exec changeset publish --otp 123456
```

로컬 배포에는 provenance(출처 증명)가 붙지 않습니다. 가능하면 3-2 를 쓰세요.

## 4. 이후 배포 (changesets)

```bash
git switch -c chore/release-0.2.0
pnpm changeset                 # 변경 설명을 쓰고 bump 종류(patch/minor/major)를 고릅니다 → .changeset/*.md 생성
git add .changeset && git commit -m "changeset: <변경 요약>"
# PR → main 병합 (변경이 쌓일 때마다 changeset 을 추가해도 됩니다)

git switch main && git pull
pnpm version-packages          # 버전 올림 + CHANGELOG.md 갱신 + changeset 파일 소비
git add -A && git commit -m "chore: 0.2.0 릴리스"   # PR → main 병합
git tag v0.2.0 && git push origin v0.2.0             # 자동 배포
```

4개 패키지는 `fixed` 그룹이라 하나만 바뀌어도 같은 버전으로 함께 올라갑니다(사용자가 호환되는 조합을 고민할 필요가 없습니다). `0.x` 에서는 `minor` 가 호환성을 깨는 변경, `patch` 가 수정입니다.

## 5. 배포 확인

```bash
npm view @inspector-agent/verifier version dist.tarball
mkdir /tmp/ia-check && cd /tmp/ia-check && npm init -y >/dev/null
npm install -D @inspector-agent/vite-plugin @inspector-agent/verifier
npx inspector-scan                # 사용법이 출력되면 bin 이 연결된 것
```

## 6. 문제 해결

| 증상 | 원인과 해결 |
| --- | --- |
| `E403 … You do not have permission to publish "@inspector-agent/…"` / `Scope not found` | 스코프를 쓸 권한이 없음. 1절로 조직을 만들거나 멤버가 되고, 토큰의 스코프 권한을 확인. 쓸 수 없으면 **이름 변경**(아래) |
| `E402 Payment Required` | 스코프 패키지가 비공개로 올라가려 함. 이 저장소는 `publishConfig.access: public` 이므로 보통 발생하지 않음. 직접 배포 시 `--access public` 이 빠진 경우 |
| `EOTP` | 2FA OTP 필요. 3-3 의 `--otp`, 또는 CI 용 토큰에 2FA 우회 허용 |
| `E422 … provenance` | provenance 는 GitHub Actions 의 공개 저장소에서만 가능. 로컬 배포에서는 `NPM_CONFIG_PROVENANCE` 를 켜지 마세요 |
| `E409`/`cannot publish over the previously published versions` | 이미 올라간 버전. `changeset publish` 는 이를 건너뛰므로 보통 새 버전이 필요한 경우(4절) |
| 릴리스 워크플로가 `태그가 main 에 병합되지 않은 커밋` 으로 실패 | 태그를 지우고(`git tag -d v0.1.0 && git push origin :refs/tags/v0.1.0`) main 에 병합된 커밋에 다시 붙임 |
| `release:check` 가 `…가 없습니다 (pnpm build …)` | 먼저 `pnpm build` |

### 잘못 올렸을 때

```bash
npm deprecate "@inspector-agent/verifier@0.1.0" "문제가 있습니다. 0.1.1 을 쓰세요"   # 권장: 지우지 말고 경고
npm unpublish "@inspector-agent/verifier@0.1.0"   # 올린 지 72시간 이내, 다른 패키지가 의존하지 않을 때만 가능
```

### 스코프를 쓸 수 없어 이름을 바꿀 때

`@inspector-agent/<이름>` 을 `inspector-agent-<이름>`(비스코프)으로 일괄 변경하는 예시입니다. 다른 스코프를 쓰려면 치환 문자열만 바꾸세요.

```bash
git switch -c chore/rename-packages
git grep -l '@inspector-agent/' -- . ':!pnpm-lock.yaml' | xargs sed -i '' 's#@inspector-agent/#inspector-agent-#g'   # macOS. Linux 는 sed -i 만
sed -i '' "s#export const SCOPE = '@inspector-agent/'#export const SCOPE = 'inspector-agent-'#" scripts/release-check.mjs
pnpm install                     # 락파일 갱신
pnpm build && pnpm test && pnpm typecheck && pnpm release:check && pnpm release:smoke
```

비스코프 이름은 `publishConfig.access` 가 필요 없지만 두어도 무해합니다. 설치 안내 문구(README, 이 문서)의 이름도 함께 확인하세요.
