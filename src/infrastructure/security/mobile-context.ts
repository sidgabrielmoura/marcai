import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionData } from './session';
export const mobileSessionContext = new AsyncLocalStorage<SessionData>();
