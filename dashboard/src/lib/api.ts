export type Login = { token: string; user: { email: string; role: string } };
export type Device = { id: string; deviceUid: string; product: string; hardwareVersion: string; currentFirmware?: string; targetFirmware?: string; lastSeen?: string; otaStatus: string; deploymentStatus?: string; deploymentName?: string; deploymentStartedAt?: string; deploymentFinishedAt?: string; deploymentElapsedSeconds?: number };
export type Firmware = { id: string; product: string; hardwareVersion: string; version: string; fileSize: number; sha256: string; status: 'DRAFT' | 'READY' | 'ARCHIVED'; releaseNotes: string };
export type Deployment = { id: string; name: string; status: string; firmwareVersion: string; targetCount: number; successCount: number; failedCount: number };
export type Overview = { deviceCount: number; activeDeployments: number; recentDevices: number; failedUpdates: number };

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string; message?: string }; throw new Error(body.error ?? body.message ?? 'Request failed.'); }
  return response.json() as Promise<T>;
}
export const cp = {
  overview: (token: string) => api<Overview>('/api/overview', token), devices: (token: string) => api<Device[]>('/api/devices', token), firmware: (token: string) => api<Firmware[]>('/api/firmware', token), deployments: (token: string) => api<Deployment[]>('/api/deployments', token),
  device: (token: string, body: object) => api<Device>('/api/devices', token, { method: 'POST', body: JSON.stringify(body) }),
  deleteDevice: (token: string, id: string) => api<{ deleted: true; deviceUid: string }>(`/api/devices/${id}`, token, { method: 'DELETE' }),
  firmwareUpload: async (token: string, body: FormData) => {
    const response = await fetch('/api/firmware/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string }; throw new Error(result.error ?? 'Firmware upload failed.'); }
    return response.json() as Promise<Firmware>;
  },
  deleteFirmware: (token: string, id: string) => api<{ deleted: true }>(`/api/firmware/${id}`, token, { method: 'DELETE' }),
  deleteDeployment: (token: string, id: string) => api<{ deleted: true }>(`/api/deployments/${id}`, token, { method: 'DELETE' }),
  ready: (token: string, id: string) => api(`/api/firmware/${id}/status`, token, { method: 'PATCH', body: JSON.stringify({ status: 'READY' }) }), deployment: (token: string, body: object) => api('/api/deployments', token, { method: 'POST', body: JSON.stringify(body) }), startDeployment: (token: string, id: string) => api(`/api/deployments/${id}/start`, token, { method: 'POST' })
};
