export type Song = {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  requestedBy: string;
  clientId: string;
  addedAt: number;
};

export type QueueState = { current: Song | null; queue: Song[] };
export type PublicSong = Omit<Song, "clientId">;
export const publicSong = ({ clientId: _clientId, ...song }: Song): PublicSong => song;
export const emptyState = (): QueueState => ({ current: null, queue: [] });
