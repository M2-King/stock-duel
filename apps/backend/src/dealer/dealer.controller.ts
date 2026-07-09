import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { DealerService } from './dealer.service';
import { Ok } from '../common/response';

@Controller('dealer')
export class DealerController {
  constructor(private readonly dealer: DealerService) {}

  /** POST /api/dealer/action → 执行 6 种工具 */
  @Post('action')
  async action(@Body() body: any) {
    return this.dealer.action(body);
  }

  /** POST /api/dealer/insider → 买内幕消息 */
  @Post('insider')
  async insider(@Body() body: { matchId: string; userId: string }) {
    return this.dealer.insider(body);
  }

  /** GET /api/dealer/resources → 查庄家资源 */
  @Get('resources')
  async resources(@Query('matchId') matchId: string, @Query('userId') userId: string) {
    return Ok(this.dealer.resources(matchId, userId));
  }

  /**
   * GET /api/dealer/preview-cost?type=pump&power=50&symbol=AAPL
   * 前端 power 滑块拖动时实时调，得到 cost + 涨跌停 + 昨收
   */
  @Get('preview-cost')
  async previewCost(
    @Query('type') type: any,
    @Query('power') power: string,
    @Query('symbol') symbol: string,
  ) {
    const p = Math.max(1, Math.min(100, Math.floor(Number(power) || 50)));
    return Ok(this.dealer.previewCost(type, p, symbol));
  }
}
