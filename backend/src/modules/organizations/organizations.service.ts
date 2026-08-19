import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { OrganizationRole } from '../../generated/prisma/client';
import { MembershipService } from '../../common/services/membership.service';
import { generateSlug } from '../../common/utils/slug.util';
import {
  getSkipTake,
  paginatedResult,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma';
import {
  AddOrganizationMemberDto,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  UpdateOrganizationMemberDto,
} from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const baseSlug = generateSlug(dto.name);
    const slug = await this.uniqueSlug(baseSlug);

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          slug,
          createdById: userId,
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId,
          role: OrganizationRole.OWNER,
        },
      });

      return organization;
    });
  }

  async findAllForUser(userId: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = getSkipTake(page, limit);

    const where = { members: { some: { userId } } };

    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return paginatedResult(items, total, p, l);
  }

  async findOne(userId: string, organizationId: string) {
    await this.membership.assertOrgMember(userId, organizationId);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }

  async update(
    userId: string,
    organizationId: string,
    dto: UpdateOrganizationDto,
  ) {
    await this.membership.assertOrgRole(userId, organizationId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    const data: { name?: string; slug?: string } = {};
    if (dto.name) {
      data.name = dto.name;
      data.slug = await this.uniqueSlug(generateSlug(dto.name), organizationId);
    }

    return this.prisma.organization.update({
      where: { id: organizationId },
      data,
    });
  }

  async remove(userId: string, organizationId: string) {
    await this.membership.assertOrgRole(userId, organizationId, [
      OrganizationRole.OWNER,
    ]);

    await this.prisma.organization.delete({ where: { id: organizationId } });
    return { success: true };
  }

  async listMembers(userId: string, organizationId: string) {
    await this.membership.assertOrgMember(userId, organizationId);

    return this.prisma.organizationMember.findMany({
      where: { organizationId },
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
    organizationId: string,
    dto: AddOrganizationMemberDto,
  ) {
    await this.membership.assertOrgRole(actorId, organizationId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.membership.getOrgMembership(
      user.id,
      organizationId,
    );
    if (existing) {
      throw new ConflictException('User is already a member');
    }

    return this.prisma.organizationMember.create({
      data: {
        organizationId,
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
    organizationId: string,
    targetUserId: string,
    dto: UpdateOrganizationMemberDto,
  ) {
    const actor = await this.membership.assertOrgRole(
      actorId,
      organizationId,
      [OrganizationRole.OWNER, OrganizationRole.ADMIN],
    );

    const target = await this.membership.getOrgMembership(
      targetUserId,
      organizationId,
    );
    if (!target) {
      throw new NotFoundException('Member not found');
    }

    if (target.role === OrganizationRole.OWNER && actor.role !== OrganizationRole.OWNER) {
      throw new ForbiddenException('Only owner can change owner role');
    }

    if (dto.role === OrganizationRole.OWNER && actor.role !== OrganizationRole.OWNER) {
      throw new ForbiddenException('Only owner can transfer ownership');
    }

    if (
      target.role === OrganizationRole.OWNER &&
      dto.role !== OrganizationRole.OWNER
    ) {
      const owners = await this.prisma.organizationMember.count({
        where: { organizationId, role: OrganizationRole.OWNER },
      });
      if (owners <= 1) {
        throw new BadRequestException('Organization must keep at least one owner');
      }
    }

    return this.prisma.organizationMember.update({
      where: { id: target.id },
      data: { role: dto.role },
    });
  }

  async removeMember(
    actorId: string,
    organizationId: string,
    targetUserId: string,
  ) {
    const actor = await this.membership.assertOrgRole(
      actorId,
      organizationId,
      [OrganizationRole.OWNER, OrganizationRole.ADMIN],
    );

    const target = await this.membership.getOrgMembership(
      targetUserId,
      organizationId,
    );
    if (!target) {
      throw new NotFoundException('Member not found');
    }

    if (target.role === OrganizationRole.OWNER) {
      if (actor.role !== OrganizationRole.OWNER) {
        throw new ForbiddenException('Only owner can remove an owner');
      }
      const owners = await this.prisma.organizationMember.count({
        where: { organizationId, role: OrganizationRole.OWNER },
      });
      if (owners <= 1) {
        throw new BadRequestException('Organization must keep at least one owner');
      }
    }

    await this.prisma.organizationMember.delete({ where: { id: target.id } });
    return { success: true };
  }

  private async uniqueSlug(base: string, excludeId?: string) {
    let slug = base || 'org';
    let i = 0;

    while (true) {
      const candidate = i === 0 ? slug : `${slug}-${i}`;
      const existing = await this.prisma.organization.findUnique({
        where: { slug: candidate },
      });
      if (!existing || existing.id === excludeId) {
        return candidate;
      }
      i += 1;
    }
  }
}
