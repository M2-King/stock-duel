import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { MarketModule } from './market/market.module';
import { MatchModule } from './match/match.module';
import { TradingModule } from './trading/trading.module';
import { DealerModule } from './dealer/dealer.module';
import { RegulatorModule } from './regulator/regulator.module';
import { ReplayModule } from './replay/replay.module';
import { GatewayModule } from './gateway/gateway.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    MarketModule,
    MatchModule,
    TradingModule,
    DealerModule,
    RegulatorModule,
    ReplayModule,
    GatewayModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
