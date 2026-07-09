import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/guest → { userId?, token? } */
  @Post('guest')
  async guest(@Body() body: { userId?: string; token?: string }) {
    return this.auth.guestLogin(body?.userId || body?.token);
  }

  /** GET /api/auth/guest → convenience alias so a bare GET also creates a guest session */
  @Get('guest')
  async guestGet(@Query('token') token?: string, @Query('userId') userId?: string) {
    return this.auth.guestLogin(userId || token);
  }

  /** POST /api/auth/verify → { user } */
  @Post('verify')
  async verify(@Headers('authorization') authHeader: string) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '');
    return this.auth.verify(token);
  }
}
