import type { Stats } from '../../shared/types/inspector'
import { withEngine } from '../utils/engine'

export default defineEventHandler((): Promise<Stats> => withEngine((engine) => engine.getStats()))
