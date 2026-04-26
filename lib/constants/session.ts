/**
 * Database session statuses (PostgreSQL)
 */
export const SESSION_STATUS = {
  CLOSED: 'closed',
  OPENED: 'opened',
  STARTED: 'started',
  ARCHIVED: 'archived',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

/**
 * Real-time room statuses (Firebase RTDB)
 */
export const ROOM_STATUS = {
  WAITING: 'waiting',
  STARTED: 'started',
  ENDED: 'ended',
} as const;

export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS];
