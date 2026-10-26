import { net } from 'electron'
import * as z from 'zod'

import { providerService } from '@data/services/ProviderService'
import type { OpenRouterKeyUsage } from '@shared/ipc/schemas/openrouter'
import { SystemProviderIds } from '@shared/utils/systemProviderId'

const OPENROUTER_KEY_ENDPOINT = 'https://openrouter.ai/api/v1/key'

const KeyResponseSchema = z.object({
  data: z.object({
    usage_daily: z.number(),
    limit: z.number().nullable(),
    limit_remaining: z.number().nullable(),
    free_model_daily_requests: z.object({ used: z.number(), limit: z.number() }).optional()
  })
})

/**
 * Reads today's usage for the first enabled OpenRouter API key from `GET /api/v1/key`.
 * Uses `getApiKeys` rather than `resolveApiKey` so polling never advances key rotation.
 *
 * @returns null when no enabled OpenRouter API key is configured.
 */
export async function getOpenRouterKeyUsage(): Promise<OpenRouterKeyUsage | null> {
  const [apiKey] = providerService.getApiKeys(SystemProviderIds.openrouter, { enabled: true })
  if (!apiKey) return null

  const response = await net.fetch(OPENROUTER_KEY_ENDPOINT, { headers: { Authorization: `Bearer ${apiKey.key}` } })
  if (!response.ok) {
    throw new Error(`OpenRouter key usage request failed: ${response.status} ${response.statusText}`)
  }

  const { data } = KeyResponseSchema.parse(await response.json())
  return {
    freeModelRequests: data.free_model_daily_requests ?? null,
    usageDaily: data.usage_daily,
    limit: data.limit,
    limitRemaining: data.limit_remaining
  }
}
