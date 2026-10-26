import { isEmpty } from 'es-toolkit/compat'

import { dataApiService } from '@data/DataApiService'
import { loggerService } from '@logger'
import { ipcApi } from '@renderer/ipc'
import type { CreateModelDto, UpdateModelDto } from '@shared/data/api/schemas/models'
import type { ConcreteApiPaths } from '@shared/data/api/types'
import {
  type EndpointType as RuntimeEndpointType,
  type ListedModels,
  type Model,
  parseUniqueModelId
} from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'
import { isNewApiProvider } from '@shared/utils/provider'

const logger = loggerService.withContext('ProviderModelSync')

export type ModelSyncErrorCode = 'NO_ENABLED_API_KEY'

export class ModelSyncError extends Error {
  constructor(
    message: string,
    public readonly code: ModelSyncErrorCode,
    public readonly meta?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ModelSyncError'
  }
}

type ProviderResolveModelsPath = Extract<ConcreteApiPaths, `/providers/${string}/models:resolve`>
type ModelSyncProviderEndpointSource = Pick<Provider, 'id' | 'presetProviderId' | 'defaultChatEndpoint'>

export function resolveCreateModelEndpointTypes(
  provider: ModelSyncProviderEndpointSource | null | undefined,
  model: Pick<Model, 'endpointTypes'>
): RuntimeEndpointType[] | undefined {
  if (model.endpointTypes?.length) {
    return [...model.endpointTypes]
  }

  if (!provider || !isNewApiProvider(provider as Provider)) {
    return undefined
  }

  return provider.defaultChatEndpoint ? [provider.defaultChatEndpoint] : undefined
}

function getRawModelId(model: Pick<Partial<Model>, 'apiModelId' | 'id'>): string {
  return model.apiModelId ?? (model.id ? parseUniqueModelId(model.id).modelId : '')
}

export function toCreateModelDto(
  providerId: string,
  model: Model,
  endpointTypes?: RuntimeEndpointType[]
): CreateModelDto {
  const modelId = getRawModelId(model)
  const resolvedEndpointTypes = endpointTypes?.length ? endpointTypes : model.endpointTypes
  // Catalog models take this metadata from their preset; only listing-only models need it stored.
  const listed = listingOnlyMetadata(model)

  return {
    providerId,
    modelId,
    name: model.name,
    group: model.group,
    ...listed,
    ...(resolvedEndpointTypes?.length ? { endpointTypes: [...resolvedEndpointTypes] } : {}),
    // Discovered rather than registry-supplied for local providers — Ollama's window comes from
    // `/api/show`, and dropping it here leaves the row without one, so no `num_ctx` is ever sent.
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {})
  }
}

type ListingMetadata = Pick<
  CreateModelDto,
  'description' | 'capabilities' | 'inputModalities' | 'outputModalities' | 'maxOutputTokens' | 'pricing'
>

/** The provider-listed metadata a model without a catalog preset keeps, or nothing for a catalog model. */
function listingOnlyMetadata(model: Model): ListingMetadata {
  if (model.presetModelId) return {}
  return {
    ...(model.description ? { description: model.description } : {}),
    ...(model.capabilities?.length ? { capabilities: [...model.capabilities] } : {}),
    ...(model.inputModalities?.length ? { inputModalities: [...model.inputModalities] } : {}),
    ...(model.outputModalities?.length ? { outputModalities: [...model.outputModalities] } : {}),
    ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    ...(model.pricing ? { pricing: model.pricing } : {})
  }
}

/**
 * Fields a provider listing can fill on an already-saved model that has no catalog preset,
 * limited to fields that are still empty so values the user set are never replaced.
 *
 * @returns null when the saved model is catalog-backed or nothing is missing.
 */
export function buildMissingListingMetadataPatch(saved: Model, listed: Model): UpdateModelDto | null {
  if (saved.presetModelId) return null
  const available: ListingMetadata & Pick<CreateModelDto, 'contextWindow'> = {
    ...listingOnlyMetadata(listed),
    ...(listed.contextWindow ? { contextWindow: listed.contextWindow } : {})
  }
  const patch: UpdateModelDto = {}
  if (available.description && !saved.description) patch.description = available.description
  if (available.capabilities && saved.capabilities.length === 0) patch.capabilities = available.capabilities
  if (available.inputModalities && !saved.inputModalities?.length) patch.inputModalities = available.inputModalities
  if (available.outputModalities && !saved.outputModalities?.length) patch.outputModalities = available.outputModalities
  if (available.contextWindow && !saved.contextWindow) patch.contextWindow = available.contextWindow
  if (available.maxOutputTokens && !saved.maxOutputTokens) patch.maxOutputTokens = available.maxOutputTokens
  if (available.pricing && !saved.pricing) patch.pricing = available.pricing
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * Enrich raw v2 models from `ipcApi.request('ai.provider.model.list', …)` with registry
 * metadata fetched via `/providers/:id/models:resolve`. The IPC already
 * returns v2 `Partial<Model>` (with `apiModelId`, `endpointTypes`, etc.)
 * — this layer overlays preset capabilities/limits/pricing that aren't
 * available from the upstream provider SDK.
 */
async function enrichFetchedModels(providerId: string, fetchedModels: Partial<Model>[]): Promise<Model[]> {
  const filteredModels = fetchedModels.filter((model) => !isEmpty(model.name))
  if (filteredModels.length === 0) {
    return []
  }

  const resolveModelsPath: ProviderResolveModelsPath = `/providers/${providerId}/models:resolve`
  const resolved = (await dataApiService.get(resolveModelsPath, {
    query: {
      ids: filteredModels.map((model) => model.apiModelId ?? '').filter(Boolean)
    }
  })) as Model[]

  const resolvedMap = new Map<string, Model>()
  for (const model of resolved) {
    const key = model.apiModelId ?? parseUniqueModelId(model.id).modelId
    if (!resolvedMap.has(key)) {
      resolvedMap.set(key, model)
    }
  }

  const REGISTRY_FIELDS = [
    'name',
    'presetModelId',
    'description',
    'group',
    'capabilities',
    'inputModalities',
    'outputModalities',
    'endpointTypes',
    'contextWindow',
    'maxOutputTokens',
    'maxInputTokens',
    'reasoning',
    'pricing',
    'family',
    'ownedBy'
  ] as const

  return filteredModels.map((fetched) => {
    const base = fetched as Model
    const apiId = fetched.apiModelId ?? ''
    // `resolveModels` keys every result by the exact raw id it was sent, so an exact lookup always hits —
    // no fuzzy fallback needed (a slash/dot-stripping fallback used to overlay siblings onto one canonical
    // row, collapsing their distinct display names).
    const registry = resolvedMap.get(apiId)

    if (!registry) {
      return base
    }

    const merged = { ...base }
    // Fetchers use the raw id when the API has no display name; only then use the registry name.
    const keepFetchedName = !!base.name && base.name !== base.apiModelId

    for (const field of REGISTRY_FIELDS) {
      if (field === 'endpointTypes' && base.endpointTypes?.length) {
        continue
      }
      if (field === 'name' && keepFetchedName) {
        continue
      }
      const value = registry[field]
      if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
        ;(merged as Record<string, unknown>)[field] = value
      }
    }

    return merged
  })
}

/**
 * Sync provider models: ask main to list upstream models (main reads keys
 * from DB), then enrich via the registry-resolve endpoint. `throwOnError`
 * surfaces upstream failures so the UI can show a real reason rather than
 * a silent empty list.
 */
export async function fetchResolvedProviderModels(providerId: string): Promise<ListedModels<Model>> {
  try {
    logger.info('Fetching provider models via IPC', { providerId })
    const { models: fetched, skippedModels } = await ipcApi.request('ai.provider.model.list', {
      providerId,
      throwOnError: true
    })
    logger.info('Fetched provider models', { providerId, fetchedModelCount: fetched.length })
    // Enrichment rebuilds the array, so the notice main reported alongside the
    // models is carried onto the result.
    const models = await enrichFetchedModels(providerId, fetched)
    return skippedModels ? { models, skippedModels } : { models }
  } catch (error) {
    logger.error('Failed to fetch and resolve provider models', {
      providerId,
      errorType: error instanceof Error ? error.name : typeof error
    })
    throw error
  }
}
