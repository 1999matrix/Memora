jest.mock('../../prisma', () => ({
  PrismaService: class PrismaService {},
}));

import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { OrganizationRole } from '../enums/organization-role.enum';
import { PrismaService } from '../../prisma';
import { MembershipService } from './membership.service';

describe('MembershipService tenant isolation', () => {
  let service: MembershipService;
  let prisma: {
    organizationMember: { findUnique: jest.Mock };
    workspaceMember: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      organizationMember: { findUnique: jest.fn() },
      workspaceMember: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MembershipService);
  });

  it('hides foreign organization as not found', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(
      service.assertOrgMember('user-a', 'org-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects insufficient organization role', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.MEMBER,
    });

    await expect(
      service.assertOrgRole('user-a', 'org-a', [OrganizationRole.OWNER]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides foreign workspace as not found', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(
      service.assertWorkspaceMember('user-a', 'ws-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
