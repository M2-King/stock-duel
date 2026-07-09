import { Module } from '@nestjs/common';
import { StockRestrictionsService } from './stock-restrictions.service';
import { MatchModule } from '../match/match.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [MatchModule, MarketModule],
  providers: [StockRestrictionsService],
  exports: [StockRestrictionsService],
})
export class RestrictionsModule {}
