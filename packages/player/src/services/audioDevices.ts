import { invoke } from '@tauri-apps/api/core';

export type SinkInfo = {
  name: string;
  description: string;
  is_default: boolean;
};

export type ProfileInfo = {
  name: string;
  description: string;
  available: boolean;
};

export type BluetoothInfo = {
  card_name: string;
  active_profile: string;
  active_codec: string;
  profiles: ProfileInfo[];
};

export const listSinks = (): Promise<SinkInfo[]> =>
  invoke<SinkInfo[]>('audio_list_sinks');

export const setDefaultSink = (name: string): Promise<void> =>
  invoke('audio_set_default_sink', { name });

export const getBluetooth = (): Promise<BluetoothInfo | null> =>
  invoke<BluetoothInfo | null>('audio_get_bluetooth');

export const setCardProfile = (card: string, profile: string): Promise<void> =>
  invoke('audio_set_card_profile', { card, profile });
