import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MatchService } from './match.service';
import { Ok } from '../common/response';

@Controller('match')
export class MatchController {
  constructor(private readonly match: MatchService) {}

  /** POST /api/match/quick-match → { userId, preferredRole?, playerCount? } */
  @Post('quick-match')
  async quick(@Body() body: { userId: string; preferredRole?: any; playerCount?: number }) {
    return this.match.quickMatch(body?.userId, body?.preferredRole, body?.playerCount);
  }

  /** POST /api/match/create-room → { hostId, playerCount? } */
  @Post('create-room')
  async create(@Body() body: { hostId: string; playerCount?: number }) {
    return this.match.createRoom(body?.hostId, body?.playerCount);
  }

  /** POST /api/match/solo → 单人 demo，立即开局，对手为 AI bot
   *  body: { userId, role?: 'dealer' | 'retail' | 'regulator' } */
  @Post('solo')
  async solo(@Body() body: { userId: string; role?: 'dealer' | 'retail' | 'regulator' }) {
    return this.match.solo(body?.userId, body?.role);
  }

  /** POST /api/match/join-room → { userId, code } */
  @Post('join-room')
  async join(@Body() body: { userId: string; code: string }) {
    return this.match.joinRoom(body?.userId, body?.code);
  }

  /** POST /api/match/cancel-waiting → { userId } */
  @Post('cancel-waiting')
  async cancel(@Body() body: { userId: string }) {
    return this.match.cancelWaiting(body?.userId);
  }

  /** GET /api/match/lobby → 大厅 (静态路径必须放在 :id 之前，否则会被 :id 捕获) */
  @Get('lobby')
  async lobby() {
    return this.match.listLobby();
  }

  /** GET /api/match/:id */
  @Get(':id')
  async info(@Param('id') id: string) {
    return this.match.getMatch(id);
  }
}
