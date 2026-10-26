import { describe, expect, it } from 'vitest'

import { MODALITY, MODEL_CAPABILITY } from '@shared/data/types/model'

import { parseOpenRouterModelMetadata } from '../openrouter'

// Shape of an entry in OpenRouter's GET /api/v1/models response.
const visionToolModel = {
  id: 'nvidia/nemotron-3.5-super-vl:free',
  name: 'NVIDIA: Nemotron 3.5 Super VL (free)',
  description: 'A multimodal reasoning model.',
  context_length: 1_000_000,
  architecture: {
    modality: 'text+image+video->text',
    input_modalities: ['text', 'image', 'video'],
    output_modalities: ['text']
  },
  pricing: { prompt: '0', completion: '0' },
  top_provider: { context_length: 1_000_000, max_completion_tokens: 131_072, is_moderated: false },
  supported_parameters: [
    'include_reasoning',
    'max_tokens',
    'reasoning',
    'response_format',
    'structured_outputs',
    'tools'
  ]
}

describe('parseOpenRouterModelMetadata', () => {
  it('maps tool, reasoning, structured-output and input support from the listing entry', () => {
    expect(parseOpenRouterModelMetadata(visionToolModel)).toEqual({
      capabilities: [
        MODEL_CAPABILITY.FUNCTION_CALL,
        MODEL_CAPABILITY.REASONING,
        MODEL_CAPABILITY.STRUCTURED_OUTPUT,
        MODEL_CAPABILITY.IMAGE_RECOGNITION,
        MODEL_CAPABILITY.VIDEO_RECOGNITION
      ],
      description: 'A multimodal reasoning model.',
      inputModalities: [MODALITY.TEXT, MODALITY.IMAGE, MODALITY.VIDEO],
      outputModalities: [MODALITY.TEXT],
      contextWindow: 1_000_000,
      maxOutputTokens: 131_072,
      pricing: { input: { perMillionTokens: 0, currency: 'USD' }, output: { perMillionTokens: 0, currency: 'USD' } }
    })
  })

  it('converts per-token USD prices to per-million prices, including cache prices', () => {
    const { pricing } = parseOpenRouterModelMetadata({
      ...visionToolModel,
      pricing: {
        prompt: '0.000003',
        completion: '0.000015',
        input_cache_read: '0.0000003',
        input_cache_write: '0.00000375'
      }
    })

    expect(pricing).toEqual({
      input: { perMillionTokens: 3, currency: 'USD' },
      output: { perMillionTokens: 15, currency: 'USD' },
      cacheRead: { perMillionTokens: 0.3, currency: 'USD' },
      cacheWrite: { perMillionTokens: 3.75, currency: 'USD' }
    })
  })

  it('omits pricing for router models whose price varies per request', () => {
    expect(
      parseOpenRouterModelMetadata({ ...visionToolModel, pricing: { prompt: '-1', completion: '-1' } })
    ).not.toHaveProperty('pricing')
  })

  it('marks entries from the embeddings catalog as embedding models', () => {
    const metadata = parseOpenRouterModelMetadata({
      id: 'nvidia/nemotron-3.5-embed-1b:free',
      context_length: 32_768,
      architecture: { input_modalities: ['text'], output_modalities: ['embeddings'] },
      top_provider: { max_completion_tokens: null },
      supported_parameters: []
    })

    expect(metadata.capabilities).toEqual([MODEL_CAPABILITY.EMBEDDING])
    expect(metadata.outputModalities).toEqual([MODALITY.VECTOR])
    expect(metadata).not.toHaveProperty('maxOutputTokens')
  })

  it('returns no metadata for a malformed entry instead of failing the whole listing', () => {
    expect(parseOpenRouterModelMetadata({ id: 'acme/model', supported_parameters: 'tools' })).toEqual({})
  })
})
