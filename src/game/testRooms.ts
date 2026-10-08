import type { TestRoomKind } from './types';

export const TEST_ROOM_CAPACITY = 99;

export interface TestRoomDefinition {
  kind: TestRoomKind;
  code: string;
  name: string;
  itemId: 'weather' | 'repair';
}

export const TEST_ROOMS: Record<TestRoomKind, TestRoomDefinition> = {
  weather: { kind: 'weather', code: '114514', name: '天气测试房', itemId: 'weather' },
  building: { kind: 'building', code: '350234', name: '建筑测试房', itemId: 'repair' },
};

export function getTestRoomByCode(code: string): TestRoomDefinition | undefined {
  return Object.values(TEST_ROOMS).find(room => room.code === code);
}

export function isTestRoomKind(value: unknown): value is TestRoomKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TEST_ROOMS, value);
}
