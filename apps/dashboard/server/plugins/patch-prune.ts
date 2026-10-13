import { AUTO_PRUNE_AFTER_MS } from '../../shared/patch-cleanup'
import { pruneDisposablePatches } from '../utils/patch-service'

/** 처리가 끝난 지 7일이 지난 패치를 서버 시작 시와 이후 1시간마다 자동으로 삭제한다 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

export default defineNitroPlugin((): void => {
  const prune = async (): Promise<void> => {
    try {
      const deleted = await pruneDisposablePatches({ olderThanMs: AUTO_PRUNE_AFTER_MS })
      if (deleted > 0) console.info(`[inspector-agent] 처리된 지 7일이 지난 패치 ${deleted}개를 자동 삭제했습니다.`)
    } catch (error) {
      console.warn('[inspector-agent] 오래된 패치 자동 삭제에 실패했습니다.', error)
    }
  }
  void prune()
  setInterval((): void => void prune(), CHECK_INTERVAL_MS).unref()
})
