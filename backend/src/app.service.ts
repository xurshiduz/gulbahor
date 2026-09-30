import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PermissionsService } from './modules/permissions/permissions.service';
import { UsersService } from './modules/users/users.service';
import { ReferencesSeedService } from './modules/references/references-seed.service';
import { AccountingSeedService } from './modules/accounting/accounting-seed.service';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
    private readonly referencesSeed: ReferencesSeedService,
    private readonly accountingSeed: AccountingSeedService,
  ) {}

  /** Tartib muhim: huquqlar -> doimiy rollar -> administrator -> ma'lumotnomalar */
  async onApplicationBootstrap() {
    await this.permissionsService.seed();
    await this.permissionsService.seedSystemRoles();
    await this.usersService.seedAdmin();
    await this.referencesSeed.seed();
    await this.accountingSeed.seed();
  }
}
