import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { AuthModule } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { TradingModule } from '../trading/trading.module';
import { DealerModule } from '../dealer/dealer.module';
import { RegulatorModule } from '../regulator/regulator.module';
import { MatchModule } from '../match/match.module';

@Module({
  imports: [AuthModule, MarketModule, TradingModule, DealerModule, RegulatorModule, MatchModule],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class GatewayModule {}
