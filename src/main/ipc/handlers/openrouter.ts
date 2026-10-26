import { getOpenRouterKeyUsage } from '@main/ai/provider/openRouterKeyUsage'
import type { openrouterRequestSchemas } from '@shared/ipc/schemas/openrouter'
import type { IpcHandlersFor } from '@shared/ipc/types'

export const openrouterHandlers: IpcHandlersFor<typeof openrouterRequestSchemas> = {
  'openrouter.get_key_usage': () => getOpenRouterKeyUsage()
}
