import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma';
import { AuditService } from './services/audit.service';
import { MembershipService } from './services/membership.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MembershipService, AuditService],
  exports: [MembershipService, AuditService],
})
export class CommonModule {}
