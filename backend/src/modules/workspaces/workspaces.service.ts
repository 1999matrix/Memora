import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  OrganizationRole,
  WorkspaceRole,
} from '../../generated/prisma/client';
import { MembershipService } from '../../common/services/membership.service';
import {
  getSkipTake,
  paginatedResult,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma';
import {
  AddWorkspaceMemberDto,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  UpdateWorkspaceMemberDto,
} from './dto/workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    await this.membership.assertOrgRole(userId, dto.organizationId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: dto.name,
          description: dto.description,
          organizationId: dto.organizationId,
          createdById: userId,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: WorkspaceRole.ADMIN,
        },
      });

      return workspace;
    });
  }

  async findAllForUser(userId: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = getSkipTake(page, limit);
    const where = { members: { some: { userId } } };

    const [items, total] = await Promise.all([
      this.prisma.workspace.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workspace.count({ where }),
    ]);

    return paginatedResult(items, total, p, l);
  }

  async findOne(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  async update(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    await this.membership.assertWorkspaceRole(userId, workspaceId, [
      WorkspaceRole.ADMIN,
    ]);

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async remove(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceRole(userId, workspaceId, [
      WorkspaceRole.ADMIN,
    ]);
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
    return { success: true };
  }

  async listMembers(userId: string, workspaceId: string) {
    await this.membership.assertWorkspaceMember(userId, workspaceId);

    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(
    actorId: string,
    workspaceId: string,
    dto: AddWorkspaceMemberDto,
  ) {
    const membership = await this.membership.assertWorkspaceRole(
      actorId,
      workspaceId,
      [WorkspaceRole.ADMIN],
    );

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Workspace members must belong to the parent organization
    await this.membership.assertOrgMember(
      user.id,
      membership.workspace.organizationId,
    );

    const existing = await this.membership.getWorkspaceMembership(
      user.id,
      workspaceId,
    );
    if (existing) {
      throw new ConflictException('User is already a workspace member');
    }

    return this.prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: user.id,
        role: dto.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async updateMember(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    dto: UpdateWorkspaceMemberDto,
  ) {
    await this.membership.assertWorkspaceRole(actorId, workspaceId, [
      WorkspaceRole.ADMIN,
    ]);

    const target = await this.membership.getWorkspaceMembership(
      targetUserId,
      workspaceId,
    );
    if (!target) {
      throw new NotFoundException('Member not found');
    }

    return this.prisma.workspaceMember.update({
      where: { id: target.id },
      data: { role: dto.role },
    });
  }

  async removeMember(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
  ) {
    await this.membership.assertWorkspaceRole(actorId, workspaceId, [
      WorkspaceRole.ADMIN,
    ]);

    const target = await this.membership.getWorkspaceMembership(
      targetUserId,
      workspaceId,
    );
    if (!target) {
      throw new NotFoundException('Member not found');
    }

    await this.prisma.workspaceMember.delete({ where: { id: target.id } });
    return { success: true };
  }
}
