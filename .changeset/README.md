# Changesets

버전과 CHANGELOG 는 [changesets](https://github.com/changesets/changesets) 로 관리합니다.
배포 대상 패키지 4개(`core`, `vite-plugin`, `verifier`, `mcp-server`)는 항상 같은 버전으로 함께 올라갑니다(`fixed`).

변경을 만들 때마다 `pnpm changeset` 으로 이 폴더에 변경 파일을 추가하고, 배포할 때 `pnpm version-packages` 가 버전과 CHANGELOG 를 갱신합니다.
전체 절차는 [`docs/releasing.md`](../docs/releasing.md) 를 보세요.
