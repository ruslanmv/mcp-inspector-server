export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface InspectorLogEvent {
  ts: string;
  level: LogLevel;
  event: string;
  targetUrl?: string;
  details?: unknown;
}

export class RingLogStore {
  private readonly events: InspectorLogEvent[] = [];

  constructor(private readonly maxEvents: number) {}

  add(event: Omit<InspectorLogEvent, 'ts'>): InspectorLogEvent {
    const entry: InspectorLogEvent = { ts: new Date().toISOString(), ...event };
    this.events.push(entry);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    return entry;
  }

  list(limit = 100, targetUrl?: string): InspectorLogEvent[] {
    const filtered = targetUrl ? this.events.filter((e) => e.targetUrl === targetUrl) : this.events;
    return filtered.slice(Math.max(0, filtered.length - limit)).reverse();
  }

  clear(): number {
    const count = this.events.length;
    this.events.length = 0;
    return count;
  }
}

export const listLogsSchema = {
  limit: { type: 'number', description: 'Maximum events to return. Default 100.' },
  targetUrl: { type: 'string', description: 'Optional target MCP endpoint filter.' }
} as const;
