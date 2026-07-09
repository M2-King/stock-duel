import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RegulatorService } from './regulator.service';
import { Ok } from '../common/response';

@Controller('regulator')
export class RegulatorController {
  constructor(private readonly reg: RegulatorService) {}

  /** GET /api/regulator/alerts */
  @Get('alerts')
  async alerts(@Query('matchId') matchId: string) {
    return this.reg.alerts(matchId);
  }

  /** POST /api/regulator/resolve */
  @Post('resolve')
  async resolve(@Body() body: { matchId: string; alertId: string; action: 'warn' | 'freeze' | 'kick' | 'dismiss' }) {
    return this.reg.resolve(body);
  }

  /** GET /api/regulator/scores?matchId=... */
  @Get('scores')
  async scores(@Query('matchId') matchId: string) {
    return Ok({
      indices: this.reg.getScores(matchId),
      justiceScore: this.reg.getJusticeScore(matchId),
    });
  }

  /** GET /api/regulator/settlement?matchId=...&userId=...&role=...&finalAssets=... */
  @Get('settlement')
  async settlement(
    @Query('matchId') matchId: string,
    @Query('userId') userId: string,
    @Query('role') role: 'dealer' | 'retail' | 'regulator',
    @Query('finalAssets') finalAssets: string,
  ) {
    return this.reg.settlement(matchId, userId, role, Number(finalAssets));
  }
}
