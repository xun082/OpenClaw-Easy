// IPC Channel constants
export const IPC_CHANNELS = {
  PING: 'ping',
  GET_APP_VERSION: 'get-app-version',
  GET_PLATFORM: 'get-platform',
  GET_SYSTEM_INFO: 'get-system-info',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
