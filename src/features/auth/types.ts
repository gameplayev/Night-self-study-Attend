import type { StudentAccess } from '../../services/appService';

export interface PendingRegistration {
  readonly access: StudentAccess;
}
