import type { IncomingMessage, ServerResponse } from 'node:http';
export function apiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
  options?: {
    maxBodyBytes?: number;
    allowLocalProviders?: boolean;
    publicOrigin?: string;
    proxyToken?: string;
    handlers?: ((input: any) => Promise<Response | null>)[];
  },
): Promise<boolean>;
