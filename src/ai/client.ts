import { markAuthenticationFailure, type ProviderSettings, type ProviderId } from './settings.ts';

export type RequestConfig = ProviderSettings & { model?: string; provider?: ProviderId };
export interface Attachment {
  mime: string;
  data: string;
}
export async function aiRequest<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/ai/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    const config = (body as { config?: RequestConfig })?.config;
    if ([401, 403].includes(response.status) && config?.provider)
      markAuthenticationFailure(config.provider, config.apiKey);
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data as T;
}
export async function generate(
  config: RequestConfig,
  operation: 'polish' | 'grammar' | 'semantic',
  input: string,
  options: {
    instructions?: string;
    attachments?: Attachment[];
    signal?: AbortSignal;
    onText?: (text: string) => void;
  } = {},
): Promise<string> {
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      operation,
      text: input,
      instructions: options.instructions,
      attachments: options.attachments,
      stream: true,
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    if ([401, 403].includes(response.status) && config.provider)
      markAuthenticationFailure(config.provider, config.apiKey);
    const data = await response.json();
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('服务商没有返回文字，请检查模型能力。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let done = false;
  const consume = (frame: string) => {
    for (const line of frame.split('\n'))
      if (line.startsWith('data:')) {
        const event = JSON.parse(line.slice(5));
        if (event.error) throw new Error(event.error);
        if (event.delta) {
          text += event.delta;
          options.onText?.(text);
        }
        if (event.done) done = true;
      }
  };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        consume(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!done) throw new Error('服务商中断了生成。');
    if (!text.trim()) throw new Error('服务商没有返回文字，请检查模型能力。');
    return text;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function fileAttachment(file: Blob): Promise<Attachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768)
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return { mime: file.type || 'application/pdf', data: btoa(binary) };
}
export function syntheticVision(): { attachment: Attachment; code: string } {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 120;
  const context = canvas.getContext('2d')!;
  const code = String((crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 360, 120);
  context.fillStyle = '#111';
  context.font = 'bold 64px monospace';
  context.fillText(code, 50, 82);
  return {
    attachment: { mime: 'image/png', data: canvas.toDataURL('image/png').split(',')[1] },
    code,
  };
}
