import type { Engine } from './engine';
import { DemoEngine } from './demoEngine';
import { SupabaseEngine } from './supabaseEngine';
import type { BackendMode } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isLiveConfigured = Boolean(url && anonKey && url.startsWith('http'));
export const backendMode: BackendMode = isLiveConfigured ? 'live' : 'demo';

export const engine: Engine = isLiveConfigured
  ? new SupabaseEngine(url!, anonKey!)
  : new DemoEngine();
