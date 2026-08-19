jest.mock('../../prisma', () => ({
  PrismaService: class PrismaService {},
}));

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { hashToken } from '../../common/utils/token.util';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<
    UsersService,
    | 'create'
    | 'validateCredentials'
    | 'touchLastLogin'
    | 'findById'
    | 'setRefreshTokenHash'
    | 'findSafeById'
  >>;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;

  const user = {
    id: 'user-1',
    email: 'a@example.com',
    firstName: 'A',
    lastName: 'B',
    role: 'USER',
    isActive: true,
    emailVerified: false,
    passwordHash: 'hash',
    refreshTokenHash: null as string | null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            validateCredentials: jest.fn(),
            touchLastLogin: jest.fn(),
            findById: jest.fn(),
            setRefreshTokenHash: jest.fn(),
            findSafeById: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) =>
              key.includes('Secret') ? 'secret' : 'value',
            ),
            get: jest.fn((key: string) =>
              key.includes('Expires') ? '15m' : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  it('registers and returns tokens', async () => {
    usersService.create.mockResolvedValue({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: true,
      emailVerified: false,
      lastLoginAt: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });

    const result = await service.register({
      email: user.email,
      password: 'password1',
      firstName: 'A',
      lastName: 'B',
    });

    expect(result.accessToken).toBe('token');
    expect(result.refreshToken).toBe('token');
    expect(usersService.setRefreshTokenHash).toHaveBeenCalled();
  });

  it('rejects invalid refresh token hash', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    usersService.findById.mockResolvedValue({
      ...user,
      refreshTokenHash: hashToken('other'),
    } as never);

    await expect(service.refresh('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('surfaces duplicate email conflicts from users service', async () => {
    usersService.create.mockRejectedValue(
      new ConflictException('Email already registered'),
    );

    await expect(
      service.register({
        email: user.email,
        password: 'password1',
        firstName: 'A',
        lastName: 'B',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
