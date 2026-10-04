import { AuditLog, User, Organization } from '../models';

export interface RecordAuditParams {
  action: string;
  entityType: 'user' | 'organization' | 'drone' | 'mission' | string;
  entityId: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    organizationId?: string | null;
  } | null;
  organizationId?: string | null;
  organizationName?: string | null;
  details: string;
  previousState?: any;
  newState?: any;
}

/**
 * Rejestruje wpis w dzienniku zdarzeń (Audit Log)
 */
export const recordAuditLog = async (params: RecordAuditParams): Promise<AuditLog | null> => {
  try {
    let orgName = params.organizationName;
    let userName = params.user
      ? `${params.user.firstName || ''} ${params.user.lastName || ''}`.trim() || undefined
      : undefined;
    const userEmail = params.user?.email;
    const orgId = params.organizationId || params.user?.organizationId;

    if (!orgName && orgId) {
      try {
        const org = await Organization.findByPk(orgId);
        if (org) orgName = org.name;
      } catch (e) {
        // Ignoruj błąd pobierania organizacji
      }
    }

    const log = await AuditLog.create({
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.user?.id || null,
      userName: userName || null,
      userEmail: userEmail || null,
      organizationId: orgId || null,
      organizationName: orgName || null,
      details: params.details,
      previousState: params.previousState ? JSON.parse(JSON.stringify(params.previousState)) : null,
      newState: params.newState ? JSON.parse(JSON.stringify(params.newState)) : null,
      isReverted: false,
    });

    return log;
  } catch (error) {
    console.error('Błąd podczas zapisywania AuditLog:', error);
    return null;
  }
};
