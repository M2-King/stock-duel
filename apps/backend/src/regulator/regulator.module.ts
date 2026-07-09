import { Module } from '@nestjs/common';
import { RegulatorService } from './regulator.service';
import { RegulatorController } from './regulator.controller';
import { RestrictionsModule } from './restrictions.module';
import { DealerModule } from '../dealer/dealer.module';
import { MatchModule } from '../match/match.module';

@Module({
  imports: [DealerModule, MatchModule, RestrictionsModule],
  providers: [RegulatorService],
  controllers: [RegulatorController],
  exports: [RegulatorService],
})
export class RegulatorModule {}
