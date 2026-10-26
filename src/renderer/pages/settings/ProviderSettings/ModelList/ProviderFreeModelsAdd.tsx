import { Gift } from 'lucide-react'
import type React from 'react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, NormalTooltip } from '@cherrystudio/ui'
import { toast } from '@renderer/services/toast'
import type { Model } from '@shared/data/types/model'

import { modelListClasses } from '../primitives/ProviderSettingsPrimitives'
import { useProviderModelPullReconcile } from './useProviderModelPullReconcile'

/** OpenRouter serves the zero-cost variant of a model under a `:free` id suffix. */
export function isOpenRouterFreeModel(model: Pick<Model, 'apiModelId'>): boolean {
  return model.apiModelId?.endsWith(':free') ?? false
}

interface ProviderFreeModelsAddProps {
  providerId: string
  disabled: boolean
}

/** Adds every free model the provider currently lists that is not saved yet, in one click. */
const ProviderFreeModelsAdd: React.FC<ProviderFreeModelsAddProps> = ({ providerId, disabled }) => {
  const { t } = useTranslation()
  const { reloadModels, addModels, localModels, isBusy } = useProviderModelPullReconcile(providerId)
  const [isAdding, setIsAdding] = useState(false)
  const label = t('settings.models.toolbar.add_free_models')

  const addFreeModels = useCallback(async () => {
    setIsAdding(true)
    try {
      const result = await reloadModels()
      if (!result) return
      if (result.error) {
        toast.error(t('settings.models.manage.sync_pull_failed'))
        return
      }

      const savedIds = new Set(localModels.map((model) => model.id))
      const missing = result.models.filter((model) => isOpenRouterFreeModel(model) && !savedIds.has(model.id))
      if (missing.length === 0) {
        toast.info(t('settings.models.manage.add_free_models_none'))
        return
      }

      const added = await addModels(missing)
      if (added === missing.length) {
        toast.success(t('settings.models.manage.add_free_models_success', { count: added }))
      }
    } finally {
      setIsAdding(false)
    }
  }, [addModels, localModels, reloadModels, t])

  return (
    <NormalTooltip content={label}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className={modelListClasses.addModelIconButton}
        disabled={disabled || isBusy || isAdding}
        loading={isAdding}
        aria-label={label}
        onClick={() => void addFreeModels()}>
        {isAdding ? null : <Gift className={modelListClasses.toolbarDesignIcon} />}
      </Button>
    </NormalTooltip>
  )
}

export default ProviderFreeModelsAdd
