import { beforeEach, describe, expect, it, vi } from 'vitest'

const { netFetchMock, getApiKeysMock } = vi.hoisted(() => ({ netFetchMock: vi.fn(), getApiKeysMock: vi.fn() }))

vi.mock('electron', () => ({ net: { fetch: netFetchMock } }))
vi.mock('@data/services/ProviderService', () => ({ providerService: { getApiKeys: getApiKeysMock } }))

import { getOpenRouterKeyUsage } from '../openRouterKeyUsage'

const keyDataWithoutFreeCounter = {
  label: 'sk-or-v1-abc...xyz',
  limit: 10,
  limit_remaining: 7.25,
  usage: 2.75,
  usage_daily: 0.0412,
  usage_weekly: 1.2,
  usage_monthly: 2.75,
  is_free_tier: false
}

const keyResponse = {
  data: { ...keyDataWithoutFreeCounter, free_model_daily_requests: { used: 12, limit: 1000, remaining: 988 } }
}

describe('getOpenRouterKeyUsage', () => {
  beforeEach(() => {
    netFetchMock.mockReset()
    getApiKeysMock.mockReset()
    getApiKeysMock.mockReturnValue([{ id: 'k1', key: 'sk-or-first', isEnabled: true }])
  })

  it('maps the key endpoint response and authenticates with the first enabled key', async () => {
    netFetchMock.mockResolvedValue(Response.json(keyResponse))

    await expect(getOpenRouterKeyUsage()).resolves.toEqual({
      freeModelRequests: { used: 12, limit: 1000 },
      usageDaily: 0.0412,
      limit: 10,
      limitRemaining: 7.25
    })
    expect(getApiKeysMock).toHaveBeenCalledWith('openrouter', { enabled: true })
    expect(netFetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: 'Bearer sk-or-first' }
    })
  })

  it('returns null without calling OpenRouter when no key is enabled', async () => {
    getApiKeysMock.mockReturnValue([])

    await expect(getOpenRouterKeyUsage()).resolves.toBeNull()
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it('reports no free-request counter when OpenRouter omits it', async () => {
    netFetchMock.mockResolvedValue(
      Response.json({ data: { ...keyDataWithoutFreeCounter, limit: null, limit_remaining: null } })
    )

    await expect(getOpenRouterKeyUsage()).resolves.toEqual({
      freeModelRequests: null,
      usageDaily: 0.0412,
      limit: null,
      limitRemaining: null
    })
  })

  it('rejects when OpenRouter refuses the key', async () => {
    netFetchMock.mockResolvedValue(new Response('{"error":"invalid key"}', { status: 401, statusText: 'Unauthorized' }))

    await expect(getOpenRouterKeyUsage()).rejects.toThrow('401 Unauthorized')
  })
})
