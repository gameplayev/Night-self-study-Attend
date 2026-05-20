import { StudentAccess } from '../../services/appService';

export interface PendingRegistration {
  studentNumber: string;
  name: string;
  access: StudentAccess;
}
