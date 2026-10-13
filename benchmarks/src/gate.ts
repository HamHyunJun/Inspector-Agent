/**
 * 탐지 규칙 회귀 게이트. 정답표와 대조군이 정한 불변 조건이 하나라도 깨지면 벤치마크를 실패 처리해
 * CI 가 규칙 변경 PR 을 막을 수 있게 한다. 토큰 수나 규칙 기반 치유 성공률은 게이트에 넣지 않는다.
 */
export interface DetectionSummary {
  recall: number
  precision: number
  negativeControlHits: number
  /** 모바일에서만 깨지는 결함만 심었으므로 데스크톱(1280px)에서는 0건이어야 한다 */
  desktopDefects: number
  /** 연쇄 결함 묶음이 정답표(cascadedCount)와 다른 결함 수 */
  cascadeMismatches: number
  /** 다른 URL 에도 나오는 결함이 URL 과 무관하게 한 그룹(발생 URL 2개)으로 묶이지 않은 수 */
  groupingMismatches: number
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`

export const findDetectionRegressions = (summary: DetectionSummary): string[] => {
  const problems: string[] = []
  if (summary.recall < 1) problems.push(`재현율 ${percent(summary.recall)} (정답 결함을 놓침, 100% 필요)`)
  if (summary.precision < 1) problems.push(`정밀도 ${percent(summary.precision)} (정답표에 없는 결함을 탐지함, 100% 필요)`)
  if (summary.negativeControlHits > 0) problems.push(`정상 대조군 오탐 ${summary.negativeControlHits}건 (0건이어야 함)`)
  if (summary.desktopDefects > 0) problems.push(`1280px 결함 ${summary.desktopDefects}건 (0건이어야 함)`)
  if (summary.cascadeMismatches > 0) problems.push(`연쇄 결함 묶음이 정답표와 다른 결함 ${summary.cascadeMismatches}건 (형제가 따로 나오거나 묶이지 않음)`)
  if (summary.groupingMismatches > 0) problems.push(`URL 이 달라도 한 그룹이어야 하는 결함 ${summary.groupingMismatches}건이 묶이지 않음`)
  return problems
}
