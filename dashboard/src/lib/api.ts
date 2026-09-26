export type Login = { token: string; user: { email: string; role: string } };
export type Device = { id: string; deviceUid: string; product: string; hardwareVersion: string; flashSizeMb?: number; currentFirmware?: string; targetFirmware?: string; lastSeen?: string; connectionStatus: 'ONLINE' | 'OFFLINE'; otaStatus: string; faultActive?: boolean; faults?: string[]; faultUpdatedAt?: string; deploymentStatus?: string; deploymentName?: string; deploymentStartedAt?: string; deploymentFinishedAt?: string; deploymentElapsedSeconds?: number };
export type Firmware = { id: string; product: string; hardwareVersion: string; flashSizeMb: number; version: string; fileSize: number; sha256: string; status: 'DRAFT' | 'READY' | 'ARCHIVED'; releaseNotes: string };
export type Deployment = { id: string; name: string; status: string; firmwareVersion: string; targetCount: number; successCount: number; failedCount: number; activeCount: number; lastProgressAt?: string };
export type Overview = { deviceCount: number; activeDeployments: number; recentDevices: number; failedUpdates: number };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

// Empty keeps the existing same-origin /api behaviour for Docker and local dev.
// Set VITE_API_BASE_URL=https://api.example.com when building for Cloudflare.
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string; message?: string }; throw new ApiError(body.error ?? body.message ?? 'Request failed.', response.status); }
  return response.json() as Promise<T>;
}
export const cp = {
  overview: (token: string) => api<Overview>('/api/overview', token), devices: (token: string) => api<Device[]>('/api/devices', token), deviceByUid: (token: string, deviceUid: string) => api<Device>(`/api/devices/by-uid/${encodeURIComponent(deviceUid)}`, token), firmware: (token: string) => api<Firmware[]>('/api/firmware', token), deployments: (token: string) => api<Deployment[]>('/api/deployments', token),
  device: (token: string, body: object) => api<Device>('/api/devices', token, { method: 'POST', body: JSON.stringify(body) }),
  deleteDevice: (token: string, id: string) => api<{ deleted: true; deviceUid: string }>(`/api/devices/${id}`, token, { method: 'DELETE' }),
  firmwareUpload: async (token: string, body: FormData) => {
    const response = await fetch(apiUrl('/api/firmware/upload'), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string }; throw new ApiError(result.error ?? 'Firmware upload failed.', response.status); }
    return response.json() as Promise<Firmware>;
  },
  redeploy: (token: string, id: string) => api<{ id: string; status: string }>(`/api/deployments/${id}/redeploy`, token, { method: 'POST' }),
  deleteFirmware: (token: string, id: string) => api<{ deleted: true }>(`/api/firmware/${id}`, token, { method: 'DELETE' }),
  deleteDeployment: (token: string, id: string) => api<{ deleted: true }>(`/api/deployments/${id}`, token, { method: 'DELETE' }),
  setDeploymentStatus: (token: string, id: string, status: string) => api<{ id: string; status: string }>(`/api/deployments/${id}/status`, token, { method: 'PATCH', body: JSON.stringify({ status }) }),
  ready: (token: string, id: string) => api(`/api/firmware/${id}/status`, token, { method: 'PATCH', body: JSON.stringify({ status: 'READY' }) }), deployment: (token: string, body: object) => api('/api/deployments', token, { method: 'POST', body: JSON.stringify(body) }), startDeployment: (token: string, id: string) => api(`/api/deployments/${id}/start`, token, { method: 'POST' })
};

export function subscribeToDeviceEvents(token: string, onDeviceChanged: (deviceUid: string) => void) {
  const controller = new AbortController();
  void (async () => {
    while (!controller.signal.aborted) {
      try {
      const response = await fetch(apiUrl('/api/device-events'), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error('Live device stream is unavailable.');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read(); if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true }); let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            if (!event.startsWith('event: device.changed')) continue;
            const data = event.split('\n').find(line => line.startsWith('data: '))?.slice(6);
            if (!data) continue;
            const value = JSON.parse(data) as { deviceUid?: string }; if (value.deviceUid) onDeviceChanged(value.deviceUid);
          }
        }
      } catch (error) { if (!controller.signal.aborted) console.warn('Live device stream disconnected; retrying.', error); }
      if (!controller.signal.aborted) await new Promise(resolve => window.setTimeout(resolve, 3_000));
    }
  })();
  return () => controller.abort();
}
