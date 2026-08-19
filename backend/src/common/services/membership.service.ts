import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrgMembership(userId: string, organizationId: string) {
    return this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
  }

  async assertOrgMember(userId: string, organizationId: string) {
    const membership = await this.getOrgMembership(userId, organizationId);
    if (!membership) {
      throw new NotFoundException('Organization not found');
    }
    return membership;
  }

  async assertOrgRole(
    userId: string,
    organizationId: string,
    allowed: readonly string[],
  ) {
    const membership = await this.assertOrgMember(userId, organizationId);
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException('Insufficient organization permissions');
    }
    return membership;
  }

  async getWorkspaceMembership(userId: string, workspaceId: string) {
    return this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
      include: { workspace: true },
    });
  }

  async assertWorkspaceMember(userId: string, workspaceId: string) {
    const membership = await this.getWorkspaceMembership(userId, workspaceId);
    if (!membership) {
      throw new NotFoundException('Workspace not found');
    }
    return membership;
  }

  async assertWorkspaceRole(
    userId: string,
    workspaceId: string,
    allowed: readonly string[],
  ) {
    const membership = await this.assertWorkspaceMember(userId, workspaceId);
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException('Insufficient workspace permissions');
    }
    return membership;
  }
}
