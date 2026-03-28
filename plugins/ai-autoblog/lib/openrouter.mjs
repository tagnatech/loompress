export async function requestStructuredJson({
  apiKey,
  model,
  schemaName,
  schema,
  messages,
  referer,
  title,
  temperature = 0.7,
  maxTokens,
  enableWebResearch = false,
}) {
  const payload = {
    model,
    messages,
    stream: false,
    temperature,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    },
    plugins: [
      ...(enableWebResearch ? [{ id: 'web' }] : []),
      { id: 'response-healing' },
    ],
    provider: {
      require_parameters: true,
    },
  };

  const result = await postOpenRouter({
    apiKey,
    payload,
    referer,
    title,
  });
  const content = extractMessageText(result);

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('OpenRouter returned malformed JSON for a structured response.');
  }
}

export async function requestGeneratedImage({
  apiKey,
  model,
  prompt,
  aspectRatio = '16:9',
  referer,
  title,
}) {
  const basePayload = {
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    image_config: {
      aspect_ratio: aspectRatio,
    },
    stream: false,
  };
  const attempts = [
    { ...basePayload, modalities: ['image'] },
    { ...basePayload, modalities: ['image', 'text'] },
  ];

  let lastError = null;

  for (const payload of attempts) {
    try {
      const result = await postOpenRouter({
        apiKey,
        payload,
        referer,
        title,
      });
      const imageUrl = extractImageUrl(result);
      if (!imageUrl) {
        throw new Error('OpenRouter did not return any image payload.');
      }

      return toBinaryImage(imageUrl);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter image generation failed.');
}

async function postOpenRouter({ apiKey, payload, referer, title }) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(referer ? { 'HTTP-Referer': referer } : {}),
      ...(title ? { 'X-Title': title } : {}),
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message
      || body?.message
      || `OpenRouter request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body;
}

function extractMessageText(result) {
  const message = result?.choices?.[0]?.message;
  if (!message) {
    throw new Error('OpenRouter returned no message content.');
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }
        if (part?.type === 'text') {
          return part.text ?? '';
        }
        return '';
      })
      .join('')
      .trim();
  }

  return JSON.stringify(message.content ?? '');
}

function extractImageUrl(result) {
  const message = result?.choices?.[0]?.message;
  const images = Array.isArray(message?.images) ? message.images : [];
  const firstImage = images[0];

  return firstImage?.image_url?.url
    || firstImage?.imageUrl?.url
    || null;
}

async function toBinaryImage(imageUrl) {
  if (imageUrl.startsWith('data:')) {
    return parseDataUrl(imageUrl);
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Unable to download generated image (${response.status}).`);
  }

  const mimeType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    mimeType,
    buffer,
  };
}

export function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Generated image returned an unsupported data URL.');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}
