import { createContext, useContext } from 'react';

export interface PlayerControls {
  seek: (seconds: number, play?: boolean) => void;
}
export const PlayerControlsContext = createContext<PlayerControls>({ seek: () => undefined });
export const PlayerTimeContext = createContext<number>(0);

export const usePlayer = () => useContext(PlayerControlsContext);
export const usePlayerTime = () => useContext(PlayerTimeContext);
