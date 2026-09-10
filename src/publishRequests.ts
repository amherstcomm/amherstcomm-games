// Asking the publish host to regenerate a day.
//
// The browser cannot run the generator -- it lives on the VM, next to the
// database, because a hosted runner cannot reach it and a page certainly
// cannot. So the button files a request and the VM's minute timer picks it up
// (ops/drain-publish-requests.sh), runs the same routine the nightly window
// and ops/publish-day.sh run, and writes back how it went. This module is the
// page's half: file one, and read what has become of them.
import { supabase } from '@/supabase';

export type PublishState = 'waiting' | 'running' | 'done' | 'failed';

export type PublishRequest = {
  id: string;
  on_date: string;
  force: boolean;
  state: PublishState;
  /** what the publish host said: the theme it used, or why it failed */
  note: string | null;
  requested_at: string;
  finished_at: string | null;
};

/** File a request. `force` is for a day that has already started, and the
 *  server refuses one without it for the same reason the command does. */
export async function requestPublish(
  date: string,
  force = false
): Promise<{ ok: boolean; reason?: string; id?: string; again?: boolean }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('request_publish', { p_date: date, p_force: force });
  if (error) return { ok: false, reason: error.message };
  const res = (data ?? {}) as { ok?: boolean; reason?: string; id?: string; again?: boolean };
  return { ok: res.ok === true, reason: res.reason, id: res.id, again: res.again === true };
}

/** The most recent requests, newest first, for the page to show what it is
 *  waiting on and how the last ones went. */
export async function readPublishRequests(): Promise<{
  ok: boolean;
  reason?: string;
  requests: PublishRequest[];
}> {
  if (!supabase) return { ok: false, reason: 'not connected', requests: [] };
  const { data, error } = await supabase.rpc('publish_requests_sheet');
  if (error) return { ok: false, reason: error.message, requests: [] };
  const res = (data ?? {}) as { ok?: boolean; reason?: string; requests?: PublishRequest[] };
  return { ok: res.ok === true, reason: res.reason, requests: res.requests ?? [] };
}

/** How a request reads on the page. Waiting says how the page knows it is not
 *  stuck: the host looks once a minute. */
export function describeRequest(r: PublishRequest): string {
  switch (r.state) {
    case 'waiting':
      return 'waiting — the publish host looks once a minute';
    case 'running':
      return 'publishing now';
    case 'done':
      return r.note ?? 'published';
    case 'failed':
      return `failed — ${r.note ?? 'no reason given'}`;
  }
}
