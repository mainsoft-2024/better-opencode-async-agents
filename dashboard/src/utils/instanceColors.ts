import type { InstanceInfo } from '../types';

export const INSTANCE_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

export function assignInstanceColor(index: number): string {
  return INSTANCE_COLORS[index % INSTANCE_COLORS.length];
}

export function getInstanceColor(
  instanceId: string,
  instancesById: Record<string, InstanceInfo>
): string {
  return instancesById[instanceId]?.color ?? '#6B7280';
}