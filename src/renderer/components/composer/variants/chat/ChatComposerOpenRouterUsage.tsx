import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'

import { NormalTooltip } from '@cherrystudio/ui'
import { ContextUsageMeter } from '@renderer/components/chat/contextUsage'
import { ipcApi } from '@renderer/ipc'
import type { Model } from '@shared/data/types/model'
import type { OpenRouterKeyUsage } from '@shared/ipc/schemas/openrouter'
import { SystemProviderIds } from '@shared/utils/systemProviderId'

const REFRESH_INTERVAL_MS = 60_000
const MS_PER_MINUTE = 60_000

/** OpenRouter's daily counters reset at 00:00 UTC, independent of the viewer's time zone. */
export function getTimeUntilUtcMidnight(now: Date): { hours: number; minutes: number } {
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  const totalMinutes = Math.ceil((nextMidnight - now.getTime()) / MS_PER_MINUTE)
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

interface ChatComposerOpenRouterUsageProps {
  model?: Model
  isLoading: boolean
}

export function ChatComposerOpenRouterUsage({ model, isLoading }: ChatComposerOpenRouterUsageProps) {
  const { t } = useTranslation()
  const isOpenRouter = model?.providerId === SystemProviderIds.openrouter
  const { data: usage, mutate } = useSWR(
    isOpenRouter ? 'openrouter.get_key_usage' : null,
    () => ipcApi.request('openrouter.get_key_usage'),
    { refreshInterval: REFRESH_INTERVAL_MS, shouldRetryOnError: false }
  )

  // Refetch when a response finishes so the counts include the request just sent.
  useEffect(() => {
    if (isOpenRouter && !isLoading) void mutate()
  }, [isOpenRouter, isLoading, mutate])

  if (!isOpenRouter || !usage) return null

  const free = usage.freeModelRequests
  const percentage = free && free.limit > 0 ? (free.used / free.limit) * 100 : 0
  const label = t('chat.input.openrouter_usage.title')

  return (
    <NormalTooltip
      side="top"
      sideOffset={8}
      showArrow={false}
      contentProps={{
        className:
          'w-72 max-w-72 rounded-md border border-border bg-card p-3 text-card-foreground shadow-md dark:bg-card dark:text-card-foreground'
      }}
      content={<OpenRouterUsageSummary title={label} usage={usage} percentage={percentage} />}>
      <ContextUsageMeter label={label} percentage={percentage} />
    </NormalTooltip>
  )
}

function OpenRouterUsageSummary({
  title,
  usage,
  percentage
}: {
  title: string
  usage: OpenRouterKeyUsage
  percentage: number
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage
  const formatUsd = (amount: number) =>
    amount.toLocaleString(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
  const free = usage.freeModelRequests
  const reset = getTimeUntilUtcMidnight(new Date())

  return (
    <section className="space-y-3 text-xs">
      <h3 className="font-medium text-foreground">{title}</h3>
      {free ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground">{t('chat.input.openrouter_usage.free_requests')}</span>
            <span className="shrink-0 text-muted-foreground">
              {free.used.toLocaleString(locale)} / {free.limit.toLocaleString(locale)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-subtle">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, percentage)}%` }} />
          </div>
          <p className="text-muted-foreground">{t('chat.input.openrouter_usage.resets_in', reset)}</p>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground">{t('chat.input.openrouter_usage.spent_today')}</span>
        <span className="shrink-0 text-muted-foreground">{formatUsd(usage.usageDaily)}</span>
      </div>
      {usage.limit !== null && usage.limitRemaining !== null ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground">{t('chat.input.openrouter_usage.key_limit')}</span>
          <span className="shrink-0 text-muted-foreground">
            {t('chat.input.openrouter_usage.key_limit_value', {
              remaining: formatUsd(usage.limitRemaining),
              limit: formatUsd(usage.limit)
            })}
          </span>
        </div>
      ) : null}
    </section>
  )
}
