import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { assertInsideNetwork } from '../network-restriction';

/** Token tekshiruvi + tizim faqat ombor tarmog'idan ishlaydi (network-restriction.ts) */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    const req = context.switchToHttp().getRequest();
    assertInsideNetwork(req.user, req);
    return ok;
  }
}
