import { Module } from '@nestjs/common';
import { DealerService } from './dealer.service';
import { DealerController } from './dealer.controller';
import { MarketModule } from '../market/market.module';
import { MatchModule } from '../match/match.module';
import { RestrictionsModule } from '../regulator/restrictions.module';

@Module({
  imports: [MarketModule, MatchModule, RestrictionsModule],
  providers: [DealerService],
  controllers: [DealerController],
  exports: [DealerService],
})
export class DealerModule {}
