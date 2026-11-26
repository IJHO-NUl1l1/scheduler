import type { PlannerApi } from '@shared/api';

declare global {
  interface Window {
    planner: PlannerApi;
  }
}
export {};
