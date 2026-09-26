import { prisma } from '../config/db';

export async function audit(actorId: string | null, action: string, target?: string, meta?: object) {
  await prisma.auditLog.create({ data: { actorId, action, target, meta } }).catch(() => undefined);
}
