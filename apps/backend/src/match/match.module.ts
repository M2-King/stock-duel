import { Module } from '@nestjs/common';
import { MatchService } from './match.service';
import { MatchController } from './match.controller';
import { MarketModule } from '../market/market.module';
import { ReplayModule } from '../replay/replay.module';

@Module({
  imports: [MarketModule, ReplayModule],
  providers: [MatchService],
  controllers: [MatchController],
  exports: [MatchService],
})
export class MatchModule {}
