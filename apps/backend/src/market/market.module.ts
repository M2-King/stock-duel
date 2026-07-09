import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { MarketEngine } from './market.engine';

@Module({
  providers: [MarketEngine, MarketService],
  controllers: [MarketController],
  exports: [MarketEngine, MarketService],
})
export class MarketModule {}
