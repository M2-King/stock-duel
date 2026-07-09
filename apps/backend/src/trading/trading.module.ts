import { Module } from '@nestjs/common';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { MarketModule } from '../market/market.module';
import { MatchModule } from '../match/match.module';
import { RegulatorModule } from '../regulator/regulator.module';
import { RestrictionsModule } from '../regulator/restrictions.module';

@Module({
  imports: [MarketModule, MatchModule, RestrictionsModule],
  providers: [TradingService],
  controllers: [TradingController],
  exports: [TradingService],
})
export class TradingModule {}
