import { Body, Controller, Get, Query, Post } from '@nestjs/common';
import { TradingService } from './trading.service';
import { Ok } from '../common/response';
import { DatabaseService } from '../database/database.service';

@Controller('trade')
export class TradingController {
  constructor(
    private readonly trading: TradingService,
    private readonly db: DatabaseService,
  ) {}

  @Post('buy')
  async buy(@Body() body: any) {
    return this.trading.buy(body);
  }

  @Post('sell')
  async sell(@Body() body: any) {
    return this.trading.sell(body);
  }

  @Get('portfolio')
  async portfolio(@Query('matchId') matchId: string, @Query('userId') userId: string) {
    return this.trading.portfolio(matchId, userId);
  }

  @Get('orders')
  async orders(@Query('matchId') matchId: string, @Query('userId') userId: string) {
    const rows = this.db.prepare(
      `SELECT * FROM orders WHERE user_id = ? AND (match_id = ? OR match_id IS NULL)
       ORDER BY created_at DESC LIMIT 50`,
    ).all(userId, matchId);
    return Ok(rows);
  }
}
