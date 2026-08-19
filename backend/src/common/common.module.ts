import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma';
import { MembershipService } from './services/membership.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class CommonModule {}
