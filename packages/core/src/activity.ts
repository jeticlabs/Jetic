import * as fs from 'fs';
import * as path from 'path';
import { ensureDirSync } from './filesystem';

export interface ActivityEvent {
  ts: string;
  kind: 'endpoint_added' | 'endpoint_removed' | 'schema_changed';
  endpointId: string;
  detail?: string;
}

/** Appends one event as a line to `.jetic/activity/activity.ndjson` (project.md §37). */
export function appendActivityEvent(jeticDir: string, event: Omit<ActivityEvent, 'ts'>): void {
  const activityPath = path.join(jeticDir, 'activity', 'activity.ndjson');
  ensureDirSync(path.dirname(activityPath));
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  fs.appendFileSync(activityPath, line + '\n', 'utf-8');
}

export function readActivityEvents(jeticDir: string): ActivityEvent[] {
  const activityPath = path.join(jeticDir, 'activity', 'activity.ndjson');
  if (!fs.existsSync(activityPath)) return [];
  return fs
    .readFileSync(activityPath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ActivityEvent);
}
