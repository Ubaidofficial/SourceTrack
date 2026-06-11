import 'dotenv/config'
import { enforceEnvironmentSafety } from './lib/environment-safety.js'

enforceEnvironmentSafety()

await import('./index.js')
