import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { HealthModule } from './health/health.module';
import { ConfigModule } from '@nestjs/config';
import { configuration, validationSchema } from './config';
import { PrismaModule } from './prisma';



@Module({
  imports: [
    AuthModule, UsersModule, OrganizationsModule, WorkspacesModule, HealthModule,

    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    PrismaModule,
    
  ],

})
export class AppModule {}
