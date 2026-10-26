import * as z from 'zod'

import type { Modality, Model, ModelCapability, RuntimeModelPricing } from '@shared/data/types/model'
import { CURRENCY, MODALITY, MODEL_CAPABILITY } from '@shared/data/types/model'

/** The metadata fields OpenRouter's `/models`, `/embeddings/models` and `/images/models` entries carry. */
const OpenRouterModelMetadataSchema = z.looseObject({
  description: z.string().nullish(),
  context_length: z.number().nullish(),
  architecture: z
    .looseObject({
      input_modalities: z.array(z.string()).nullish(),
      output_modalities: z.array(z.string()).nullish()
    })
    .nullish(),
  top_provider: z.looseObject({ max_completion_tokens: z.number().nullish() }).nullish(),
  pricing: z
    .looseObject({
      prompt: z.string().nullish(),
      completion: z.string().nullish(),
      input_cache_read: z.string().nullish(),
      input_cache_write: z.string().nullish()
    })
    .nullish(),
  supported_parameters: z.array(z.string()).nullish()
})

const OPENROUTER_MODALITIES: Record<string, Modality> = {
  text: MODALITY.TEXT,
  image: MODALITY.IMAGE,
  audio: MODALITY.AUDIO,
  video: MODALITY.VIDEO,
  embeddings: MODALITY.VECTOR
}

function toModalities(values: readonly string[]): Modality[] {
  return values.flatMap((value) => (OPENROUTER_MODALITIES[value] ? [OPENROUTER_MODALITIES[value]] : []))
}

function positiveTokenLimit(value: number | null | undefined): number | undefined {
  return value != null && Number.isInteger(value) && value > 0 ? value : undefined
}

/** OpenRouter quotes USD per token as a string; `-1` marks router models whose price varies per request. */
function perMillionTokens(perToken: string | null | undefined): number | undefined {
  if (perToken == null) return undefined
  const value = Number(perToken)
  if (!Number.isFinite(value) || value < 0) return undefined
  return Math.round(value * 1e6 * 1e6) / 1e6
}

function toPricing(pricing: z.infer<typeof OpenRouterModelMetadataSchema>['pricing']): RuntimeModelPricing | undefined {
  const input = perMillionTokens(pricing?.prompt)
  const output = perMillionTokens(pricing?.completion)
  if (input === undefined || output === undefined) return undefined

  const cacheRead = perMillionTokens(pricing?.input_cache_read)
  const cacheWrite = perMillionTokens(pricing?.input_cache_write)
  const price = (amount: number) => ({ perMillionTokens: amount, currency: CURRENCY.USD })
  return {
    input: price(input),
    output: price(output),
    ...(cacheRead !== undefined ? { cacheRead: price(cacheRead) } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite: price(cacheWrite) } : {})
  }
}

/**
 * Maps an OpenRouter model-list entry to model fields, using the same capability rules as the
 * catalog generator's `parseOrEntry` (packages/provider-registry/scripts/upstream.ts) so listed
 * models the bundled catalog doesn't know yet arrive with the same metadata a catalog model has.
 * Unparseable metadata yields no fields rather than dropping the model.
 */
export function parseOpenRouterModelMetadata(raw: unknown): Partial<Model> {
  const parsed = OpenRouterModelMetadataSchema.safeParse(raw)
  if (!parsed.success) return {}

  const entry = parsed.data
  const parameters = entry.supported_parameters ?? []
  const input = entry.architecture?.input_modalities ?? []
  const output = entry.architecture?.output_modalities ?? []

  const capabilities = new Set<ModelCapability>()
  if (parameters.includes('tools')) capabilities.add(MODEL_CAPABILITY.FUNCTION_CALL)
  if (parameters.includes('reasoning')) capabilities.add(MODEL_CAPABILITY.REASONING)
  if (parameters.includes('structured_outputs') || parameters.includes('response_format')) {
    capabilities.add(MODEL_CAPABILITY.STRUCTURED_OUTPUT)
  }
  if (input.includes('image')) capabilities.add(MODEL_CAPABILITY.IMAGE_RECOGNITION)
  if (input.includes('audio')) capabilities.add(MODEL_CAPABILITY.AUDIO_RECOGNITION)
  if (input.includes('video')) capabilities.add(MODEL_CAPABILITY.VIDEO_RECOGNITION)
  if (input.includes('file')) capabilities.add(MODEL_CAPABILITY.FILE_INPUT)
  if (output.includes('image')) capabilities.add(MODEL_CAPABILITY.IMAGE_GENERATION)
  if (output.includes('audio')) capabilities.add(MODEL_CAPABILITY.AUDIO_GENERATION)
  if (output.includes('embeddings')) capabilities.add(MODEL_CAPABILITY.EMBEDDING)

  const inputModalities = toModalities(input)
  const outputModalities = toModalities(output)
  const contextWindow = positiveTokenLimit(entry.context_length)
  const maxOutputTokens = positiveTokenLimit(entry.top_provider?.max_completion_tokens)
  const pricing = toPricing(entry.pricing)

  return {
    capabilities: [...capabilities],
    ...(entry.description ? { description: entry.description } : {}),
    ...(inputModalities.length > 0 ? { inputModalities } : {}),
    ...(outputModalities.length > 0 ? { outputModalities } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    ...(pricing ? { pricing } : {})
  }
}
