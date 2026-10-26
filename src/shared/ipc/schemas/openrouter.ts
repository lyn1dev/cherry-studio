import * as z from 'zod'

import { defineRoute } from '../define'

/**
 * OpenRouter IPC schemas — read-only usage of the configured OpenRouter API key,
 * shown beside the chat composer while an OpenRouter model is selected.
 */
const openRouterKeyUsageSchema = z.object({
  /** Free-model (`:free`) requests in the current UTC day, or null when OpenRouter omits the counter. */
  freeModelRequests: z.object({ used: z.number(), limit: z.number() }).nullable(),
  /** Credits (USD) spent with this key in the current UTC day. */
  usageDaily: z.number(),
  /** Credit cap set on the key; null when the key is uncapped. */
  limit: z.number().nullable(),
  /** Credits left under that cap; null when the key is uncapped. */
  limitRemaining: z.number().nullable()
})

export type OpenRouterKeyUsage = z.infer<typeof openRouterKeyUsageSchema>

export const openrouterRequestSchemas = {
  /** Null when no enabled OpenRouter API key is configured. */
  'openrouter.get_key_usage': defineRoute({ input: z.void(), output: openRouterKeyUsageSchema.nullable() })
}
